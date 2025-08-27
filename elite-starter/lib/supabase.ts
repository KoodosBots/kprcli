import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types for TypeScript
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          clerk_user_id: string | null
          email: string
          full_name: string | null
          username: string | null
          avatar_url: string | null
          telegram_id: string | null
          telegram_username: string | null
          subscription_tier: 'solo' | 'pair' | 'squad'
          subscription_status: 'active' | 'inactive' | 'expired'
          token_balance: number
          automation_credits: number
          system_permissions: any
          ai_model_preferences: any
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clerk_user_id?: string | null
          email: string
          full_name?: string | null
          username?: string | null
          avatar_url?: string | null
          telegram_id?: string | null
          telegram_username?: string | null
          subscription_tier?: 'solo' | 'pair' | 'squad'
          subscription_status?: 'active' | 'inactive' | 'expired'
          token_balance?: number
          automation_credits?: number
          system_permissions?: any
          ai_model_preferences?: any
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clerk_user_id?: string | null
          email?: string
          full_name?: string | null
          username?: string | null
          avatar_url?: string | null
          telegram_id?: string | null
          telegram_username?: string | null
          subscription_tier?: 'solo' | 'pair' | 'squad'
          subscription_status?: 'active' | 'inactive' | 'expired'
          token_balance?: number
          automation_credits?: number
          system_permissions?: any
          ai_model_preferences?: any
          created_at?: string
          updated_at?: string
        }
      }
      customer_profiles: {
        Row: {
          id: string
          user_id: string
          first_name: string
          last_name: string
          middle_name: string | null
          email: string | null
          phone: string | null
          dob: string | null
          gender: string | null
          address: string | null
          apt_suite: string | null
          city: string | null
          state: string | null
          postal: string | null
          password_encrypted: string | null
          created_at: string
          updated_at: string
          registered: string
        }
        Insert: {
          id?: string
          user_id: string
          first_name: string
          last_name: string
          middle_name?: string | null
          email?: string | null
          phone?: string | null
          dob?: string | null
          gender?: string | null
          address?: string | null
          apt_suite?: string | null
          city?: string | null
          state?: string | null
          postal?: string | null
          password_encrypted?: string | null
          created_at?: string
          updated_at?: string
          registered?: string
        }
        Update: {
          id?: string
          user_id?: string
          first_name?: string
          last_name?: string
          middle_name?: string | null
          email?: string | null
          phone?: string | null
          dob?: string | null
          gender?: string | null
          address?: string | null
          apt_suite?: string | null
          city?: string | null
          state?: string | null
          postal?: string | null
          password_encrypted?: string | null
          created_at?: string
          updated_at?: string
          registered?: string
        }
      }
      products: {
        Row: {
          id: string
          name: string
          description: string | null
          token_price: number
          category: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          token_price?: number
          category?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          token_price?: number
          category?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      orders: {
        Row: {
          id: string
          user_id: string
          customer_profile_id: string
          product_name: string
          package_type: string
          token_cost: number
          sites_count: number | null
          status: string
          priority: number
          is_priority: boolean
          queue_position: number | null
          operator_id: string | null
          assigned_at: string | null
          notes: string | null
          original_order_id: string | null
          is_rerun: boolean
          subscriber_discount_applied: boolean
          created_at: string
          updated_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          customer_profile_id: string
          product_name: string
          package_type: string
          token_cost?: number
          sites_count?: number | null
          status?: string
          priority?: number
          is_priority?: boolean
          queue_position?: number | null
          operator_id?: string | null
          assigned_at?: string | null
          notes?: string | null
          original_order_id?: string | null
          is_rerun?: boolean
          subscriber_discount_applied?: boolean
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          customer_profile_id?: string
          product_name?: string
          package_type?: string
          token_cost?: number
          sites_count?: number | null
          status?: string
          priority?: number
          is_priority?: boolean
          queue_position?: number | null
          operator_id?: string | null
          assigned_at?: string | null
          notes?: string | null
          original_order_id?: string | null
          is_rerun?: boolean
          subscriber_discount_applied?: boolean
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
      }
      form_patterns: {
        Row: {
          id: string
          user_id: string
          name: string
          form_url: string
          form_structure: any
          field_mappings: any
          success_patterns: any
          ai_model_weights: any
          training_data: any
          success_rate: number
          total_executions: number
          successful_executions: number
          last_trained_at: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          form_url: string
          form_structure: any
          field_mappings: any
          success_patterns: any
          ai_model_weights?: any
          training_data?: any
          success_rate?: number
          total_executions?: number
          successful_executions?: number
          last_trained_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          form_url?: string
          form_structure?: any
          field_mappings?: any
          success_patterns?: any
          ai_model_weights?: any
          training_data?: any
          success_rate?: number
          total_executions?: number
          successful_executions?: number
          last_trained_at?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      automation_jobs: {
        Row: {
          id: string
          user_id: string
          customer_profile_id: string | null
          form_pattern_id: string | null
          job_name: string | null
          form_url: string
          status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
          priority: number
          ai_models_used: string[]
          execution_data: any
          form_data: any
          execution_results: any
          error_details: any
          execution_time_ms: number | null
          token_cost: number
          started_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          customer_profile_id?: string | null
          form_pattern_id?: string | null
          job_name?: string | null
          form_url: string
          status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
          priority?: number
          ai_models_used?: string[]
          execution_data?: any
          form_data?: any
          execution_results?: any
          error_details?: any
          execution_time_ms?: number | null
          token_cost?: number
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          customer_profile_id?: string | null
          form_pattern_id?: string | null
          job_name?: string | null
          form_url?: string
          status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
          priority?: number
          ai_models_used?: string[]
          execution_data?: any
          form_data?: any
          execution_results?: any
          error_details?: any
          execution_time_ms?: number | null
          token_cost?: number
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      token_transactions: {
        Row: {
          id: string
          user_id: string
          transaction_type: 'purchase' | 'spend' | 'refund' | 'bonus'
          amount: number
          balance_after: number
          payment_method: string | null
          payment_id: string | null
          payment_status: string | null
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          transaction_type: 'purchase' | 'spend' | 'refund' | 'bonus'
          amount: number
          balance_after: number
          payment_method?: string | null
          payment_id?: string | null
          payment_status?: string | null
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          transaction_type?: 'purchase' | 'spend' | 'refund' | 'bonus'
          amount?: number
          balance_after?: number
          payment_method?: string | null
          payment_id?: string | null
          payment_status?: string | null
          description?: string | null
          created_at?: string
        }
      }
      cli_users: {
        Row: {
          id: string
          email: string
          username: string | null
          display_name: string | null
          cli_api_key: string | null
          device_fingerprint: string | null
          last_device_auth: string | null
          telegram_id: number | null
          telegram_username: string | null
          telegram_first_name: string | null
          telegram_last_name: string | null
          telegram_linked_at: string | null
          status: 'active' | 'suspended' | 'banned' | 'inactive'
          tier: 'free' | 'basic' | 'pro' | 'enterprise'
          token_balance: number
          monthly_token_limit: number
          tokens_used_this_month: number
          last_token_reset: string
          preferred_models: string[]
          auto_open_browser: boolean
          cli_theme: 'default' | 'dark' | 'light' | 'minimal'
          last_login_ip: string | null
          last_login_at: string | null
          failed_login_attempts: number
          locked_until: string | null
          active_device_codes: string[]
          authorized_devices: any
          max_devices: number
          total_commands_run: number
          total_successful_auths: number
          total_orders_placed: number
          registration_source: string
          referral_code: string | null
          notes: string | null
          created_at: string
          updated_at: string
          last_active_at: string
        }
        Insert: {
          id?: string
          email: string
          username?: string | null
          display_name?: string | null
          cli_api_key?: string | null
          device_fingerprint?: string | null
          last_device_auth?: string | null
          telegram_id?: number | null
          telegram_username?: string | null
          telegram_first_name?: string | null
          telegram_last_name?: string | null
          telegram_linked_at?: string | null
          status?: 'active' | 'suspended' | 'banned' | 'inactive'
          tier?: 'free' | 'basic' | 'pro' | 'enterprise'
          token_balance?: number
          monthly_token_limit?: number
          tokens_used_this_month?: number
          last_token_reset?: string
          preferred_models?: string[]
          auto_open_browser?: boolean
          cli_theme?: 'default' | 'dark' | 'light' | 'minimal'
          last_login_ip?: string | null
          last_login_at?: string | null
          failed_login_attempts?: number
          locked_until?: string | null
          active_device_codes?: string[]
          authorized_devices?: any
          max_devices?: number
          total_commands_run?: number
          total_successful_auths?: number
          total_orders_placed?: number
          registration_source?: string
          referral_code?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          last_active_at?: string
        }
        Update: {
          id?: string
          email?: string
          username?: string | null
          display_name?: string | null
          cli_api_key?: string | null
          device_fingerprint?: string | null
          last_device_auth?: string | null
          telegram_id?: number | null
          telegram_username?: string | null
          telegram_first_name?: string | null
          telegram_last_name?: string | null
          telegram_linked_at?: string | null
          status?: 'active' | 'suspended' | 'banned' | 'inactive'
          tier?: 'free' | 'basic' | 'pro' | 'enterprise'
          token_balance?: number
          monthly_token_limit?: number
          tokens_used_this_month?: number
          last_token_reset?: string
          preferred_models?: string[]
          auto_open_browser?: boolean
          cli_theme?: 'default' | 'dark' | 'light' | 'minimal'
          last_login_ip?: string | null
          last_login_at?: string | null
          failed_login_attempts?: number
          locked_until?: string | null
          active_device_codes?: string[]
          authorized_devices?: any
          max_devices?: number
          total_commands_run?: number
          total_successful_auths?: number
          total_orders_placed?: number
          registration_source?: string
          referral_code?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          last_active_at?: string
        }
      }
      cli_sessions: {
        Row: {
          id: string
          cli_user_id: string
          session_token: string
          device_fingerprint: string | null
          ip_address: string | null
          user_agent: string | null
          device_code: string | null
          access_token: string | null
          refresh_token: string | null
          token_expires_at: string | null
          is_active: boolean
          last_used_at: string
          expires_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cli_user_id: string
          session_token: string
          device_fingerprint?: string | null
          ip_address?: string | null
          user_agent?: string | null
          device_code?: string | null
          access_token?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          is_active?: boolean
          last_used_at?: string
          expires_at: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cli_user_id?: string
          session_token?: string
          device_fingerprint?: string | null
          ip_address?: string | null
          user_agent?: string | null
          device_code?: string | null
          access_token?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          is_active?: boolean
          last_used_at?: string
          expires_at?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

// Utility functions for common operations
export const createUser = async (userData: Database['public']['Tables']['users']['Insert']) => {
  const { data, error } = await supabase
    .from('users')
    .insert(userData)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export const getUserByClerkId = async (clerkUserId: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('clerk_user_id', clerkUserId)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export const updateUser = async (id: string, updates: Database['public']['Tables']['users']['Update']) => {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Customer Profile Management Functions
export const createCustomerProfile = async (profileData: Database['public']['Tables']['customer_profiles']['Insert']) => {
  const { data, error } = await supabase
    .from('customer_profiles')
    .insert(profileData)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export const getCustomerProfiles = async (userId: string) => {
  const { data, error } = await supabase
    .from('customer_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data || []
}

export const getCustomerProfileById = async (profileId: string) => {
  const { data, error } = await supabase
    .from('customer_profiles')
    .select('*')
    .eq('id', profileId)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export const updateCustomerProfile = async (profileId: string, updates: Database['public']['Tables']['customer_profiles']['Update']) => {
  const { data, error } = await supabase
    .from('customer_profiles')
    .update(updates)
    .eq('id', profileId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export const deleteCustomerProfile = async (profileId: string) => {
  const { error } = await supabase
    .from('customer_profiles')
    .delete()
    .eq('id', profileId)
  
  if (error) throw error
}

// Order Management Functions
export const createOrder = async (orderData: Database['public']['Tables']['orders']['Insert']) => {
  const { data, error } = await supabase
    .from('orders')
    .insert(orderData)
    .select('*, customer_profiles(*)')
    .single()
  
  if (error) throw error
  return data
}

export const getUserOrders = async (userId: string, limit = 50) => {
  const { data, error } = await supabase
    .from('orders')
    .select('*, customer_profiles(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (error) throw error
  return data || []
}

export const updateOrderStatus = async (orderId: string, status: string, updates: Partial<Database['public']['Tables']['orders']['Update']> = {}) => {
  const { data, error } = await supabase
    .from('orders')
    .update({ status, ...updates })
    .eq('id', orderId)
    .select('*, customer_profiles(*)')
    .single()
  
  if (error) throw error
  return data
}

// Products Functions
export const getActiveProducts = async () => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('token_price')
  
  if (error) throw error
  return data || []
}

// Token Transaction Functions
export const createTokenTransaction = async (transactionData: Database['public']['Tables']['token_transactions']['Insert']) => {
  const { data, error } = await supabase
    .from('token_transactions')
    .insert(transactionData)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export const getUserTokenTransactions = async (userId: string, limit = 100) => {
  const { data, error } = await supabase
    .from('token_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (error) throw error
  return data || []
}

// CLI User Management Functions
export const createCLIUser = async (userData: Database['public']['Tables']['cli_users']['Insert']) => {
  const { data, error } = await supabase
    .from('cli_users')
    .insert(userData)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export const getCLIUserByEmail = async (email: string) => {
  const { data, error } = await supabase
    .from('cli_users')
    .select('*')
    .eq('email', email)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export const getCLIUserByApiKey = async (apiKey: string) => {
  const { data, error } = await supabase
    .from('cli_users')
    .select('*')
    .eq('cli_api_key', apiKey)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export const getCLIUserById = async (userId: string) => {
  const { data, error } = await supabase
    .from('cli_users')
    .select('*')
    .eq('id', userId)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export const getCLIUserByTelegramId = async (telegramId: number) => {
  const { data, error } = await supabase
    .from('cli_users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export const linkTelegramToCLIUser = async (userId: string, telegramData: {
  telegram_id: number
  telegram_username?: string | null
  telegram_first_name?: string | null  
  telegram_last_name?: string | null
}) => {
  const { data, error } = await supabase
    .from('cli_users')
    .update({
      telegram_id: telegramData.telegram_id,
      telegram_username: telegramData.telegram_username,
      telegram_first_name: telegramData.telegram_first_name,
      telegram_last_name: telegramData.telegram_last_name,
      telegram_linked_at: new Date().toISOString()
    })
    .eq('id', userId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export const updateCLIUser = async (userId: string, updates: Database['public']['Tables']['cli_users']['Update']) => {
  const { data, error } = await supabase
    .from('cli_users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export const updateCLIUserActivity = async (userId: string) => {
  const { data, error } = await supabase
    .from('cli_users')
    .update({ 
      last_active_at: new Date().toISOString(),
      total_commands_run: supabase.rpc('increment_counter', { table_name: 'cli_users', id: userId, column_name: 'total_commands_run' })
    })
    .eq('id', userId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export const generateCLIApiKey = async (): Promise<string> => {
  const { data, error } = await supabase.rpc('generate_cli_api_key')
  
  if (error) throw error
  return data
}

export const incrementCLIUserCounter = async (userId: string, counterField: 'total_commands_run' | 'total_successful_auths' | 'total_orders_placed') => {
  const { data, error } = await supabase
    .from('cli_users')
    .update({ 
      [counterField]: supabase.sql`${counterField} + 1`,
      last_active_at: new Date().toISOString()
    })
    .eq('id', userId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export const resetCLIUserTokens = async (userId: string) => {
  const { data, error } = await supabase
    .from('cli_users')
    .update({ 
      tokens_used_this_month: 0,
      last_token_reset: new Date().toISOString()
    })
    .eq('id', userId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export const spendCLIUserTokens = async (userId: string, amount: number) => {
  // First get current balance
  const user = await getCLIUserById(userId)
  if (!user) throw new Error('User not found')
  
  if (user.tokens_used_this_month + amount > user.monthly_token_limit) {
    throw new Error('Monthly token limit exceeded')
  }
  
  if (user.token_balance < amount) {
    throw new Error('Insufficient token balance')
  }
  
  const { data, error } = await supabase
    .from('cli_users')
    .update({ 
      token_balance: user.token_balance - amount,
      tokens_used_this_month: user.tokens_used_this_month + amount,
      last_active_at: new Date().toISOString()
    })
    .eq('id', userId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

// CLI Session Management Functions
export const createCLISession = async (sessionData: Database['public']['Tables']['cli_sessions']['Insert']) => {
  const { data, error } = await supabase
    .from('cli_sessions')
    .insert(sessionData)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export const getCLISession = async (sessionToken: string) => {
  const { data, error } = await supabase
    .from('cli_sessions')
    .select('*, cli_users(*)')
    .eq('session_token', sessionToken)
    .eq('is_active', true)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export const getCLISessionByDeviceCode = async (deviceCode: string) => {
  const { data, error } = await supabase
    .from('cli_sessions')
    .select('*, cli_users(*)')
    .eq('device_code', deviceCode)
    .eq('is_active', true)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export const updateCLISession = async (sessionId: string, updates: Database['public']['Tables']['cli_sessions']['Update']) => {
  const { data, error } = await supabase
    .from('cli_sessions')
    .update(updates)
    .eq('id', sessionId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export const deactivateCLISession = async (sessionToken: string) => {
  const { data, error } = await supabase
    .from('cli_sessions')
    .update({ is_active: false })
    .eq('session_token', sessionToken)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export const cleanupExpiredCLISessions = async () => {
  const { error } = await supabase.rpc('cleanup_expired_cli_sessions')
  
  if (error) throw error
}

export const getCLIUserSessions = async (userId: string, activeOnly = true) => {
  let query = supabase
    .from('cli_sessions')
    .select('*')
    .eq('cli_user_id', userId)
    .order('created_at', { ascending: false })
  
  if (activeOnly) {
    query = query.eq('is_active', true)
  }
  
  const { data, error } = await query
  
  if (error) throw error
  return data || []
}