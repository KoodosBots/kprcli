import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { KprCliAuthBridge } from '@/lib/auth-bridge-supabase';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generate unique linking token for Telegram bot
    const token = await KprCliAuthBridge.generateTelegramLinkingToken(userId);

    return NextResponse.json({ 
      token,
      expiresIn: '15 minutes',
      instructions: 'Send "/link ' + token + '" to the KprCli bot on Telegram'
    });

  } catch (error) {
    console.error('[API] Failed to generate Telegram linking token:', error);
    return NextResponse.json(
      { error: 'Failed to generate linking token' },
      { status: 500 }
    );
  }
}