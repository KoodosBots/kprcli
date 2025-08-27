import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Basic health check
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'kprcli-web',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || '3000',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      // Check if essential environment variables are present
      config: {
        clerk: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        redis: !!process.env.REDIS_URL
      }
    };

    // Return health status
    return NextResponse.json(health, { status: 200 });
  } catch (error) {
    console.error('Health check failed:', error);
    
    return NextResponse.json(
      { 
        status: 'unhealthy', 
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}