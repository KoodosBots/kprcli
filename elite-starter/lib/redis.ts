/**
 * Redis client for KprCli authentication and caching
 * Handles device authorization tokens, user sessions, and temporary data
 */

import { createClient } from 'redis';

// Redis configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Create Redis client
let redis: ReturnType<typeof createClient> | null = null;

export function getRedisClient() {
  if (!redis) {
    redis = createClient({
      url: REDIS_URL,
      socket: {
        connectTimeout: 2000,
        reconnectStrategy: () => false // Don't retry
      }
    });

    redis.on('error', (err) => {
      console.error('[REDIS] Connection error:', err.code || err.message);
    });

    redis.on('connect', () => {
      console.log('[REDIS] Connected successfully');
    });

    redis.on('ready', () => {
      console.log('[REDIS] Client ready');
    });

    redis.on('end', () => {
      console.log('[REDIS] Connection closed');
    });
  }

  return redis;
}

// Initialize Redis connection with fallback
export async function initRedis(): Promise<ReturnType<typeof createClient> | null> {
  try {
    const client = getRedisClient();
    if (!client.isOpen) {
      // Set a timeout for connection
      const connectPromise = client.connect();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 3000)
      );
      
      await Promise.race([connectPromise, timeoutPromise]);
    }
    return client;
  } catch (error) {
    console.warn('[REDIS] Connection failed, using memory fallback:', error instanceof Error ? error.message : String(error));
    return null; // Return null to indicate fallback mode
  }
}

// In-memory fallback storage
const memoryStorage = new Map<string, { value: string; expiresAt: number }>();

// Helper to clean up expired memory storage
function cleanupMemoryStorage() {
  const now = Date.now();
  for (const [key, item] of memoryStorage.entries()) {
    if (item.expiresAt < now) {
      memoryStorage.delete(key);
    }
  }
}

// Fallback storage methods
export const MemoryStorage = {
  async setEx(key: string, ttl: number, value: string): Promise<void> {
    cleanupMemoryStorage();
    memoryStorage.set(key, {
      value,
      expiresAt: Date.now() + (ttl * 1000)
    });
  },

  async get(key: string): Promise<string | null> {
    cleanupMemoryStorage();
    const item = memoryStorage.get(key);
    if (!item || item.expiresAt < Date.now()) {
      memoryStorage.delete(key);
      return null;
    }
    return item.value;
  },

  async del(key: string): Promise<void> {
    memoryStorage.delete(key);
  },

  async ttl(key: string): Promise<number> {
    const item = memoryStorage.get(key);
    if (!item) return -2; // Key doesn't exist
    const remainingTtl = Math.ceil((item.expiresAt - Date.now()) / 1000);
    return remainingTtl > 0 ? remainingTtl : -1; // -1 for expired
  }
};

// Device authorization storage
export interface DeviceAuthData {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
  clerk_user_id?: string;
  authorized?: boolean;
  created_at: number;
}

export class DeviceAuthStorage {
  private static readonly DEVICE_CODE_PREFIX = 'device_auth:device:';
  private static readonly USER_CODE_PREFIX = 'device_auth:user:';
  private static readonly TELEGRAM_TOKEN_PREFIX = 'telegram_link:';
  
  /**
   * Store device authorization data
   */
  static async storeDeviceAuth(data: DeviceAuthData): Promise<void> {
    try {
      const client = await initRedis();
      const ttl = data.expires_in;
      const deviceKey = `${this.DEVICE_CODE_PREFIX}${data.device_code}`;
      const userKey = `${this.USER_CODE_PREFIX}${data.user_code}`;
      const jsonData = JSON.stringify(data);
      
      if (client) {
        // Use Redis
        await client.setEx(deviceKey, ttl, jsonData);
        await client.setEx(userKey, ttl, jsonData);
      } else {
        // Use memory fallback
        await MemoryStorage.setEx(deviceKey, ttl, jsonData);
        await MemoryStorage.setEx(userKey, ttl, jsonData);
      }
      
    } catch (error) {
      console.error('[REDIS] Failed to store device auth:', error);
      throw error;
    }
  }
  
  /**
   * Get device authorization data by device code
   */
  static async getDeviceAuthByDeviceCode(deviceCode: string): Promise<DeviceAuthData | null> {
    try {
      const client = await initRedis();
      const key = `${this.DEVICE_CODE_PREFIX}${deviceCode}`;
      
      let data: string | null;
      if (client) {
        data = await client.get(key);
      } else {
        data = await MemoryStorage.get(key);
      }
      
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[REDIS] Failed to get device auth by device code:', error);
      return null;
    }
  }
  
  /**
   * Get device authorization data by user code
   */
  static async getDeviceAuthByUserCode(userCode: string): Promise<DeviceAuthData | null> {
    try {
      const client = await initRedis();
      if (!client) {
        // Use memory fallback
        const key = `${this.USER_CODE_PREFIX}${userCode}`;
        const stored = memoryStorage.get(key);
        if (!stored || Date.now() > stored.expiresAt) {
          memoryStorage.delete(key);
          return null;
        }
        return JSON.parse(stored.value);
      }
      
      const data = await client.get(`${this.USER_CODE_PREFIX}${userCode}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[REDIS] Failed to get device auth by user code:', error);
      return null;
    }
  }
  
  /**
   * Update device authorization with user approval
   */
  static async authorizeDevice(userCode: string, clerkUserId: string): Promise<boolean> {
    try {
      const client = await initRedis();
      
      // Get current data
      const data = await this.getDeviceAuthByUserCode(userCode);
      if (!data) return false;
      
      // Update authorization status
      const updatedData: DeviceAuthData = {
        ...data,
        clerk_user_id: clerkUserId,
        authorized: true
      };
      
      if (!client) {
        // Memory fallback
        const userKey = `${this.USER_CODE_PREFIX}${userCode}`;
        const deviceKey = `${this.DEVICE_CODE_PREFIX}${data.device_code}`;
        const expiresAt = Date.now() + (data.expires_in * 1000);
        
        memoryStorage.set(userKey, { value: JSON.stringify(updatedData), expiresAt });
        memoryStorage.set(deviceKey, { value: JSON.stringify(updatedData), expiresAt });
        return true;
      }
      
      // Calculate remaining TTL
      const ttl = await client.ttl(`${this.USER_CODE_PREFIX}${userCode}`);
      if (ttl <= 0) return false;
      
      // Update both records
      await client.setEx(
        `${this.DEVICE_CODE_PREFIX}${data.device_code}`,
        ttl,
        JSON.stringify(updatedData)
      );
      
      await client.setEx(
        `${this.USER_CODE_PREFIX}${userCode}`,
        ttl,
        JSON.stringify(updatedData)
      );
      
      return true;
    } catch (error) {
      console.error('[REDIS] Failed to authorize device:', error);
      return false;
    }
  }
  
  /**
   * Delete device authorization data
   */
  static async deleteDeviceAuth(deviceCode: string, userCode: string): Promise<void> {
    try {
      const client = await initRedis();
      
      if (!client) {
        // Memory fallback
        memoryStorage.delete(`${this.DEVICE_CODE_PREFIX}${deviceCode}`);
        memoryStorage.delete(`${this.USER_CODE_PREFIX}${userCode}`);
        return;
      }
      
      await Promise.all([
        client.del(`${this.DEVICE_CODE_PREFIX}${deviceCode}`),
        client.del(`${this.USER_CODE_PREFIX}${userCode}`)
      ]);
      
    } catch (error) {
      console.error('[REDIS] Failed to delete device auth:', error);
    }
  }
  
  /**
   * Store Telegram linking token
   */
  static async storeTelegramToken(token: string, clerkId: string, expiresIn: number): Promise<void> {
    try {
      const client = await initRedis();
      
      const tokenData = {
        clerkId,
        expiresAt: Date.now() + (expiresIn * 1000)
      };
      
      if (!client) {
        // Memory fallback
        const key = `${this.TELEGRAM_TOKEN_PREFIX}${token}`;
        const expiresAt = Date.now() + (expiresIn * 1000);
        memoryStorage.set(key, { value: JSON.stringify(tokenData), expiresAt });
        return;
      }
      
      await client.setEx(
        `${this.TELEGRAM_TOKEN_PREFIX}${token}`,
        expiresIn,
        JSON.stringify(tokenData)
      );
      
    } catch (error) {
      console.error('[REDIS] Failed to store Telegram token:', error);
      throw error;
    }
  }
  
  /**
   * Verify and consume Telegram linking token
   */
  static async verifyTelegramToken(token: string): Promise<string | null> {
    try {
      const client = await initRedis();
      
      if (!client) {
        // Memory fallback
        const key = `${this.TELEGRAM_TOKEN_PREFIX}${token}`;
        const stored = memoryStorage.get(key);
        if (!stored) return null;
        
        const tokenData = JSON.parse(stored.value);
        if (tokenData.expiresAt < Date.now()) {
          memoryStorage.delete(key);
          return null;
        }
        
        // Delete token after verification (one-time use)
        memoryStorage.delete(key);
        return tokenData.clerkId;
      }
      
      const data = await client.get(`${this.TELEGRAM_TOKEN_PREFIX}${token}`);
      if (!data) return null;
      
      const tokenData = JSON.parse(data);
      if (tokenData.expiresAt < Date.now()) {
        await client.del(`${this.TELEGRAM_TOKEN_PREFIX}${token}`);
        return null;
      }
      
      // Delete token after verification (one-time use)
      await client.del(`${this.TELEGRAM_TOKEN_PREFIX}${token}`);
      
      return tokenData.clerkId;
    } catch (error) {
      console.error('[REDIS] Failed to verify Telegram token:', error);
      return null;
    }
  }
  
  /**
   * Clean up expired tokens (maintenance function)
   */
  static async cleanupExpiredTokens(): Promise<void> {
    try {
      const client = await initRedis();
      
      if (!client) {
        // Memory fallback cleanup
        cleanupMemoryStorage();
        return;
      }
      
      // Get all keys with our prefixes (including session keys)
      const patterns = [
        `${this.DEVICE_CODE_PREFIX}*`,
        `${this.USER_CODE_PREFIX}*`,
        `${this.TELEGRAM_TOKEN_PREFIX}*`,
        `${SessionStorage.SESSION_PREFIX}*`
      ];
      
      for (const pattern of patterns) {
        const keys = await client.keys(pattern);
        
        for (const key of keys) {
          const ttl = await client.ttl(key);
          if (ttl <= 0) {
            await client.del(key);
          }
        }
      }
      
    } catch (error) {
      console.error('[REDIS] Failed to cleanup expired tokens:', error);
    }
  }
}

// Session data structure for host computer tracking
export interface HostSession {
  sessionId: string;
  clientIP: string;
  userAgent: string;
  firstSeen: number;
  lastSeen: number;
  requestCount: number;
  clerkUserId?: string;
  deviceFingerprint?: {
    browser: string;
    platform: string;
    language: string;
    timezone: string;
    screenResolution?: string;
  };
  geolocation?: {
    country?: string;
    city?: string;
    timezone?: string;
  };
}

// Session Storage for Host Computer Tracking
export class SessionStorage {
  static readonly SESSION_PREFIX = 'kprcli:session:';
  static readonly HOST_PREFIX = 'kprcli:host:';
  static readonly REQUEST_PREFIX = 'kprcli:request:';
  
  /**
   * Store or update host computer session
   */
  static async upsertHostSession(sessionData: Partial<HostSession>): Promise<void> {
    try {
      const client = await initRedis();
      const sessionKey = `${this.SESSION_PREFIX}${sessionData.sessionId}`;
      const hostKey = `${this.HOST_PREFIX}${sessionData.clientIP}`;
      
      if (!client) {
        // Memory fallback
        const session = {
          ...sessionData,
          lastSeen: Date.now(),
          requestCount: (sessionData.requestCount || 0) + 1
        };
        memoryStorage.set(sessionKey, { 
          value: JSON.stringify(session), 
          expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        });
        memoryStorage.set(hostKey, { 
          value: JSON.stringify(session), 
          expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
        });
        return;
      }
      
      // Get existing session
      const existingData = await client.get(sessionKey);
      const existing: HostSession = existingData ? JSON.parse(existingData) : {};
      
      // Merge with new data
      const updated: HostSession = {
        ...existing,
        ...sessionData,
        lastSeen: Date.now(),
        requestCount: (existing.requestCount || 0) + 1,
        firstSeen: existing.firstSeen || Date.now()
      };
      
      // Store session data (24 hour expiry)
      await client.setEx(sessionKey, 24 * 60 * 60, JSON.stringify(updated));
      
      // Store host data (7 day expiry for longer tracking)
      await client.setEx(hostKey, 7 * 24 * 60 * 60, JSON.stringify(updated));
      
    } catch (error) {
      console.error('[SESSION] Failed to store session:', error);
    }
  }

  /**
   * Get session data by session ID
   */
  static async getSession(sessionId: string): Promise<HostSession | null> {
    try {
      const client = await initRedis();
      const key = `${this.SESSION_PREFIX}${sessionId}`;
      
      if (!client) {
        // Memory fallback
        const stored = memoryStorage.get(key);
        if (!stored || Date.now() > stored.expiresAt) {
          memoryStorage.delete(key);
          return null;
        }
        return JSON.parse(stored.value);
      }
      
      const data = await client.get(key);
      return data ? JSON.parse(data) : null;
      
    } catch (error) {
      console.error('[SESSION] Failed to get session:', error);
      return null;
    }
  }

  /**
   * Get all sessions for a host (by IP)
   */
  static async getHostSessions(clientIP: string): Promise<HostSession | null> {
    try {
      const client = await initRedis();
      const key = `${this.HOST_PREFIX}${clientIP}`;
      
      if (!client) {
        // Memory fallback
        const stored = memoryStorage.get(key);
        if (!stored || Date.now() > stored.expiresAt) {
          memoryStorage.delete(key);
          return null;
        }
        return JSON.parse(stored.value);
      }
      
      const data = await client.get(key);
      return data ? JSON.parse(data) : null;
      
    } catch (error) {
      console.error('[SESSION] Failed to get host sessions:', error);
      return null;
    }
  }

  /**
   * Track request with correlation ID
   */
  static async trackRequest(requestId: string, sessionId: string, requestData: {
    method: string;
    url: string;
    userAgent: string;
    timestamp: number;
    responseStatus?: number;
    responseTime?: number;
  }): Promise<void> {
    try {
      const client = await initRedis();
      const key = `${this.REQUEST_PREFIX}${requestId}`;
      
      const data = {
        ...requestData,
        sessionId,
        requestId
      };
      
      if (!client) {
        // Memory fallback (shorter expiry for requests)
        memoryStorage.set(key, { 
          value: JSON.stringify(data), 
          expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour
        });
        return;
      }
      
      // Store request data (1 hour expiry)
      await client.setEx(key, 60 * 60, JSON.stringify(data));
      
    } catch (error) {
      console.error('[SESSION] Failed to track request:', error);
    }
  }

  /**
   * Get analytics for host computer sessions
   */
  static async getHostAnalytics(clientIP: string): Promise<{
    totalSessions: number;
    totalRequests: number;
    firstSeen?: number;
    lastSeen?: number;
    uniqueUserAgents: string[];
    authenticatedSessions: number;
  }> {
    try {
      const hostData = await this.getHostSessions(clientIP);
      
      if (!hostData) {
        return {
          totalSessions: 0,
          totalRequests: 0,
          uniqueUserAgents: [],
          authenticatedSessions: 0
        };
      }
      
      return {
        totalSessions: 1, // For now, simplified to single session per host
        totalRequests: hostData.requestCount,
        firstSeen: hostData.firstSeen,
        lastSeen: hostData.lastSeen,
        uniqueUserAgents: [hostData.userAgent],
        authenticatedSessions: hostData.clerkUserId ? 1 : 0
      };
      
    } catch (error) {
      console.error('[SESSION] Failed to get analytics:', error);
      return {
        totalSessions: 0,
        totalRequests: 0,
        uniqueUserAgents: [],
        authenticatedSessions: 0
      };
    }
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  if (redis && redis.isOpen) {
    console.log('[REDIS] Closing connection...');
    await redis.quit();
  }
});

process.on('SIGTERM', async () => {
  if (redis && redis.isOpen) {
    console.log('[REDIS] Closing connection...');
    await redis.quit();
  }
});