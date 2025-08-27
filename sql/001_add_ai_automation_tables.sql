-- KprCli AI Automation Database Schema Extension
-- Extends existing TeleKpr schema with AI form automation capabilities
-- Version: 1.0.0

-- Extend users table with Clerk integration and automation features
ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS automation_credits INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS system_permissions JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_model_preferences JSONB DEFAULT '{"groq": true, "openrouter": true, "ollama": false}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'solo' CHECK (subscription_tier IN ('solo', 'pair', 'squad'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'inactive', 'expired'));

-- Create index on clerk_user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_user_id);

-- Form patterns table - stores AI-learned form structures
CREATE TABLE IF NOT EXISTS form_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    form_url TEXT NOT NULL,
    form_structure JSONB NOT NULL,
    field_mappings JSONB NOT NULL,
    success_patterns JSONB NOT NULL,
    ai_model_weights JSONB DEFAULT '{}',
    training_data JSONB DEFAULT '{}',
    success_rate DECIMAL(5,2) DEFAULT 0.0,
    total_executions INTEGER DEFAULT 0,
    successful_executions INTEGER DEFAULT 0,
    last_trained_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for form patterns
CREATE INDEX IF NOT EXISTS idx_form_patterns_user_id ON form_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_form_patterns_url ON form_patterns(form_url);
CREATE INDEX IF NOT EXISTS idx_form_patterns_active ON form_patterns(is_active);

-- Automation jobs table - tracks form automation executions
CREATE TABLE IF NOT EXISTS automation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    customer_profile_id UUID REFERENCES customer_profiles(id) ON DELETE SET NULL,
    form_pattern_id UUID REFERENCES form_patterns(id) ON DELETE SET NULL,
    job_name TEXT,
    form_url TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    priority INTEGER DEFAULT 0,
    ai_models_used TEXT[] DEFAULT '{}',
    execution_data JSONB DEFAULT '{}',
    form_data JSONB DEFAULT '{}',
    execution_results JSONB DEFAULT '{}',
    error_details JSONB DEFAULT '{}',
    execution_time_ms INTEGER,
    token_cost INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for automation jobs
CREATE INDEX IF NOT EXISTS idx_automation_jobs_user_id ON automation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_status ON automation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_created_at ON automation_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_pattern_id ON automation_jobs(form_pattern_id);

-- AI model performance tracking
CREATE TABLE IF NOT EXISTS ai_model_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    model_name TEXT NOT NULL,
    form_pattern_id UUID REFERENCES form_patterns(id) ON DELETE CASCADE,
    execution_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    average_confidence DECIMAL(5,4) DEFAULT 0.0,
    average_execution_time_ms INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, model_name, form_pattern_id)
);

-- Create indexes for AI model performance
CREATE INDEX IF NOT EXISTS idx_ai_model_performance_user_id ON ai_model_performance(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_model_performance_model ON ai_model_performance(model_name);

-- Training sessions table - tracks AI training processes
CREATE TABLE IF NOT EXISTS training_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    form_pattern_id UUID REFERENCES form_patterns(id) ON DELETE CASCADE,
    session_name TEXT,
    training_type TEXT DEFAULT 'manual' CHECK (training_type IN ('manual', 'automated', 'batch')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'cancelled')),
    browser_data JSONB DEFAULT '{}',
    network_traffic JSONB DEFAULT '{}',
    user_actions JSONB DEFAULT '{}',
    form_detection_results JSONB DEFAULT '{}',
    ai_analysis JSONB DEFAULT '{}',
    session_duration_ms INTEGER,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for training sessions
CREATE INDEX IF NOT EXISTS idx_training_sessions_user_id ON training_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_pattern_id ON training_sessions(form_pattern_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_status ON training_sessions(status);

-- Automation queue table - manages job execution queue
CREATE TABLE IF NOT EXISTS automation_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_job_id UUID REFERENCES automation_jobs(id) ON DELETE CASCADE,
    queue_position INTEGER NOT NULL,
    priority INTEGER DEFAULT 0,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    worker_id TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for automation queue
CREATE INDEX IF NOT EXISTS idx_automation_queue_position ON automation_queue(queue_position);
CREATE INDEX IF NOT EXISTS idx_automation_queue_priority ON automation_queue(priority DESC);
CREATE INDEX IF NOT EXISTS idx_automation_queue_scheduled ON automation_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_automation_queue_job_id ON automation_queue(automation_job_id);

-- System settings table for AI automation configuration
CREATE TABLE IF NOT EXISTS ai_automation_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    is_user_configurable BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default AI automation settings
INSERT INTO ai_automation_settings (key, value, description, category) VALUES
    ('max_concurrent_jobs', '5', 'Maximum number of concurrent automation jobs per user', 'performance'),
    ('default_ai_models', '["groq", "openrouter"]', 'Default AI models for form automation', 'ai'),
    ('form_timeout_ms', '30000', 'Default timeout for form submission in milliseconds', 'execution'),
    ('retry_attempts', '3', 'Number of retry attempts for failed jobs', 'execution'),
    ('success_threshold', '0.95', 'Minimum confidence threshold for successful automation', 'ai'),
    ('training_data_retention_days', '90', 'Days to retain training session data', 'storage'),
    ('enable_traffic_analysis', 'true', 'Enable network traffic analysis for form detection', 'features'),
    ('enable_smart_waiting', 'true', 'Enable intelligent waiting for dynamic form elements', 'features')
ON CONFLICT (key) DO NOTHING;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers to all tables
CREATE TRIGGER update_form_patterns_updated_at 
    BEFORE UPDATE ON form_patterns 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_automation_jobs_updated_at 
    BEFORE UPDATE ON automation_jobs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_model_performance_updated_at 
    BEFORE UPDATE ON ai_model_performance 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_automation_queue_updated_at 
    BEFORE UPDATE ON automation_queue 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_automation_settings_updated_at 
    BEFORE UPDATE ON ai_automation_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for common queries
CREATE OR REPLACE VIEW user_automation_stats AS
SELECT 
    u.id as user_id,
    u.full_name,
    u.subscription_tier,
    u.automation_credits,
    COUNT(DISTINCT aj.id) as total_jobs,
    COUNT(DISTINCT CASE WHEN aj.status = 'completed' THEN aj.id END) as completed_jobs,
    COUNT(DISTINCT CASE WHEN aj.status = 'failed' THEN aj.id END) as failed_jobs,
    COUNT(DISTINCT fp.id) as total_patterns,
    AVG(CASE WHEN aj.status = 'completed' THEN aj.execution_time_ms END) as avg_execution_time,
    MAX(aj.created_at) as last_job_at
FROM users u
LEFT JOIN automation_jobs aj ON u.id = aj.user_id
LEFT JOIN form_patterns fp ON u.id = fp.user_id
GROUP BY u.id, u.full_name, u.subscription_tier, u.automation_credits;

-- Create view for active automation jobs
CREATE OR REPLACE VIEW active_automation_jobs AS
SELECT 
    aj.*,
    u.full_name as user_name,
    u.subscription_tier,
    cp.first_name || ' ' || cp.last_name as customer_name,
    fp.name as pattern_name,
    aq.queue_position,
    aq.priority
FROM automation_jobs aj
JOIN users u ON aj.user_id = u.id
LEFT JOIN customer_profiles cp ON aj.customer_profile_id = cp.id
LEFT JOIN form_patterns fp ON aj.form_pattern_id = fp.id
LEFT JOIN automation_queue aq ON aj.id = aq.automation_job_id
WHERE aj.status IN ('pending', 'running')
ORDER BY aq.priority DESC, aq.queue_position ASC;

-- Grant permissions (adjust as needed for your user)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

-- Migration completed successfully
SELECT 'KprCli AI Automation schema extension completed successfully' as status;