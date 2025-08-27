import { NextRequest, NextResponse } from 'next/server';
import { DeviceAuthStorage, type DeviceAuthData } from '@/lib/redis';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { client_id, scope } = body;

    // Validate required parameters
    if (!client_id) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Missing client_id parameter' },
        { status: 400 }
      );
    }

    // Generate device code and user code
    const device_code = generateSecureCode(32);
    const user_code = generateUserCode();
    
    // Configuration
    const verification_uri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost'}/device`;
    const verification_uri_complete = `${verification_uri}?user_code=${user_code}`;
    const expires_in = 1800; // 30 minutes
    const interval = 5; // 5 seconds

    // Create device authorization data
    const deviceAuthData: DeviceAuthData = {
      device_code,
      user_code,
      verification_uri,
      verification_uri_complete,
      expires_in,
      interval,
      created_at: Date.now()
    };

    // Store in Redis
    await DeviceAuthStorage.storeDeviceAuth(deviceAuthData);

    // Return response according to RFC 8628
    return NextResponse.json({
      device_code,
      user_code,
      verification_uri,
      verification_uri_complete,
      expires_in,
      interval
    });

  } catch (error) {
    console.error('[DEVICE_AUTH] Failed to create device authorization:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate a secure random code for device_code
 */
function generateSecureCode(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

/**
 * Generate a user-friendly code (XXXX-XXXX format)
 */
function generateUserCode(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  for (let i = 0; i < 8; i++) {
    if (i === 4) {
      result += '-';
    }
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
}