// Session Analytics API Endpoint
// Provides host computer session tracking data for monitoring and debugging

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSessionAnalytics, extractSessionInfo } from '@/lib/session-middleware';

export async function GET(request: NextRequest) {
  try {
    // Check authentication - only authenticated users can view analytics
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const clientIP = searchParams.get('ip');
    const includeCurrentSession = searchParams.get('current') === 'true';
    
    let analytics;
    
    if (clientIP) {
      // Get analytics for specific host computer
      analytics = await getSessionAnalytics(clientIP);
    } else if (includeCurrentSession) {
      // Get analytics for current session's host
      const { clientIP: currentIP } = extractSessionInfo(request);
      analytics = await getSessionAnalytics(currentIP);
    } else {
      // Return available endpoints
      analytics = {
        message: 'Session Analytics API',
        endpoints: {
          'GET /api/session/analytics?ip=<client-ip>': 'Get analytics for specific host computer',
          'GET /api/session/analytics?current=true': 'Get analytics for current session host',
          'GET /api/session/current': 'Get current session information'
        },
        example: '/api/session/analytics?ip=192.168.1.100'
      };
    }
    
    return NextResponse.json(analytics);
    
  } catch (error) {
    console.error('[SESSION-ANALYTICS] Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve session analytics' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, clientIP } = body;
    
    if (action === 'cleanup' && clientIP) {
      // Future: Could implement session cleanup for specific host
      return NextResponse.json({
        message: 'Session cleanup not yet implemented',
        clientIP
      });
    }
    
    return NextResponse.json({
      error: 'Invalid action',
      availableActions: ['cleanup']
    }, { status: 400 });
    
  } catch (error) {
    console.error('[SESSION-ANALYTICS] POST Error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}