'use client';

/**
 * Client-side React hooks for KprCli authentication
 * These hooks manage the integration between Clerk and KprCli user data
 */

import { useAuth, useUser } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import type { KprCliUser } from '../auth-bridge-supabase';

/**
 * Hook to get KprCli user data on client side
 */
export function useKprCliAuth() {
  const { isSignedIn, userId } = useAuth();
  const { user: clerkUser } = useUser();
  const [kprCliUser, setKprCliUser] = useState<KprCliUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !clerkUser) {
      setKprCliUser(null);
      setLoading(false);
      return;
    }

    const fetchKprCliUser = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/auth/kprcli-user`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch KprCli user data');
        }

        const userData = await response.json();
        setKprCliUser(userData);
        setError(null);
      } catch (error) {
        console.error('[HOOK] Failed to fetch KprCli user:', error);
        setError(error instanceof Error ? error.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchKprCliUser();
  }, [isSignedIn, clerkUser?.id]);

  return {
    kprCliUser,
    loading,
    error,
    isSignedIn,
    isAdmin: kprCliUser?.system_permissions?.isAdmin || false,
    hasSubscription: kprCliUser?.subscription_status === 'active',
    canUseTelegramBot: kprCliUser?.subscription_tier === 'squad',
    canUseAIAutomation: true
  };
}

/**
 * Hook to manage Telegram bot integration
 */
export function useTelegramBot() {
  const { kprCliUser } = useKprCliAuth();
  const [linkingToken, setLinkingToken] = useState<string | null>(null);
  const [isLinked, setIsLinked] = useState(false);

  const generateLinkingToken = async () => {
    if (!kprCliUser) return;

    try {
      const response = await fetch('/api/auth/generate-telegram-token', {
        method: 'POST'
      });
      
      const data = await response.json();
      setLinkingToken(data.token);
    } catch (error) {
      console.error('[TELEGRAM] Failed to generate linking token:', error);
    }
  };

  const checkLinkStatus = async () => {
    if (!kprCliUser) return;

    setIsLinked(!!kprCliUser.telegram_id);
  };

  useEffect(() => {
    checkLinkStatus();
  }, [kprCliUser]);

  return {
    isLinked,
    linkingToken,
    canUseBot: kprCliUser?.subscription_tier === 'squad',
    generateLinkingToken,
    checkLinkStatus
  };
}