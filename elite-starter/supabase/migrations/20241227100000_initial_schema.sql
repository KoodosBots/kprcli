-- Initial schema for KprCli authentication system
-- Creates users table and supporting tables for device authorization

-- Enable Row Level Security
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Users table (synced from Clerk)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    clerk_user_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    full_name TEXT,
    username TEXT,
    avatar_url TEXT,
    telegram_id TEXT UNIQUE,
    telegram_username TEXT,
    subscription_tier TEXT CHECK (subscription_tier IN ('solo', 'pair', 'squad')) DEFAULT 'solo' NOT NULL,
    subscription_status TEXT CHECK (subscription_status IN ('active', 'inactive', 'expired')) DEFAULT 'active' NOT NULL,
    token_balance INTEGER DEFAULT 0 NOT NULL,
    automation_credits INTEGER DEFAULT 100 NOT NULL,
    system_permissions JSONB DEFAULT '{"isAdmin": false, "isOperator": false}' NOT NULL,
    ai_model_preferences JSONB DEFAULT '{"groq": true, "openrouter": true, "ollama": false}' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Automation jobs table
CREATE TABLE IF NOT EXISTS public.automation_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    job_type TEXT NOT NULL,
    status TEXT CHECK (status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending' NOT NULL,
    config JSONB DEFAULT '{}' NOT NULL,
    result JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Form patterns table (for form automation)
CREATE TABLE IF NOT EXISTS public.form_patterns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    pattern_data JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    usage_count INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON public.users(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON public.users(telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_user_id ON public.automation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_status ON public.automation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_created_at ON public.automation_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_patterns_user_id ON public.form_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_form_patterns_active ON public.form_patterns(is_active) WHERE is_active = TRUE;

-- Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to all tables
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON public.users 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_automation_jobs_updated_at 
    BEFORE UPDATE ON public.automation_jobs 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_form_patterns_updated_at 
    BEFORE UPDATE ON public.form_patterns 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_patterns ENABLE ROW LEVEL SECURITY;

-- RLS policies for users table
-- Users can only see and modify their own data
CREATE POLICY "Users can view own data" ON public.users
    FOR SELECT USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update own data" ON public.users
    FOR UPDATE USING (clerk_user_id = auth.jwt() ->> 'sub');

-- Service role can access all data (for our auth bridge)
CREATE POLICY "Service role full access users" ON public.users
    FOR ALL USING (auth.role() = 'service_role');

-- RLS policies for automation_jobs table
CREATE POLICY "Users can view own automation jobs" ON public.automation_jobs
    FOR SELECT USING (
        user_id IN (
            SELECT id FROM public.users WHERE clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Users can insert own automation jobs" ON public.automation_jobs
    FOR INSERT WITH CHECK (
        user_id IN (
            SELECT id FROM public.users WHERE clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Service role full access automation_jobs" ON public.automation_jobs
    FOR ALL USING (auth.role() = 'service_role');

-- RLS policies for form_patterns table
CREATE POLICY "Users can manage own form patterns" ON public.form_patterns
    FOR ALL USING (
        user_id IN (
            SELECT id FROM public.users WHERE clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Service role full access form_patterns" ON public.form_patterns
    FOR ALL USING (auth.role() = 'service_role');