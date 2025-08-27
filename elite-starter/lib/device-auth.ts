// Device Authorization Flow Implementation (RFC 8628)
// This module handles device authentication for CLI tools and Telegram bots

import crypto from 'crypto';

export interface DeviceAuthorizationRequest {
  clientId: string;
  deviceName?: string;
  deviceInfo?: {
    platform?: string;
    version?: string;
    hostname?: string;
  };
}

export interface DeviceAuthorizationResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export interface PendingAuthorization {
  deviceCode: string;
  userCode: string;
  clientId: string;
  deviceName?: string;
  deviceInfo?: any;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  userId?: string;
  createdAt: Date;
  expiresAt: Date;
  approvedAt?: Date;
  accessToken?: string;
}

// In-memory storage for development (replace with Redis in production)
const pendingAuthorizations = new Map<string, PendingAuthorization>();
const userCodeToDeviceCode = new Map<string, string>();

// Generate a user-friendly code (e.g., "CZKJ-QPWQ")
export function generateUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous characters
  let code = '';
  
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  
  return code;
}

// Generate a secure device code
export function generateDeviceCode(): string {
  return crypto.randomBytes(32).toString('base64url');
}

// Create a new device authorization
export async function createDeviceAuthorization(
  request: DeviceAuthorizationRequest
): Promise<DeviceAuthorizationResponse> {
  const deviceCode = generateDeviceCode();
  const userCode = generateUserCode();
  const expiresIn = 900; // 15 minutes
  const interval = 5; // Poll every 5 seconds
  
  const authorization: PendingAuthorization = {
    deviceCode,
    userCode,
    clientId: request.clientId,
    deviceName: request.deviceName,
    deviceInfo: request.deviceInfo,
    status: 'pending',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
  
  // Store the authorization
  pendingAuthorizations.set(deviceCode, authorization);
  userCodeToDeviceCode.set(userCode, deviceCode);
  
  // Schedule cleanup after expiration
  setTimeout(() => {
    const auth = pendingAuthorizations.get(deviceCode);
    if (auth && auth.status === 'pending') {
      auth.status = 'expired';
      setTimeout(() => {
        pendingAuthorizations.delete(deviceCode);
        userCodeToDeviceCode.delete(userCode);
      }, 60000); // Clean up after 1 minute
    }
  }, expiresIn * 1000);
  
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  return {
    deviceCode,
    userCode,
    verificationUri: `${baseUrl}/device`,
    verificationUriComplete: `${baseUrl}/device?user_code=${userCode}`,
    expiresIn,
    interval,
  };
}

// Find authorization by user code
export async function findAuthorizationByUserCode(
  userCode: string
): Promise<PendingAuthorization | null> {
  const deviceCode = userCodeToDeviceCode.get(userCode);
  if (!deviceCode) return null;
  
  const auth = pendingAuthorizations.get(deviceCode);
  if (!auth) return null;
  
  // Check if expired
  if (auth.expiresAt < new Date()) {
    auth.status = 'expired';
  }
  
  return auth;
}

// Find authorization by device code
export async function findAuthorizationByDeviceCode(
  deviceCode: string
): Promise<PendingAuthorization | null> {
  const auth = pendingAuthorizations.get(deviceCode);
  if (!auth) return null;
  
  // Check if expired
  if (auth.expiresAt < new Date()) {
    auth.status = 'expired';
  }
  
  return auth;
}

// Approve an authorization
export async function approveAuthorization(
  userCode: string,
  userId: string,
  accessToken: string
): Promise<boolean> {
  const auth = await findAuthorizationByUserCode(userCode);
  if (!auth || auth.status !== 'pending') return false;
  
  auth.status = 'approved';
  auth.userId = userId;
  auth.accessToken = accessToken;
  auth.approvedAt = new Date();
  
  return true;
}

// Deny an authorization
export async function denyAuthorization(userCode: string): Promise<boolean> {
  const auth = await findAuthorizationByUserCode(userCode);
  if (!auth || auth.status !== 'pending') return false;
  
  auth.status = 'denied';
  
  return true;
}

// Poll for token (used by CLI/bot)
export async function pollForToken(
  deviceCode: string
): Promise<{ status: string; accessToken?: string; error?: string }> {
  const auth = await findAuthorizationByDeviceCode(deviceCode);
  
  if (!auth) {
    return { status: 'error', error: 'invalid_request' };
  }
  
  switch (auth.status) {
    case 'pending':
      return { status: 'pending', error: 'authorization_pending' };
    case 'approved':
      return { status: 'approved', accessToken: auth.accessToken };
    case 'denied':
      return { status: 'denied', error: 'access_denied' };
    case 'expired':
      return { status: 'expired', error: 'expired_token' };
    default:
      return { status: 'error', error: 'invalid_request' };
  }
}

// Clean up expired authorizations periodically
setInterval(() => {
  const now = new Date();
  for (const [deviceCode, auth] of pendingAuthorizations) {
    if (auth.expiresAt < now && auth.status !== 'approved') {
      pendingAuthorizations.delete(deviceCode);
      userCodeToDeviceCode.delete(auth.userCode);
    }
  }
}, 60000); // Clean up every minute