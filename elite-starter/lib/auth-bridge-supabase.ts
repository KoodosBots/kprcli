/**
 * KprCli Authentication Bridge - Supabase Version
 * Connects Clerk authentication with Supabase database
 * Provides unified authentication state across all services
 */

import { auth, currentUser } from '@clerk/nextjs/server';
import { User } from '@clerk/nextjs/server';
import { supabase, getUserByClerkId, createUser, updateUser, type Database } from './supabase';
import { DeviceAuthStorage } from './redis';

// Types
export interface KprCliUser {
  id: string;
  clerk_user_id: string;
  email: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  telegram_id: string | null;
  telegram_username: string | null;
  subscription_tier: 'solo' | 'pair' | 'squad';
  subscription_status: 'active' | 'inactive' | 'expired';
  token_balance: number;
  automation_credits: number;
  system_permissions: any;
  ai_model_preferences: any;
  created_at: string;
  updated_at: string;
}

export interface AuthBridge {
  user: KprCliUser | null;
  isSignedIn: boolean;
  isAdmin: boolean;
  hasSubscription: boolean;
  canUseTelegramBot: boolean;
  canUseAIAutomation: boolean;
}

// Auth bridge class
export class KprCliAuthBridge {
  /**
   * Get current authenticated user with KprCli data
   */
  static async getCurrentUser(): Promise<AuthBridge> {
    try {
      const { userId } = await auth();
      
      if (!userId) {
        return {
          user: null,
          isSignedIn: false,
          isAdmin: false,
          hasSubscription: false,
          canUseTelegramBot: false,
          canUseAIAutomation: false
        };
      }

      const clerkUser = await currentUser();
      if (!clerkUser) {
        return {
          user: null,
          isSignedIn: false,
          isAdmin: false,
          hasSubscription: false,
          canUseTelegramBot: false,
          canUseAIAutomation: false
        };
      }

      // Get or create KprCli user record
      const kprCliUser = await this.getOrCreateKprCliUser(clerkUser);

      return {
        user: kprCliUser,
        isSignedIn: true,
        isAdmin: kprCliUser.system_permissions?.isAdmin || false,
        hasSubscription: kprCliUser.subscription_status === 'active',
        canUseTelegramBot: kprCliUser.subscription_tier === 'squad',
        canUseAIAutomation: true // All users can use AI automation
      };

    } catch (error) {
      console.error('[AUTH_BRIDGE] Failed to get current user:', error);
      return {
        user: null,
        isSignedIn: false,
        isAdmin: false,
        hasSubscription: false,
        canUseTelegramBot: false,
        canUseAIAutomation: false
      };
    }
  }

  /**
   * Get or create KprCli user record from Clerk user
   */
  static async getOrCreateKprCliUser(clerkUser: User): Promise<KprCliUser> {
    try {
      // First, try to get existing user
      const existingUser = await getUserByClerkId(clerkUser.id);
      if (existingUser) {
        return existingUser;
      }

      // Create new KprCli user record
      const userData: Database['public']['Tables']['users']['Insert'] = {
        clerk_user_id: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress || '',
        full_name: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || null,
        username: clerkUser.username || clerkUser.primaryEmailAddress?.emailAddress?.split('@')[0] || null,
        avatar_url: clerkUser.imageUrl || null,
        token_balance: 0,
        automation_credits: 100, // Default credits
        subscription_tier: 'solo',
        subscription_status: 'active',
        system_permissions: { isAdmin: false, isOperator: false },
        ai_model_preferences: { groq: true, openrouter: true, ollama: false }
      };

      const newUser = await createUser(userData);
      return newUser;

    } catch (error) {
      console.error('[AUTH_BRIDGE] Failed to get/create KprCli user:', error);
      throw error;
    }
  }

  /**
   * Get KprCli user by Clerk ID
   */
  static async getKprCliUserByClerkId(clerkId: string): Promise<KprCliUser | null> {
    try {
      return await getUserByClerkId(clerkId);
    } catch (error) {
      console.error('[AUTH_BRIDGE] Failed to get KprCli user:', error);
      return null;
    }
  }

  /**
   * Get KprCli user by Telegram ID
   */
  static async getKprCliUserByTelegramId(telegramId: string): Promise<KprCliUser | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // No rows returned
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[AUTH_BRIDGE] Failed to get KprCli user by Telegram ID:', error);
      return null;
    }
  }

  /**
   * Link Telegram account to KprCli user
   */
  static async linkTelegramAccount(clerkId: string, telegramId: string, telegramUsername?: string): Promise<KprCliUser | null> {
    try {
      const user = await getUserByClerkId(clerkId);
      if (!user) throw new Error('User not found');

      const updatedUser = await updateUser(user.id, {
        telegram_id: telegramId,
        telegram_username: telegramUsername || null
      });

      return updatedUser;
    } catch (error) {
      console.error('[AUTH_BRIDGE] Failed to link Telegram account:', error);
      throw error;
    }
  }

  /**
   * Generate Telegram bot linking token
   */
  static async generateTelegramLinkingToken(clerkId: string): Promise<string> {
    try {
      // Generate a secure token
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Store the token in Redis with 15 minute expiration
      const expiresIn = 15 * 60; // 15 minutes in seconds
      await DeviceAuthStorage.storeTelegramToken(token, clerkId, expiresIn);

      return token;
    } catch (error) {
      console.error('[AUTH_BRIDGE] Failed to generate Telegram linking token:', error);
      throw error;
    }
  }

  /**
   * Verify Telegram linking token
   */
  static async verifyTelegramLinkingToken(token: string): Promise<string | null> {
    try {
      return await DeviceAuthStorage.verifyTelegramToken(token);
    } catch (error) {
      console.error('[AUTH_BRIDGE] Failed to verify Telegram linking token:', error);
      return null;
    }
  }

  /**
   * Update user subscription
   */
  static async updateSubscription(
    clerkId: string, 
    tier: 'solo' | 'pair' | 'squad', 
    status: 'active' | 'inactive' | 'expired'
  ): Promise<KprCliUser | null> {
    try {
      const user = await getUserByClerkId(clerkId);
      if (!user) throw new Error('User not found');

      const updatedUser = await updateUser(user.id, {
        subscription_tier: tier,
        subscription_status: status
      });

      return updatedUser;
    } catch (error) {
      console.error('[AUTH_BRIDGE] Failed to update subscription:', error);
      throw error;
    }
  }

  /**
   * Update token balance
   */
  static async updateTokenBalance(clerkId: string, amount: number, operation: 'add' | 'subtract' | 'set'): Promise<KprCliUser | null> {
    try {
      const user = await getUserByClerkId(clerkId);
      if (!user) throw new Error('User not found');

      let newBalance: number;
      switch (operation) {
        case 'add':
          newBalance = user.token_balance + amount;
          break;
        case 'subtract':
          newBalance = Math.max(0, user.token_balance - amount);
          break;
        case 'set':
          newBalance = Math.max(0, amount);
          break;
        default:
          throw new Error('Invalid operation');
      }

      const updatedUser = await updateUser(user.id, {
        token_balance: newBalance
      });

      return updatedUser;
    } catch (error) {
      console.error('[AUTH_BRIDGE] Failed to update token balance:', error);
      throw error;
    }
  }

  /**
   * Update automation credits
   */
  static async updateAutomationCredits(clerkId: string, amount: number, operation: 'add' | 'subtract' | 'set'): Promise<KprCliUser | null> {
    try {
      const user = await getUserByClerkId(clerkId);
      if (!user) throw new Error('User not found');

      let newCredits: number;
      switch (operation) {
        case 'add':
          newCredits = user.automation_credits + amount;
          break;
        case 'subtract':
          newCredits = Math.max(0, user.automation_credits - amount);
          break;
        case 'set':
          newCredits = Math.max(0, amount);
          break;
        default:
          throw new Error('Invalid operation');
      }

      const updatedUser = await updateUser(user.id, {
        automation_credits: newCredits
      });

      return updatedUser;
    } catch (error) {
      console.error('[AUTH_BRIDGE] Failed to update automation credits:', error);
      throw error;
    }
  }

  /**
   * Get user automation jobs
   */
  static async getAutomationJobs(clerkId: string, limit = 10): Promise<any[]> {
    try {
      const user = await getUserByClerkId(clerkId);
      if (!user) return [];

      const { data, error } = await supabase
        .from('automation_jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[AUTH_BRIDGE] Failed to get automation jobs:', error);
      return [];
    }
  }

  /**
   * Create automation job
   */
  static async createAutomationJob(clerkId: string, jobData: any): Promise<any> {
    try {
      const user = await getUserByClerkId(clerkId);
      if (!user) throw new Error('User not found');

      const { data, error } = await supabase
        .from('automation_jobs')
        .insert({
          user_id: user.id,
          ...jobData
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[AUTH_BRIDGE] Failed to create automation job:', error);
      throw error;
    }
  }
}

// Note: React hooks are now in separate client-side file
// See /lib/hooks/use-kprcli-auth.tsx for client-side hooks