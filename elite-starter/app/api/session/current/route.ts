// Current Session API Endpoint
// Returns information about the current host computer session

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { extractSessionInfo, extractDeviceFingerprint } from '@/lib/session-middleware';
import { SessionStorage } from '@/lib/redis';

export async function GET(request: NextRequest) {
  try {
    // Extract session information from headers
    const { sessionId, clientIP, userAgent, requestId } = extractSessionInfo(request);
    const deviceFingerprint = extractDeviceFingerprint(request);
    
    // Get authentication status
    const { userId } = await auth();
    
    // Get stored session data from Redis
    const storedSession = await SessionStorage.getSession(sessionId);
    const hostAnalytics = await SessionStorage.getHostAnalytics(clientIP);
    
    const currentSession = {
      // Current request info
      current: {
        sessionId,
        clientIP,
        userAgent,
        requestId,
        deviceFingerprint,
        timestamp: Date.now(),
        authenticated: !!userId,
        clerkUserId: userId || null
      },
      
      // Stored session data
      stored: storedSession,
      
      // Host analytics
      analytics: hostAnalytics,
      
      // Headers received from nginx
      nginxHeaders: {
        sessionId: request.headers.get('x-session-id'),
        realIP: request.headers.get('x-real-ip'),
        forwardedFor: request.headers.get('x-forwarded-for'),
        clientIP: request.headers.get('x-client-ip'),
        requestId: request.headers.get('x-request-id'),
        userAgent: request.headers.get('x-user-agent')
      }
    };
    
    return NextResponse.json(currentSession);
    
  } catch (error) {
    console.error('[SESSION-CURRENT] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to retrieve session information',
        timestamp: Date.now()
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Update current session with additional information
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required to update session' },
        { status: 401 }
      );
    }
    
    const body = await request.json();
    const { sessionId, clientIP } = extractSessionInfo(request);
    
    // Update session with any additional data provided
    await SessionStorage.upsertHostSession({
      sessionId,
      clientIP,
      clerkUserId: userId,
      ...body // Allow additional session data updates
    });
    
    return NextResponse.json({
      message: 'Session updated successfully',
      sessionId,
      clientIP,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('[SESSION-CURRENT] PUT Error:', error);
    return NextResponse.json(
      { error: 'Failed to update session' },
      { status: 500 }
    );
  }
}