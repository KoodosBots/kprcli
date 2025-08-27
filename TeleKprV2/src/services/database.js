const { createClient } = require('@supabase/supabase-js');
const { createLogger } = require('../utils/logger');
const { DatabaseError } = require('../utils/errorHandler');

const logger = createLogger({ component: 'SupabaseClient' });

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

// Database operations
const db = {
    // User operations
    async createUser(telegramId, username, fullName) {
        const operationLogger = logger.child({ operation: 'createUser', telegramId, username });
        
        try {
            // First check if user already exists in our users table
            operationLogger.dbQuery('select', 'users', { telegramId });
            const { data: existingUser, error: lookupError } = await supabase
                .from('users')
                .select('*')
                .eq('telegram_id', telegramId)
                .single();
            
            if (existingUser && !lookupError) {
                console.log(`Found existing user for telegram_id ${telegramId}`);
                return existingUser;
            }
            
            operationLogger.dbQuery('create', 'auth.users', { telegramId });
            
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email: `${telegramId}@telegram.local`,
                password: Math.random().toString(36).slice(-12),
                email_confirm: true
            });

            if (authError) {
                // If user already exists in auth but not in our table, create user with random UUID
                if (authError.message.includes('already been registered')) {
                    console.log(`Auth user exists for ${telegramId}, creating user record with new UUID...`);
                    
                    // Create user record with a new UUID (not linked to auth)
                    const { data: newUser, error: insertError } = await supabase
                        .from('users')
                        .insert({
                            telegram_id: telegramId,
                            telegram_username: username,
                            full_name: fullName,
                            token_balance: 0,
                            is_admin: false,
                            is_operator: false
                        })
                        .select()
                        .single();
                    
                    if (!insertError && newUser) {
                        console.log(`Successfully created user record for telegram_id ${telegramId}`);
                        return newUser;
                    } else {
                        console.error('Failed to create user record:', insertError);
                    }
                }
                
                operationLogger.dbError(authError, 'create', 'auth.users');
                throw new DatabaseError(`Failed to create auth user: ${authError.message}`, 'create', 'auth.users');
            }

            operationLogger.dbQuery('insert', 'users', { userId: authData.user.id });
            
            const { data, error } = await supabase
                .from('users')
                .insert({
                    id: authData.user.id,
                    telegram_id: telegramId,
                    telegram_username: username,
                    full_name: fullName
                })
                .select()
                .single();

            if (error) {
                operationLogger.dbError(error, 'insert', 'users');
                throw new DatabaseError(`Failed to create user record: ${error.message}`, 'insert', 'users');
            }
            
            operationLogger.info('User created successfully', { userId: data.id });
            return data;
        } catch (error) {
            if (error instanceof DatabaseError) throw error;
            operationLogger.error('Unexpected error in createUser', error);
            throw new DatabaseError('Failed to create user', 'create', 'users');
        }
    },

    async ensureUser(telegramUser) {
        const operationLogger = logger.child({ operation: 'ensureUser', telegramId: telegramUser.id });
        
        try {
            // Check if user already exists
            const existingUser = await this.getUserByTelegramId(telegramUser.id);
            if (existingUser) {
                operationLogger.info('User already exists', { userId: existingUser.id });
                return existingUser;
            }
            
            // Create new user
            const userData = await this.createUser(
                telegramUser.id,
                telegramUser.username,
                `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim()
            );
            
            operationLogger.info('New user created', { userId: userData.id });
            return userData;
        } catch (error) {
            operationLogger.error('Failed to ensure user', error);
            throw error;
        }
    },

    async getUserByTelegramId(telegramId) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_id', telegramId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    async getUserById(userId) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;
        return data;
    },

    async updateTokenBalance(userId, amount, transactionType, description, paymentMethod = null, paymentId = null) {
        const { data, error } = await supabase
            .rpc('update_token_balance', {
                p_user_id: userId,
                p_amount: amount,
                p_transaction_type: transactionType,
                p_description: description,
                p_payment_method: paymentMethod,
                p_payment_id: paymentId
            });

        if (error) throw error;
        return data;
    },

    // Subscription operations
    async hasActiveSubscription(userId) {
        const { data, error } = await supabase
            .rpc('has_active_subscription', { p_user_id: userId });

        if (error) throw error;
        return data;
    },

    async getUserSubscription(userId) {
        const { data, error } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .gte('expires_at', new Date().toISOString())
            .single();

        if (error && error.code !== 'PGRST116') return null;
        return data;
    },

    async createSubscription(userId, planType, tokenCost) {
        const { data, error } = await supabase
            .rpc('create_subscription', {
                p_user_id: userId,
                p_plan_type: planType,
                p_token_cost: tokenCost
            });

        if (error) throw error;
        return data;
    },

    // Customer profile operations - Enhanced
    async createCustomerProfile(userId, profileData) {
        const { data, error } = await supabase
            .from('customer_profiles')
            .insert({
                user_id: userId,
                ...profileData
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async getCustomerProfiles(userId) {
        const { data, error } = await supabase
            .from('customer_profiles')
            .select('*')
            .eq('user_id', userId)
            .order('registered', { ascending: false });

        if (error) throw error;
        return data;
    },

    async getCustomerProfile(profileId) {
        const { data, error } = await supabase
            .from('customer_profiles')
            .select('*')
            .eq('id', profileId)
            .single();

        if (error) throw error;
        return data;
    },

    async updateCustomerProfile(profileId, updates) {
        // Add updated_at timestamp
        const updateData = {
            ...updates,
            updated_at: new Date().toISOString()
        };
        
        const { data, error } = await supabase
            .from('customer_profiles')
            .update(updateData)
            .eq('id', profileId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deleteCustomerProfile(profileId, userId) {
        console.log(`🗑️ deleteCustomerProfile called - profileId: ${profileId}, userId: ${userId}`);
        
        const { data, error } = await supabase
            .from('customer_profiles')
            .delete()
            .eq('id', profileId)
            .eq('user_id', userId)
            .select();

        if (error) {
            console.error('❌ Supabase delete error:', error);
            throw error;
        }
        
        console.log(`✅ Delete result:`, data);
        
        if (!data || data.length === 0) {
            console.warn('⚠️ No rows deleted - customer may not exist or user does not own it');
            throw new Error('Customer not found or you do not have permission to delete it');
        }
        
        return data;
    },

    // Alias functions for bot compatibility
    async getUserCustomers(userId) {
        return this.getCustomerProfiles(userId);
    },

    async getCustomerById(customerId) {
        return this.getCustomerProfile(customerId);
    },

    async createCustomer(customerData) {
        return this.createCustomerProfile(customerData.user_id, customerData);
    },

    // Order operations - Enhanced
    async createOrder(userId, customerId, packageType, productName, tokenCost, isPriority = false, hasSubscriptionDiscount = false, sitesCount = null) {
        const { data: queuePosition } = await supabase
            .rpc('get_next_queue_position');

        const { data, error } = await supabase
            .from('orders')
            .insert({
                user_id: userId,
                customer_profile_id: customerId,
                package_type: packageType,
                product_name: productName,
                token_cost: tokenCost,
                queue_position: queuePosition,
                is_priority: isPriority,
                sites_count: sitesCount || parseInt(packageType),
                subscriber_discount_applied: hasSubscriptionDiscount
            })
            .select()
            .single();

        if (error) throw error;

        // Token deduction is handled by the caller (bot.js) to avoid double deduction
        // await this.updateTokenBalance(userId, -tokenCost, 'spend', `Order #${data.id.slice(0, 8)}`);

        return data;
    },

    async createRerunOrder(originalOrderId, userId) {
        const { data, error } = await supabase
            .rpc('create_rerun_order', {
                p_original_order_id: originalOrderId,
                p_user_id: userId
            });

        if (error) throw error;
        return data;
    },

    async getUserOrders(userId, limit = 10) {
        const { data, error } = await supabase
            .from('orders')
            .select(`
                *,
                customer_profiles (*)
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data;
    },

    async getOrderById(orderId) {
        const { data, error } = await supabase
            .from('orders')
            .select(`
                *,
                customer_profiles (*)
            `)
            .eq('id', orderId)
            .single();

        if (error) throw error;
        return data;
    },

    async getPendingOrders() {
        const { data, error } = await supabase
            .from('orders')
            .select(`
                *,
                customer_profiles (*),
                users!orders_user_id_fkey (
                    telegram_username,
                    full_name
                )
            `)
            .in('status', ['pending', 'processing'])
            .order('is_priority', { ascending: false })
            .order('queue_position', { ascending: true });

        if (error) throw error;
        return data;
    },

    async assignOrder(orderId, adminId) {
        const { data, error } = await supabase
            .from('orders')
            .update({
                assigned_to: adminId,
                status: 'assigned',
                assigned_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async updateOrderStatus(orderId, status, notes = null) {
        const updates = { status };
        if (notes) updates.notes = notes;
        if (status === 'completed') {
            updates.completed_at = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('orders')
            .update(updates)
            .eq('id', orderId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async getAssignedOrders(adminId = null) {
        let query = supabase
            .from('orders')
            .select(`
                *,
                customer_profiles (*),
                users!orders_user_id_fkey (
                    telegram_username,
                    full_name
                )
            `)
            .eq('status', 'assigned')
            .order('assigned_at', { ascending: true });

        if (adminId) {
            query = query.eq('assigned_to', adminId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    // Product operations
    async getActiveProducts() {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async getProductById(productId) {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', productId)
            .single();

        if (error) throw error;
        return data;
    },

    async createProductOrder(userId, productId, tokenCost) {
        const { data, error } = await supabase
            .from('product_orders')
            .insert({
                user_id: userId,
                product_id: productId,
                token_cost: tokenCost
            })
            .select()
            .single();

        if (error) throw error;

        // Deduct tokens
        await this.updateTokenBalance(userId, -tokenCost, 'spend', `Product order #${data.id.slice(0, 8)}`);

        return data;
    },

    // Settings operations
    async getSettings(key) {
        const { data, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', key)
            .single();

        if (error) throw error;
        return data.value;
    },

    async updateSettings(key, value) {
        const { data, error } = await supabase
            .from('settings')
            .upsert({
                key,
                value,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Admin operations
    async makeAdmin(userId) {
        const { data, error } = await supabase
            .from('users')
            .update({ is_admin: true })
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async removeAdmin(userId) {
        const { data, error } = await supabase
            .from('users')
            .update({ is_admin: false })
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async getStats() {
        // Get total users
        const { count: totalUsers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });

        // Get total orders
        const { count: totalOrders } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true });

        // Get pending orders
        const { count: pendingOrders } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .in('status', ['pending', 'processing']);

        // Get today's orders
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const { count: todayOrders } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today.toISOString());

        // Get active subscriptions
        const { count: activeSubscriptions } = await supabase
            .from('subscriptions')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active')
            .gte('expires_at', new Date().toISOString());

        // Get total revenue (tokens spent)
        const { data: revenueData } = await supabase
            .from('token_transactions')
            .select('amount')
            .eq('transaction_type', 'purchase');

        const totalRevenue = revenueData?.reduce((sum, t) => sum + t.amount, 0) || 0;

        return {
            totalUsers,
            totalOrders,
            pendingOrders,
            todayOrders,
            activeSubscriptions,
            totalRevenue
        };
    },

    // Product management (admin)
    async createProduct(productData) {
        const { data, error } = await supabase
            .from('products')
            .insert(productData)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async updateProduct(productId, updates) {
        const { data, error } = await supabase
            .from('products')
            .update(updates)
            .eq('id', productId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async toggleProductStatus(productId) {
        const { data: product } = await supabase
            .from('products')
            .select('is_active')
            .eq('id', productId)
            .single();

        const { data, error } = await supabase
            .from('products')
            .update({ is_active: !product.is_active })
            .eq('id', productId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Subscription management (admin)
    async getAllSubscriptions(limit = 50) {
        const { data, error } = await supabase
            .from('subscriptions')
            .select(`
                *,
                users (
                    telegram_username,
                    full_name
                )
            `)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data;
    },

    async cancelSubscription(subscriptionId) {
        const { data, error } = await supabase
            .from('subscriptions')
            .update({ 
                status: 'cancelled',
                updated_at: new Date().toISOString()
            })
            .eq('id', subscriptionId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Token transaction operations
    async createTokenTransaction(transactionData) {
        const { data, error } = await supabase
            .from('token_transactions')
            .insert(transactionData)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async getTransactionByPaymentId(paymentId) {
        const { data, error } = await supabase
            .from('token_transactions')
            .select('*')
            .eq('payment_id', paymentId)
            .eq('payment_status', 'pending')
            .single();

        if (error && error.code !== 'PGRST116') return null;
        return data;
    },

    async updateTransactionStatus(paymentId, status) {
        const { data, error } = await supabase
            .from('token_transactions')
            .update({ 
                payment_status: status
            })
            .eq('payment_id', paymentId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async getUserById(userId) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error && error.code !== 'PGRST116') return null;
        return data;
    },

    // Renamed from updateTokenBalance to updateUserTokenBalance for consistency
    async updateUserTokenBalance(userId, amount, transactionType, description, paymentMethod = null, paymentId = null, paymentStatus = 'completed') {
        const { data, error } = await supabase
            .rpc('update_token_balance', {
                p_user_id: userId,
                p_amount: amount,
                p_transaction_type: transactionType,
                p_description: description,
                p_payment_method: paymentMethod,
                p_payment_id: paymentId
            });

        if (error) throw error;
        return data;
    },

    // Make user admin by telegram ID
    async makeUserAdmin(telegramId) {
        const { data, error } = await supabase
            .rpc('make_user_admin', {
                p_telegram_id: telegramId
            });

        if (error) throw error;
        return data;
    },

    // Get admin users for broadcast testing
    async getAdminUsers() {
        const operationLogger = logger.child({ operation: 'getAdminUsers' });
        
        try {
            operationLogger.dbQuery('select', 'users', { is_admin: true });
            
            const { data, error } = await supabase
                .from('users')
                .select('id, telegram_id, telegram_username, full_name, is_admin')
                .eq('is_admin', true)
                .not('telegram_id', 'is', null)
                .order('created_at', { ascending: false });
            
            if (error) {
                operationLogger.dbError(error, 'select', 'users');
                throw new DatabaseError(`Failed to get admin users: ${error.message}`, 'select', 'users');
            }
            
            operationLogger.info('Admin users retrieved', { count: data.length });
            return data;
        } catch (error) {
            if (error instanceof DatabaseError) throw error;
            operationLogger.error('Unexpected error in getAdminUsers', error);
            throw new DatabaseError('Failed to get admin users', 'select', 'users');
        }
    },

    // Get all users for broadcast messaging
    async getAllUsers() {
        const operationLogger = logger.child({ operation: 'getAllUsers' });
        
        try {
            operationLogger.dbQuery('select', 'users', {});
            
            const { data, error } = await supabase
                .from('users')
                .select('id, telegram_id, telegram_username, full_name')
                .not('telegram_id', 'is', null)
                .order('created_at', { ascending: false });
            
            if (error) {
                operationLogger.dbError(error, 'select', 'users');
                throw new DatabaseError(`Failed to get all users: ${error.message}`, 'select', 'users');
            }
            
            operationLogger.info('All users retrieved', { count: data.length });
            return data;
        } catch (error) {
            if (error instanceof DatabaseError) throw error;
            operationLogger.error('Unexpected error in getAllUsers', error);
            throw new DatabaseError('Failed to get all users', 'select', 'users');
        }
    }
};

module.exports = { supabase, db };