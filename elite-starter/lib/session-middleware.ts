// Session Tracking Middleware for Host Computer Session Management
// Integrates with nginx headers to track host computers and sessions

import { NextRequest, NextResponse } from 'next/server';
import { SessionStorage, type HostSession } from './redis';

/**
 * Extract session and host information from nginx headers
 */
export function extractSessionInfo(request: NextRequest): {
  sessionId: string;
  clientIP: string;
  userAgent: string;
  requestId: string;
} {
  // Get session ID from nginx header or cookie
  const sessionId = request.headers.get('x-session-id') || 
                   request.cookies.get('session_id')?.value ||
                   'unknown-session';
  
  // Get client IP from nginx (real IP behind proxy)
  const clientIP = request.headers.get('x-real-ip') || 
                  request.headers.get('x-forwarded-for')?.split(',')[0] ||
                  request.headers.get('x-client-ip') ||
                  'unknown-ip';
  
  // Get user agent
  const userAgent = request.headers.get('user-agent') || 'unknown-agent';
  
  // Get request ID from nginx
  const requestId = request.headers.get('x-request-id') || 
                   `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  return { sessionId, clientIP, userAgent, requestId };
}

/**
 * Extract device fingerprinting information from headers
 */
export function extractDeviceFingerprint(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || '';
  const acceptLanguage = request.headers.get('accept-language') || '';
  const acceptEncoding = request.headers.get('accept-encoding') || '';
  
  // Simple browser detection
  let browser = 'unknown';
  if (userAgent.includes('Chrome')) browser = 'chrome';
  else if (userAgent.includes('Firefox')) browser = 'firefox';
  else if (userAgent.includes('Safari')) browser = 'safari';
  else if (userAgent.includes('Edge')) browser = 'edge';
  
  // Simple platform detection
  let platform = 'unknown';
  if (userAgent.includes('Windows')) platform = 'windows';
  else if (userAgent.includes('Mac')) platform = 'macos';
  else if (userAgent.includes('Linux')) platform = 'linux';
  else if (userAgent.includes('Android')) platform = 'android';
  else if (userAgent.includes('iOS')) platform = 'ios';
  
  // Language (first preference)
  const language = acceptLanguage.split(',')[0]?.split(';')[0] || 'unknown';
  
  return {
    browser,
    platform,
    language,
    timezone: 'unknown', // Could be enhanced with client-side JS
    userAgent
  };
}

/**
 * Track session activity - to be called in API routes or middleware
 */
export async function trackSessionActivity(
  request: NextRequest,
  clerkUserId?: string,
  responseStatus?: number,
  responseTime?: number
): Promise<void> {
  try {
    const { sessionId, clientIP, userAgent, requestId } = extractSessionInfo(request);
    const deviceFingerprint = extractDeviceFingerprint(request);
    
    // Update session in Redis
    await SessionStorage.upsertHostSession({
      sessionId,
      clientIP,
      userAgent,
      clerkUserId,
      deviceFingerprint
    });
    
    // Track individual request
    await SessionStorage.trackRequest(requestId, sessionId, {
      method: request.method,
      url: request.url,
      userAgent,
      timestamp: Date.now(),
      responseStatus,
      responseTime
    });
    
  } catch (error) {
    console.error('[SESSION-MIDDLEWARE] Failed to track session:', error);
    // Don't throw - session tracking shouldn't break the app
  }
}

/**
 * Middleware function to add session tracking headers to response
 */
export function addSessionTrackingHeaders(
  response: NextResponse,
  sessionId: string,
  requestId: string
): NextResponse {
  // Add session tracking headers for nginx/client
  response.headers.set('X-Session-ID', sessionId);
  response.headers.set('X-Request-ID', requestId);
  
  // Add session cookie if not present
  if (!response.cookies.get('session_id')) {
    response.cookies.set('session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 // 24 hours
    });
  }
  
  return response;
}

/**
 * Get session analytics for admin/monitoring
 */
export async function getSessionAnalytics(clientIP?: string) {
  if (clientIP) {
    return await SessionStorage.getHostAnalytics(clientIP);
  }
  
  // Could be extended to get overall analytics across all hosts
  return {
    message: 'Analytics for specific host IP required',
    usage: 'Call with clientIP parameter'
  };
}

/**
 * Session tracking wrapper for API routes
 */
export function withSessionTracking<T extends NextRequest>(
  handler: (request: T) => Promise<NextResponse>
) {
  return async (request: T): Promise<NextResponse> => {
    const startTime = Date.now();
    
    try {
      // Execute the main handler
      const response = await handler(request);
      
      // Track the session after successful response
      const responseTime = Date.now() - startTime;
      await trackSessionActivity(request, undefined, response.status, responseTime);
      
      // Add tracking headers to response
      const { sessionId, requestId } = extractSessionInfo(request);
      return addSessionTrackingHeaders(response, sessionId, requestId);
      
    } catch (error) {
      // Track failed requests too
      const responseTime = Date.now() - startTime;
      await trackSessionActivity(request, undefined, 500, responseTime);
      
      throw error; // Re-throw the original error
    }
  };
}

/**
 * Extract Clerk user ID from authentication context
 */
export async function getClerkUserIdFromRequest(request: NextRequest): Promise<string | undefined> {
  try {
    // This would need to be implemented based on how Clerk auth is handled
    // For now, returning undefined - this can be enhanced later
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return undefined;
    
    // Could decode JWT token here to get user ID
    // For now, just return undefined
    return undefined;
    
  } catch (error) {
    console.error('[SESSION] Failed to extract Clerk user ID:', error);
    return undefined;
  }
}