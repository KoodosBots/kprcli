-- Customer Management Schema for KprCli
-- Allows users to store and manage their client information

-- Customer profiles table - where users store their clients
CREATE TABLE IF NOT EXISTS public.customer_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Personal Information
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    middle_name TEXT,
    email TEXT,
    phone TEXT,
    dob DATE,
    gender TEXT CHECK (gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text, 'prefer_not_to_say'::text])),
    
    -- Address Information
    address TEXT,
    apt_suite TEXT,
    city TEXT,
    state TEXT,
    postal TEXT,
    
    -- Security
    password_encrypted TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    registered TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Products table - available products/services
CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    token_price INTEGER NOT NULL DEFAULT 0,
    category TEXT,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Orders table - user orders for their clients
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    customer_profile_id UUID REFERENCES public.customer_profiles(id) ON DELETE CASCADE NOT NULL,
    
    -- Order Details
    product_name TEXT NOT NULL,
    package_type TEXT NOT NULL CHECK (package_type = ANY (ARRAY['basic'::text, 'standard'::text, 'premium'::text, '250'::text, '550'::text, '650'::text, '850'::text, '1000'::text, '1200'::text, '1350'::text, '1500'::text])),
    token_cost INTEGER NOT NULL DEFAULT 0,
    sites_count INTEGER,
    
    -- Order Management
    status TEXT NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'assigned'::text, 'completed'::text, 'cancelled'::text])),
    priority INTEGER DEFAULT 0,
    is_priority BOOLEAN DEFAULT FALSE,
    queue_position INTEGER,
    
    -- Assignment
    operator_id UUID REFERENCES public.users(id),
    assigned_at TIMESTAMPTZ,
    
    -- Notes and Details
    notes TEXT,
    
    -- Rerun Support
    original_order_id UUID REFERENCES public.orders(id),
    is_rerun BOOLEAN DEFAULT FALSE,
    
    -- Discounts
    subscriber_discount_applied BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMPTZ
);

-- Product orders table - for individual product purchases
CREATE TABLE IF NOT EXISTS public.product_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    token_cost INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'cancelled'::text])),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Subscriptions table - user subscription plans
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    
    plan_type TEXT NOT NULL CHECK (plan_type = ANY (ARRAY['basic'::text, 'pro'::text, 'business'::text, 'monthly'::text, 'quarterly'::text, 'annual'::text])),
    plan_name TEXT,
    token_cost INTEGER NOT NULL DEFAULT 0,
    duration_days INTEGER,
    
    status TEXT NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'cancelled'::text])),
    
    started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Token transactions table - track token usage and purchases
CREATE TABLE IF NOT EXISTS public.token_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    
    transaction_type TEXT NOT NULL CHECK (transaction_type = ANY (ARRAY['purchase'::text, 'spend'::text, 'refund'::text, 'bonus'::text])),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    
    -- Payment information
    payment_method TEXT,
    payment_id TEXT,
    payment_status TEXT,
    
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Settings table - system-wide settings
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_customer_profiles_user_id ON public.customer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_email ON public.customer_profiles(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_profiles_phone ON public.customer_profiles(phone) WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_profile_id ON public.orders(customer_profile_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_operator_id ON public.orders(operator_id) WHERE operator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_product_orders_user_id ON public.product_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_product_orders_status ON public.product_orders(status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON public.subscriptions(expires_at);

CREATE INDEX IF NOT EXISTS idx_token_transactions_user_id ON public.token_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_token_transactions_type ON public.token_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_token_transactions_created_at ON public.token_transactions(created_at DESC);

-- Apply updated_at triggers to all new tables
CREATE TRIGGER update_customer_profiles_updated_at 
    BEFORE UPDATE ON public.customer_profiles 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at 
    BEFORE UPDATE ON public.products 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at 
    BEFORE UPDATE ON public.orders 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_orders_updated_at 
    BEFORE UPDATE ON public.product_orders 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at 
    BEFORE UPDATE ON public.subscriptions 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_settings_updated_at 
    BEFORE UPDATE ON public.settings 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on all new tables
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for customer_profiles
CREATE POLICY "Users can manage own customer profiles" ON public.customer_profiles
    FOR ALL USING (
        user_id IN (
            SELECT id FROM public.users WHERE clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Service role full access customer_profiles" ON public.customer_profiles
    FOR ALL USING (auth.role() = 'service_role');

-- RLS policies for orders
CREATE POLICY "Users can manage own orders" ON public.orders
    FOR ALL USING (
        user_id IN (
            SELECT id FROM public.users WHERE clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Service role full access orders" ON public.orders
    FOR ALL USING (auth.role() = 'service_role');

-- RLS policies for product_orders
CREATE POLICY "Users can manage own product orders" ON public.product_orders
    FOR ALL USING (
        user_id IN (
            SELECT id FROM public.users WHERE clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Service role full access product_orders" ON public.product_orders
    FOR ALL USING (auth.role() = 'service_role');

-- RLS policies for subscriptions
CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
    FOR ALL USING (
        user_id IN (
            SELECT id FROM public.users WHERE clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Service role full access subscriptions" ON public.subscriptions
    FOR ALL USING (auth.role() = 'service_role');

-- RLS policies for token_transactions
CREATE POLICY "Users can view own token transactions" ON public.token_transactions
    FOR SELECT USING (
        user_id IN (
            SELECT id FROM public.users WHERE clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Service role full access token_transactions" ON public.token_transactions
    FOR ALL USING (auth.role() = 'service_role');

-- RLS policies for products (public read access)
CREATE POLICY "Anyone can view active products" ON public.products
    FOR SELECT USING (is_active = TRUE);

CREATE POLICY "Service role full access products" ON public.products
    FOR ALL USING (auth.role() = 'service_role');

-- RLS policies for settings (read-only for authenticated users)
CREATE POLICY "Authenticated users can view settings" ON public.settings
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role full access settings" ON public.settings
    FOR ALL USING (auth.role() = 'service_role');

-- Insert some default products
INSERT INTO public.products (name, description, token_price, category) VALUES
('Basic Package', 'Basic automation package', 250, 'automation'),
('Standard Package', 'Standard automation package', 550, 'automation'),
('Premium Package', 'Premium automation package', 850, 'automation'),
('Business Package', 'Business automation package', 1200, 'automation')
ON CONFLICT DO NOTHING;

-- Insert default settings
INSERT INTO public.settings (key, value) VALUES
('max_orders_per_user', '100'),
('default_token_balance', '0'),
('subscription_plans', '{"basic": {"price": 250, "duration_days": 30}, "pro": {"price": 550, "duration_days": 30}, "business": {"price": 850, "duration_days": 30}}')
ON CONFLICT DO NOTHING;