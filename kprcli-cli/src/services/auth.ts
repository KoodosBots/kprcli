import axios from 'axios';
import open from 'open';
import jwt from 'jsonwebtoken';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';

export interface DeviceAuthResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  user: {
    id: string;
    clerk_user_id: string;
    email: string;
    username: string;
    subscription_tier: string;
    subscription_status: string;
    token_balance: number;
    automation_credits: number;
  };
}

export class AuthService {
  private config = new ConfigManager();
  private logger = new Logger('AUTH');
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost') {
    this.baseUrl = baseUrl;
  }

  /**
   * Initialize device authorization flow
   */
  async initiateDeviceAuth(): Promise<DeviceAuthResponse> {
    try {
      this.logger.info('Initiating device authorization flow...');
      
      const response = await axios.post(`${this.baseUrl}/api/device/authorize`, {
        client_id: 'kprcli',
        scope: 'read write'
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return response.data as DeviceAuthResponse;
    } catch (error: any) {
      this.logger.error('Failed to initiate device authorization', error);
      throw new Error(`Device authorization failed: ${error.message}`);
    }
  }

  /**
   * Poll for token after user authorization
   */
  async pollForToken(deviceCode: string, interval = 5): Promise<TokenResponse> {
    const maxAttempts = 360; // 30 minutes with 5-second intervals
    let attempts = 0;

    this.logger.info('Waiting for user authorization...');

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          attempts++;
          
          const response = await axios.post(`${this.baseUrl}/api/device/token`, {
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            device_code: deviceCode,
            client_id: 'kprcli'
          }, {
            headers: {
              'Content-Type': 'application/json'
            }
          });

          const tokenResponse = response.data as TokenResponse;
          this.logger.success('Authorization successful!');
          resolve(tokenResponse);

        } catch (error: any) {
          if (error.response?.status === 400) {
            const errorData = error.response.data;
            
            switch (errorData.error) {
              case 'authorization_pending':
                // Still waiting for user authorization
                if (attempts >= maxAttempts) {
                  reject(new Error('Authorization timed out. Please try again.'));
                } else {
                  setTimeout(poll, interval * 1000);
                }
                break;
              
              case 'expired_token':
                reject(new Error('Authorization expired. Please start over.'));
                break;
              
              case 'invalid_grant':
                reject(new Error('Invalid authorization. Please try again.'));
                break;
              
              default:
                reject(new Error(`Authorization failed: ${errorData.error_description || errorData.error}`));
            }
          } else {
            reject(new Error(`Network error: ${error.message}`));
          }
        }
      };

      poll();
    });
  }

  /**
   * Store authentication tokens
   */
  async storeTokens(tokenResponse: TokenResponse): Promise<void> {
    try {
      this.config.set('access_token', tokenResponse.access_token);
      this.config.set('refresh_token', tokenResponse.refresh_token);
      this.config.set('token_expires_at', Date.now() + (tokenResponse.expires_in * 1000));
      this.config.set('user', tokenResponse.user);
      
      this.logger.success('Authentication tokens stored successfully');
    } catch (error: any) {
      this.logger.error('Failed to store tokens', error);
      throw new Error(`Token storage failed: ${error.message}`);
    }
  }

  /**
   * Get current access token (with refresh if needed)
   */
  async getAccessToken(): Promise<string | null> {
    const token = this.config.get('access_token') as string;
    const expiresAt = this.config.get('token_expires_at') as number;

    if (!token) {
      return null;
    }

    // Check if token is expired (with 5-minute buffer)
    if (Date.now() >= (expiresAt - 300000)) {
      this.logger.info('Access token expired, attempting refresh...');
      const refreshed = await this.refreshToken();
      return refreshed ? this.config.get('access_token') as string : null;
    }

    return token;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = this.config.get('refresh_token') as string;
      
      if (!refreshToken) {
        this.logger.error('No refresh token available');
        return false;
      }

      // For now, we'll implement refresh by re-authenticating
      // In a full implementation, you'd have a refresh token endpoint
      this.logger.warn('Token refresh requires re-authentication');
      return false;

    } catch (error: any) {
      this.logger.error('Token refresh failed', error);
      return false;
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = this.config.get('access_token');
    const expiresAt = this.config.get('token_expires_at') as number;
    
    return !!(token && Date.now() < expiresAt);
  }

  /**
   * Get current user information
   */
  getCurrentUser(): any {
    return this.config.get('user');
  }

  /**
   * Logout - clear stored tokens
   */
  async logout(): Promise<void> {
    this.config.delete('access_token');
    this.config.delete('refresh_token');
    this.config.delete('token_expires_at');
    this.config.delete('user');
    
    this.logger.success('Logged out successfully');
  }

  /**
   * Open verification URL in browser
   */
  async openVerificationUrl(url: string): Promise<void> {
    try {
      await open(url);
      this.logger.info('Opened verification URL in browser');
    } catch (error: any) {
      this.logger.warn(`Could not open browser: ${error.message}`);
      this.logger.info(`Please manually open: ${url}`);
    }
  }

  /**
   * Make authenticated API request
   */
  async makeAuthenticatedRequest(endpoint: string, options: any = {}): Promise<any> {
    const token = await this.getAccessToken();
    
    if (!token) {
      throw new Error('Not authenticated. Please run: kprcli auth login');
    }

    try {
      const response = await axios({
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        this.logger.warn('Authentication expired. Please login again.');
        await this.logout();
        throw new Error('Authentication expired. Please run: kprcli auth login');
      }
      throw error;
    }
  }
}