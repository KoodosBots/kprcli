import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { DeviceAuthStorage } from '@/lib/redis';
import { KprCliAuthBridge } from '@/lib/auth-bridge-supabase';
import { TelegramNotifications } from '@/lib/telegram-notifications';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { user_code } = body;

    if (!user_code) {
      return NextResponse.json(
        { error: 'Missing user_code parameter' },
        { status: 400 }
      );
    }

    // Get device authorization data
    const deviceAuth = await DeviceAuthStorage.getDeviceAuthByUserCode(user_code);
    
    if (!deviceAuth) {
      return NextResponse.json(
        { error: 'Invalid or expired user code' },
        { status: 400 }
      );
    }

    // Check if expired
    const now = Date.now();
    const expiresAt = deviceAuth.created_at + (deviceAuth.expires_in * 1000);
    
    if (now > expiresAt) {
      // Clean up expired token
      await DeviceAuthStorage.deleteDeviceAuth(deviceAuth.device_code, user_code);
      return NextResponse.json(
        { error: 'User code has expired' },
        { status: 400 }
      );
    }

    // Check if already authorized
    if (deviceAuth.authorized) {
      return NextResponse.json(
        { error: 'Device already authorized' },
        { status: 400 }
      );
    }

    // Authorize the device
    const success = await DeviceAuthStorage.authorizeDevice(user_code, userId);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to authorize device' },
        { status: 500 }
      );
    }

    // Get user information for notifications
    const user = await KprCliAuthBridge.getKprCliUserByClerkId(userId);
    
    if (user && user.telegram_id) {
      // Send Telegram notification
      await TelegramNotifications.sendDeviceAuthNotification(user, {
        type: 'device_authorized',
        userCode: user_code,
        deviceInfo: 'KprCli',
        authorizedAt: new Date()
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Device authorized successfully',
      user_code: user_code
    });

  } catch (error) {
    console.error('[DEVICE_VERIFY] Failed to verify device:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const user_code = searchParams.get('user_code');

    if (!user_code) {
      return NextResponse.json(
        { error: 'Missing user_code parameter' },
        { status: 400 }
      );
    }

    // Get device authorization data (for displaying info to user)
    const deviceAuth = await DeviceAuthStorage.getDeviceAuthByUserCode(user_code);
    
    if (!deviceAuth) {
      return NextResponse.json(
        { error: 'Invalid or expired user code' },
        { status: 404 }
      );
    }

    // Check if expired
    const now = Date.now();
    const expiresAt = deviceAuth.created_at + (deviceAuth.expires_in * 1000);
    
    if (now > expiresAt) {
      // Clean up expired token
      await DeviceAuthStorage.deleteDeviceAuth(deviceAuth.device_code, user_code);
      return NextResponse.json(
        { error: 'User code has expired' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      user_code: deviceAuth.user_code,
      authorized: deviceAuth.authorized || false,
      expires_at: new Date(expiresAt).toISOString(),
      time_remaining: Math.max(0, Math.floor((expiresAt - now) / 1000))
    });

  } catch (error) {
    console.error('[DEVICE_VERIFY] Failed to get device info:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}