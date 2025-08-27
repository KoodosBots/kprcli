-- CLI Users Table
-- Dedicated table for users who authenticate through the CLI
-- Separate from main web users to provide different access patterns and permissions

CREATE TABLE IF NOT EXISTS public.cli_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Authentication & Identity
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    display_name TEXT,
    
    -- CLI-specific fields
    cli_api_key TEXT UNIQUE, -- For API authentication
    device_fingerprint TEXT, -- For device tracking
    last_device_auth TIMESTAMPTZ, -- Last successful device authorization
    
    -- User Status & Management
    status TEXT NOT NULL DEFAULT 'active' CHECK (status = ANY (ARRAY['active', 'suspended', 'banned', 'inactive'])),
    tier TEXT NOT NULL DEFAULT 'free' CHECK (tier = ANY (ARRAY['free', 'basic', 'pro', 'enterprise'])),
    
    -- Usage & Limits
    token_balance INTEGER DEFAULT 1000 NOT NULL, -- Starting balance
    monthly_token_limit INTEGER DEFAULT 5000 NOT NULL,
    tokens_used_this_month INTEGER DEFAULT 0 NOT NULL,
    last_token_reset DATE DEFAULT CURRENT_DATE,
    
    -- CLI-specific preferences
    preferred_models TEXT[] DEFAULT ARRAY['gpt-3.5-turbo'], -- AI models preference
    auto_open_browser BOOLEAN DEFAULT TRUE,
    cli_theme TEXT DEFAULT 'default' CHECK (cli_theme = ANY (ARRAY['default', 'dark', 'light', 'minimal'])),
    
    -- Security & Sessions
    last_login_ip INET,
    last_login_at TIMESTAMPTZ,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    
    -- Device Authorization tracking
    active_device_codes TEXT[], -- Currently active device codes
    authorized_devices JSONB DEFAULT '[]', -- List of authorized devices
    max_devices INTEGER DEFAULT 5,
    
    -- Usage analytics
    total_commands_run INTEGER DEFAULT 0,
    total_successful_auths INTEGER DEFAULT 0,
    total_orders_placed INTEGER DEFAULT 0,
    
    -- Metadata
    registration_source TEXT DEFAULT 'cli', -- How they registered
    referral_code TEXT, -- If they were referred
    notes TEXT, -- Admin notes
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_active_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cli_users_email ON public.cli_users(email);
CREATE INDEX IF NOT EXISTS idx_cli_users_username ON public.cli_users(username) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cli_users_api_key ON public.cli_users(cli_api_key) WHERE cli_api_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cli_users_status ON public.cli_users(status);
CREATE INDEX IF NOT EXISTS idx_cli_users_tier ON public.cli_users(tier);
CREATE INDEX IF NOT EXISTS idx_cli_users_last_active ON public.cli_users(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_cli_users_device_fingerprint ON public.cli_users(device_fingerprint) WHERE device_fingerprint IS NOT NULL;

-- Create partial index for active users only
CREATE INDEX IF NOT EXISTS idx_cli_users_active ON public.cli_users(last_active_at DESC) WHERE status = 'active';

-- Apply updated_at trigger
CREATE TRIGGER update_cli_users_updated_at 
    BEFORE UPDATE ON public.cli_users 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on CLI users table
ALTER TABLE public.cli_users ENABLE ROW LEVEL SECURITY;

-- RLS Policy: CLI users can only access their own data
CREATE POLICY "CLI users can manage own data" ON public.cli_users
    FOR ALL USING (
        email = auth.jwt() ->> 'email' OR 
        id::text = auth.jwt() ->> 'sub'
    );

-- RLS Policy: Service role has full access
CREATE POLICY "Service role full access cli_users" ON public.cli_users
    FOR ALL USING (auth.role() = 'service_role');

-- CLI Sessions table - track active CLI sessions
CREATE TABLE IF NOT EXISTS public.cli_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cli_user_id UUID REFERENCES public.cli_users(id) ON DELETE CASCADE NOT NULL,
    
    -- Session details
    session_token TEXT UNIQUE NOT NULL,
    device_fingerprint TEXT,
    ip_address INET,
    user_agent TEXT,
    
    -- Device authorization data
    device_code TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    
    -- Session management
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for CLI sessions
CREATE INDEX IF NOT EXISTS idx_cli_sessions_user_id ON public.cli_sessions(cli_user_id);
CREATE INDEX IF NOT EXISTS idx_cli_sessions_token ON public.cli_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_cli_sessions_device_code ON public.cli_sessions(device_code) WHERE device_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cli_sessions_active ON public.cli_sessions(cli_user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_cli_sessions_expires ON public.cli_sessions(expires_at);

-- Apply trigger to CLI sessions
CREATE TRIGGER update_cli_sessions_updated_at 
    BEFORE UPDATE ON public.cli_sessions 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on CLI sessions
ALTER TABLE public.cli_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for CLI sessions
CREATE POLICY "CLI users can manage own sessions" ON public.cli_sessions
    FOR ALL USING (
        cli_user_id IN (
            SELECT id FROM public.cli_users 
            WHERE email = auth.jwt() ->> 'email' OR id::text = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Service role full access cli_sessions" ON public.cli_sessions
    FOR ALL USING (auth.role() = 'service_role');

-- Function to generate API key for CLI users
CREATE OR REPLACE FUNCTION generate_cli_api_key()
RETURNS TEXT AS $$
BEGIN
    RETURN 'kpr_' || encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset monthly token usage
CREATE OR REPLACE FUNCTION reset_monthly_tokens()
RETURNS void AS $$
BEGIN
    UPDATE public.cli_users 
    SET tokens_used_this_month = 0,
        last_token_reset = CURRENT_DATE
    WHERE last_token_reset < CURRENT_DATE - INTERVAL '1 month';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_cli_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM public.cli_sessions 
    WHERE expires_at < NOW() OR 
          (token_expires_at IS NOT NULL AND token_expires_at < NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert some example CLI users (optional - for testing)
INSERT INTO public.cli_users (email, username, display_name, tier) VALUES
('admin@kprcli.com', 'admin', 'Admin User', 'enterprise'),
('developer@kprcli.com', 'dev', 'Developer User', 'pro'),
('tester@kprcli.com', 'test', 'Test User', 'free')
ON CONFLICT (email) DO NOTHING;

-- Generate API keys for the example users
UPDATE public.cli_users 
SET cli_api_key = generate_cli_api_key() 
WHERE cli_api_key IS NULL;