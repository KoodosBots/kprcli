import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { KprCliAuthBridge } from '@/lib/auth-bridge-supabase';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clerkUser = await currentUser();
    if (!clerkUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get or create KprCli user record
    const kprCliUser = await KprCliAuthBridge.getOrCreateKprCliUser(clerkUser);

    return NextResponse.json(kprCliUser);

  } catch (error) {
    console.error('[API] Failed to get KprCli user:', error);
    return NextResponse.json(
      { error: 'Failed to get user data' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      tokenBalance, 
      subscriptionTier, 
      subscriptionStatus,
      telegramId,
      telegramUsername 
    } = body;

    // Update KprCli user data
    // This would call your backend API to update the user
    const response = await fetch(`${process.env.KPRCLI_API_URL}/api/users/clerk/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tokenBalance,
        subscriptionTier,
        subscriptionStatus,
        telegramId,
        telegramUsername
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update user');
    }

    const updatedUser = await response.json();
    return NextResponse.json(updatedUser);

  } catch (error) {
    console.error('[API] Failed to update KprCli user:', error);
    return NextResponse.json(
      { error: 'Failed to update user data' },
      { status: 500 }
    );
  }
}