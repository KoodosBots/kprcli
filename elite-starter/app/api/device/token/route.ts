import { NextRequest, NextResponse } from 'next/server';
import { DeviceAuthStorage } from '@/lib/redis';
import { KprCliAuthBridge } from '@/lib/auth-bridge-supabase';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const ACCESS_TOKEN_EXPIRES_IN = 3600; // 1 hour

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { grant_type, device_code, client_id } = body;

    // Validate grant type
    if (grant_type !== 'urn:ietf:params:oauth:grant-type:device_code') {
      return NextResponse.json(
        { error: 'unsupported_grant_type' },
        { status: 400 }
      );
    }

    // Validate required parameters
    if (!device_code || !client_id) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Get device authorization data
    const deviceAuth = await DeviceAuthStorage.getDeviceAuthByDeviceCode(device_code);
    
    if (!deviceAuth) {
      return NextResponse.json(
        { error: 'invalid_grant', error_description: 'Invalid or expired device code' },
        { status: 400 }
      );
    }

    // Check if expired
    const now = Date.now();
    const expiresAt = deviceAuth.created_at + (deviceAuth.expires_in * 1000);
    
    if (now > expiresAt) {
      // Clean up expired token
      await DeviceAuthStorage.deleteDeviceAuth(device_code, deviceAuth.user_code);
      return NextResponse.json(
        { error: 'expired_token' },
        { status: 400 }
      );
    }

    // Check if user has authorized the device
    if (!deviceAuth.authorized || !deviceAuth.clerk_user_id) {
      return NextResponse.json(
        { error: 'authorization_pending' },
        { status: 400 }
      );
    }

    // Get user information
    const user = await KprCliAuthBridge.getKprCliUserByClerkId(deviceAuth.clerk_user_id);
    
    if (!user) {
      return NextResponse.json(
        { error: 'invalid_grant', error_description: 'User not found' },
        { status: 400 }
      );
    }

    // Generate access token
    const accessToken = jwt.sign(
      {
        sub: user.clerk_user_id,
        email: user.email,
        user_id: user.id,
        subscription_tier: user.subscription_tier,
        subscription_status: user.subscription_status,
        iat: Math.floor(now / 1000),
        exp: Math.floor(now / 1000) + ACCESS_TOKEN_EXPIRES_IN
      },
      JWT_SECRET
    );

    // Generate refresh token (optional)
    const refreshToken = jwt.sign(
      {
        sub: user.clerk_user_id,
        type: 'refresh',
        iat: Math.floor(now / 1000),
        exp: Math.floor(now / 1000) + (30 * 24 * 60 * 60) // 30 days
      },
      JWT_SECRET
    );

    // Clean up device authorization data (one-time use)
    await DeviceAuthStorage.deleteDeviceAuth(device_code, deviceAuth.user_code);

    // Return access token response
    return NextResponse.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_EXPIRES_IN,
      refresh_token: refreshToken,
      scope: 'read write',
      user: {
        id: user.id,
        clerk_user_id: user.clerk_user_id,
        email: user.email,
        username: user.username,
        subscription_tier: user.subscription_tier,
        subscription_status: user.subscription_status,
        token_balance: user.token_balance,
        automation_credits: user.automation_credits
      }
    });

  } catch (error) {
    console.error('[DEVICE_AUTH] Failed to exchange device code for token:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500 }
    );
  }
}