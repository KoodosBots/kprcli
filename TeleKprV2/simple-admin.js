require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const telegramNotification = require('./src/services/telegramNotification');
const { db } = require('./src/services/database');

const app = express();
const PORT = 8082;

console.log('🚀 Simple Admin Server Starting...');

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// Middleware
app.use(express.json());

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Serve admin HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Login endpoint
app.post('/api/admin/login', (req, res) => {
    console.log('Login request received:', req.body);
    
    const { username, password } = req.body;
    
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    if (username === adminUsername && password === adminPassword) {
        console.log('Login successful');
        res.json({ success: true, token: 'admin-token-123' });
    } else {
        console.log('Login failed');
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});

// Enhanced stats endpoint with comprehensive analytics
app.get('/api/admin/stats', async (req, res) => {
    try {
        // Basic counts
        const [customersResult, ordersResult, usersResult, subscriptionsResult] = await Promise.all([
            supabase.from('customer_profiles').select('id', { count: 'exact' }),
            supabase.from('orders').select('id', { count: 'exact' }),
            supabase.from('users').select('id', { count: 'exact' }),
            supabase.from('subscriptions').select('id', { count: 'exact' })
        ]);

        // Order status breakdown
        const { data: ordersByStatus } = await supabase
            .from('orders')
            .select('status, token_cost');

        const statusCounts = {
            pending: 0,
            processing: 0,
            assigned: 0,
            completed: 0,
            cancelled: 0
        };

        // Calculate revenue from completed OxaPay payments only (USD amounts)
        const { data: oxaPayTransactions } = await supabase
            .from('token_transactions')
            .select('amount, description')
            .ilike('payment_method', 'oxapay')
            .eq('payment_status', 'completed');

        // Token package to USD price mapping (based on standard pricing)
        const tokenToUsdMapping = {
            100: 10,    // Starter Pack
            250: 25,    // Small Pack  
            350: 35,    // Custom Amount
            550: 55,    // Medium Pack
            1000: 100,  // Large Pack
            1200: 120,  // Custom Amount
            1250: 125,  // Custom Amount  
            1500: 150,  // Mega Pack
            3500: 350   // Custom Amount
        };

        const totalRevenue = oxaPayTransactions?.reduce((sum, transaction) => {
            // First try to extract USD amount from description
            const usdMatch = transaction.description?.match(/\$(\d+(?:\.\d+)?)/);
            if (usdMatch) {
                const usdAmount = parseFloat(usdMatch[1]);
                console.log(`Revenue: USD from description ${transaction.description} -> $${usdAmount}`);
                return sum + usdAmount;
            }
            
            // Fallback: Use token amount mapping to estimate USD
            const tokenAmount = transaction.amount;
            const estimatedUsd = tokenToUsdMapping[tokenAmount] || (tokenAmount * 0.1); // 10 cents per token fallback
            return sum + estimatedUsd;
        }, 0) || 0;

        let completedRevenue = 0;
        ordersByStatus?.forEach(order => {
            statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
            if (order.status === 'completed') {
                completedRevenue += order.token_cost || 0;
            }
        });

        // Recent orders (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: recentOrders } = await supabase
            .from('orders')
            .select('created_at, token_cost, status')
            .gte('created_at', thirtyDaysAgo.toISOString());

        // Calculate growth metrics - OxaPay revenue from last 30 days (USD amounts)
        const { data: recentOxaPayTransactions } = await supabase
            .from('token_transactions')
            .select('amount, description')
            .ilike('payment_method', 'oxapay')
            .eq('payment_status', 'completed')
            .gte('created_at', thirtyDaysAgo.toISOString());

        const currentMonthRevenue = recentOxaPayTransactions?.reduce((sum, transaction) => {
            // First try to extract USD amount from description
            const usdMatch = transaction.description?.match(/\$(\d+(?:\.\d+)?)/);
            if (usdMatch) {
                return sum + parseFloat(usdMatch[1]);
            }
            
            // Fallback: Use token amount mapping to estimate USD
            const tokenAmount = transaction.amount;
            const estimatedUsd = tokenToUsdMapping[tokenAmount] || (tokenAmount * 0.1);
            return sum + estimatedUsd;
        }, 0) || 0;

        // Average order value based on completed orders
        const avgOrderValue = statusCounts.completed > 0 ? Math.round(completedRevenue / statusCounts.completed) : 0;

        // Completion rate
        const completionRate = ordersResult.count > 0 ? 
            Math.round((statusCounts.completed / ordersResult.count) * 100) : 0;

        // User token balances
        const { data: userTokens } = await supabase
            .from('users')
            .select('token_balance');

        const totalTokensInSystem = userTokens?.reduce((sum, user) => {
            return sum + (user.token_balance || 0);
        }, 0) || 0;

        // Active subscribers
        const { data: activeSubscriptions } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('status', 'active');

        res.json({
            // Basic stats
            totalUsers: usersResult.count || 0,
            totalOrders: ordersResult.count || 0,
            totalCustomers: customersResult.count || 0,
            totalSubscriptions: subscriptionsResult.count || 0,
            
            // Order status breakdown
            pendingOrders: statusCounts.pending,
            processingOrders: statusCounts.processing,
            assignedOrders: statusCounts.assigned,
            completedOrders: statusCounts.completed,
            cancelledOrders: statusCounts.cancelled,
            
            // Financial metrics
            totalRevenue: totalRevenue,
            completedRevenue: completedRevenue,
            currentMonthRevenue: currentMonthRevenue,
            avgOrderValue: avgOrderValue,
            totalTokensInSystem: totalTokensInSystem,
            
            // Performance metrics
            completionRate: completionRate,
            activeSubscribers: activeSubscriptions?.length || 0,
            subscriptionRate: usersResult.count > 0 ? 
                Math.round(((activeSubscriptions?.length || 0) / usersResult.count) * 100) : 0,
            
            // Order status distribution for charts
            orderStatusDistribution: statusCounts,
            
            // Recent activity
            recentOrdersCount: recentOrders?.length || 0
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Time-series analytics endpoints
app.get('/api/admin/analytics/trends', async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(days));

        // Daily order and revenue trends
        const { data: orders } = await supabase
            .from('orders')
            .select('created_at, token_cost, status')
            .gte('created_at', daysAgo.toISOString())
            .order('created_at', { ascending: true });

        // Daily user registrations
        const { data: users } = await supabase
            .from('users')
            .select('created_at')
            .gte('created_at', daysAgo.toISOString())
            .order('created_at', { ascending: true });

        // Group data by day
        const dailyStats = {};
        
        // Initialize all days in range
        for (let i = 0; i < parseInt(days); i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateKey = date.toISOString().split('T')[0];
            dailyStats[dateKey] = {
                date: dateKey,
                orders: 0,
                revenue: 0,
                completedOrders: 0,
                users: 0
            };
        }

        // Process orders
        orders?.forEach(order => {
            const dateKey = order.created_at.split('T')[0];
            if (dailyStats[dateKey]) {
                dailyStats[dateKey].orders++;
                dailyStats[dateKey].revenue += order.token_cost || 0;
                if (order.status === 'completed') {
                    dailyStats[dateKey].completedOrders++;
                }
            }
        });

        // Process users
        users?.forEach(user => {
            const dateKey = user.created_at.split('T')[0];
            if (dailyStats[dateKey]) {
                dailyStats[dateKey].users++;
            }
        });

        const trendsData = Object.values(dailyStats).reverse();

        res.json({
            trends: trendsData,
            summary: {
                totalDays: parseInt(days),
                totalOrders: orders?.length || 0,
                totalRevenue: orders?.reduce((sum, o) => sum + (o.token_cost || 0), 0) || 0,
                totalUsers: users?.length || 0
            }
        });
    } catch (error) {
        console.error('Trends analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/analytics/performance', async (req, res) => {
    try {
        // Order processing time analysis
        const { data: completedOrders } = await supabase
            .from('orders')
            .select('created_at, completed_at, status')
            .eq('status', 'completed')
            .not('completed_at', 'is', null);

        const processingTimes = completedOrders?.map(order => {
            const created = new Date(order.created_at);
            const completed = new Date(order.completed_at);
            return Math.round((completed - created) / (1000 * 60 * 60)); // hours
        }).filter(time => time >= 0) || [];

        const avgProcessingTime = processingTimes.length > 0 ? 
            Math.round(processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length) : 0;

        // Package popularity
        const { data: packageStats } = await supabase
            .from('orders')
            .select('package_type, token_cost');

        const packagePopularity = {};
        packageStats?.forEach(order => {
            const pkg = order.package_type || 'unknown';
            if (!packagePopularity[pkg]) {
                packagePopularity[pkg] = { count: 0, revenue: 0 };
            }
            packagePopularity[pkg].count++;
            packagePopularity[pkg].revenue += order.token_cost || 0;
        });

        // Customer retention (subscribers)
        const { data: subscriptions } = await supabase
            .from('subscriptions')
            .select('created_at, status, expires_at');

        const activeSubscriptions = subscriptions?.filter(sub => sub.status === 'active').length || 0;
        const totalSubscriptions = subscriptions?.length || 0;
        const retentionRate = totalSubscriptions > 0 ? 
            Math.round((activeSubscriptions / totalSubscriptions) * 100) : 0;

        res.json({
            processing: {
                avgProcessingTimeHours: avgProcessingTime,
                totalCompletedOrders: completedOrders?.length || 0,
                processingTimes: processingTimes.slice(0, 100) // Last 100 for chart
            },
            packages: packagePopularity,
            retention: {
                activeSubscriptions,
                totalSubscriptions,
                retentionRate
            }
        });
    } catch (error) {
        console.error('Performance analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/analytics/revenue', async (req, res) => {
    try {
        const { period = 'monthly' } = req.query;
        
        let groupBy = 'YYYY-MM'; // Monthly by default
        let daysBack = 365;
        
        if (period === 'weekly') {
            groupBy = 'YYYY-WW';
            daysBack = 90;
        } else if (period === 'daily') {
            groupBy = 'YYYY-MM-DD';
            daysBack = 30;
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);

        const { data: revenueData } = await supabase
            .from('orders')
            .select('created_at, token_cost, status, subscriber_discount_applied')
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: true });

        // Group revenue by period
        const revenueByPeriod = {};
        let totalRevenue = 0;
        let subscriberRevenue = 0;
        let regularRevenue = 0;

        revenueData?.forEach(order => {
            const date = new Date(order.created_at);
            let periodKey;
            
            if (period === 'daily') {
                periodKey = date.toISOString().split('T')[0];
            } else if (period === 'weekly') {
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay());
                periodKey = weekStart.toISOString().split('T')[0];
            } else {
                periodKey = date.toISOString().substring(0, 7); // YYYY-MM
            }

            if (!revenueByPeriod[periodKey]) {
                revenueByPeriod[periodKey] = {
                    period: periodKey,
                    total: 0,
                    subscriber: 0,
                    regular: 0,
                    orders: 0
                };
            }

            const revenue = order.token_cost || 0;
            revenueByPeriod[periodKey].total += revenue;
            revenueByPeriod[periodKey].orders++;
            
            if (order.subscriber_discount_applied) {
                revenueByPeriod[periodKey].subscriber += revenue;
                subscriberRevenue += revenue;
            } else {
                revenueByPeriod[periodKey].regular += revenue;
                regularRevenue += revenue;
            }
            
            totalRevenue += revenue;
        });

        const periods = Object.values(revenueByPeriod).sort((a, b) => 
            new Date(a.period) - new Date(b.period)
        );

        res.json({
            periods,
            summary: {
                totalRevenue,
                subscriberRevenue,
                regularRevenue,
                subscriberPercentage: totalRevenue > 0 ? 
                    Math.round((subscriberRevenue / totalRevenue) * 100) : 0,
                period,
                daysBack
            }
        });
    } catch (error) {
        console.error('Revenue analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Orders endpoint
app.get('/api/admin/orders', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select(`
                *,
                customer_profiles (
                    first_name, middle_name, last_name, email, phone, 
                    address, city, state, postal, apt_suite,
                    gender, dob, password_encrypted
                ),
                users!orders_user_id_fkey (telegram_id, telegram_username, full_name)
            `)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        const transformedOrders = (data || []).map(order => ({
            ...order,
            customer_name: order.customer_profiles ? `${order.customer_profiles.first_name} ${order.customer_profiles.last_name || ''}`.trim() : 'Unknown',
            telegram_id: order.users?.telegram_id
        }));

        res.json(transformedOrders);
    } catch (error) {
        console.error('Orders error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Users endpoint with search support
app.get('/api/admin/users', async (req, res) => {
    try {
        const { search } = req.query;
        let query = supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500);

        // If search term provided, filter results
        if (search && search.trim()) {
            const searchTerm = search.trim();
            // Search by telegram_id (if numeric), username, or full name
            if (/^\d+$/.test(searchTerm)) {
                // If search term is numeric, search by telegram_id
                query = query.eq('telegram_id', parseInt(searchTerm));
            } else {
                // Otherwise search in username and full name
                query = query.or(`telegram_username.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`);
            }
        }

        const { data, error } = await query;

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Users error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Customers endpoint
app.get('/api/admin/customers', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('customer_profiles')
            .select('*')
            .order('registered', { ascending: false })
            .limit(50);

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Customers error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Subscriptions endpoint
app.get('/api/admin/subscriptions', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('subscriptions')
            .select(`
                *,
                users!subscriptions_user_id_fkey (
                    telegram_id,
                    telegram_username,
                    full_name
                )
            `)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Subscriptions error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update subscription status
app.put('/api/admin/subscriptions/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const { data, error } = await supabase
            .from('subscriptions')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, subscription: data });
    } catch (error) {
        console.error('Update subscription error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update order status
app.put('/api/admin/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes = '', admin_name = 'Admin' } = req.body;

        console.log(`Updating order ${id} status to ${status} with notes: ${notes}`);

        // First get the current order with user info
        const { data: currentOrder, error: fetchError } = await supabase
            .from('orders')
            .select(`
                *,
                users!orders_user_id_fkey (telegram_id, telegram_username)
            `)
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;
        if (!currentOrder) throw new Error('Order not found');

        const oldStatus = currentOrder.status;

        // Update the order
        const { data, error } = await supabase
            .from('orders')
            .update({ status, notes })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Send Telegram notification if status changed and user has Telegram ID
        if (oldStatus !== status && currentOrder.users?.telegram_id) {
            try {
                console.log(`Sending notification to user ${currentOrder.users.telegram_id}: ${oldStatus} → ${status}`);
                
                const success = await telegramNotification.sendOrderStatusNotification(
                    currentOrder.users.telegram_id,
                    { ...currentOrder, notes: notes },
                    oldStatus,
                    status,
                    admin_name
                );

                console.log(`📱 Notification ${success ? 'sent' : 'failed'} to @${currentOrder.users.telegram_username}`);
            } catch (notificationError) {
                console.error('Notification error:', notificationError.message);
                // Don't fail the main operation if notification fails
            }
        } else {
            console.log(`No notification sent: status unchanged (${oldStatus === status}) or no telegram ID (${!currentOrder.users?.telegram_id})`);
        }

        res.json({ 
            success: true, 
            order: data,
            notification_sent: oldStatus !== status && currentOrder.users?.telegram_id ? true : false
        });
    } catch (error) {
        console.error('Update order error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete order
app.delete('/api/admin/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if order exists
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', id)
            .single();

        if (orderError) {
            console.error('Order lookup error:', orderError);
            return res.status(404).json({ error: 'Order not found' });
        }

        // Delete the order
        const { error: deleteError } = await supabase
            .from('orders')
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.error('Delete order error:', deleteError);
            throw deleteError;
        }

        console.log(`Order deleted: ${id} (${order.product_name})`);
        res.json({ 
            success: true, 
            message: 'Order deleted successfully',
            deletedOrder: {
                id: order.id,
                product_name: order.product_name,
                token_cost: order.token_cost
            }
        });
    } catch (error) {
        console.error('Delete order error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update user tokens
app.put('/api/admin/users/:id/tokens', async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, description, operation = 'add' } = req.body;

        // Get current user
        const { data: currentUser, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', id)
            .single();

        if (userError) {
            console.error('User lookup error:', userError);
            return res.status(404).json({ error: 'User not found' });
        }

        // Calculate new balance based on operation
        let newBalance;
        let transactionType;
        let transactionAmount;

        if (operation === 'set') {
            newBalance = parseInt(amount);
            transactionType = 'admin_adjustment';
            transactionAmount = newBalance - currentUser.token_balance;
        } else {
            // Add or subtract
            transactionAmount = parseInt(amount);
            newBalance = currentUser.token_balance + transactionAmount;
            transactionType = transactionAmount > 0 ? 'admin_credit' : 'admin_debit';
        }

        // Ensure balance doesn't go negative
        if (newBalance < 0) {
            return res.status(400).json({ error: 'Token balance cannot be negative' });
        }

        // Update user balance
        const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({ token_balance: newBalance })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error('Update error:', updateError);
            throw updateError;
        }

        // Create transaction record
        await supabase
            .from('token_transactions')
            .insert({
                user_id: id,
                transaction_type: transactionType,
                amount: transactionAmount,
                balance_after: newBalance,
                description: description || 'Admin adjustment'
            });

        console.log(`Token adjustment: User ${id}, ${transactionAmount} tokens, new balance: ${newBalance}`);

        // Send Telegram notification to the user
        let notificationSent = false;
        try {
            if (currentUser.telegram_id && transactionAmount !== 0) {
                await telegramNotification.sendTokenNotification(
                    currentUser.telegram_id,
                    transactionAmount,
                    newBalance,
                    'Admin'
                );
                notificationSent = true;
                console.log(`✅ Token notification sent to user ${currentUser.telegram_id}`);
            }
        } catch (notificationError) {
            console.error('❌ Failed to send token notification:', notificationError);
        }

        res.json({ 
            success: true, 
            user: updatedUser,
            transaction: {
                amount: transactionAmount,
                newBalance: newBalance,
                description: description
            },
            notificationSent: notificationSent
        });
    } catch (error) {
        console.error('Update tokens error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Email confirmation pricing endpoint
app.get('/api/admin/email-confirmation-price', async (req, res) => {
    try {
        const [regularResult, subscriberResult] = await Promise.all([
            supabase
                .from('settings')
                .select('value')
                .eq('key', 'email_confirmation_price')
                .single(),
            supabase
                .from('settings')
                .select('value')
                .eq('key', 'email_confirmation_price_subscriber')
                .single()
        ]);

        let regularPrice = 50; // default
        let subscriberPrice = 30; // default

        if (regularResult.data && !regularResult.error) {
            regularPrice = parseInt(regularResult.data.value);
        }

        if (subscriberResult.data && !subscriberResult.error) {
            subscriberPrice = parseInt(subscriberResult.data.value);
        }

        res.json({ 
            regularPrice, 
            subscriberPrice 
        });
    } catch (error) {
        console.error('Get email confirmation price error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/email-confirmation-price', async (req, res) => {
    try {
        const { regularPrice, subscriberPrice } = req.body;

        if (!regularPrice || isNaN(regularPrice) || regularPrice < 1) {
            return res.status(400).json({ error: 'Regular price must be a positive number' });
        }

        if (!subscriberPrice || isNaN(subscriberPrice) || subscriberPrice < 1) {
            return res.status(400).json({ error: 'Subscriber price must be a positive number' });
        }

        // Update both prices
        const [regularResult, subscriberResult] = await Promise.all([
            supabase
                .from('settings')
                .upsert({
                    key: 'email_confirmation_price',
                    value: regularPrice.toString(),
                    updated_at: new Date().toISOString()
                })
                .select()
                .single(),
            supabase
                .from('settings')
                .upsert({
                    key: 'email_confirmation_price_subscriber',
                    value: subscriberPrice.toString(),
                    updated_at: new Date().toISOString()
                })
                .select()
                .single()
        ]);

        if (regularResult.error) throw regularResult.error;
        if (subscriberResult.error) throw subscriberResult.error;

        console.log('Email confirmation prices updated:', {
            regular: regularPrice,
            subscriber: subscriberPrice
        });

        res.json({ 
            success: true, 
            message: 'Email confirmation prices updated successfully',
            regularPrice: regularPrice,
            subscriberPrice: subscriberPrice
        });
    } catch (error) {
        console.error('Update email confirmation price error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Package pricing endpoints
app.get('/api/admin/pricing', async (req, res) => {
    try {
        // Get pricing from settings table, or use defaults
        const { data: pricingData, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'package_pricing')
            .single();

        let packages;
        if (pricingData && !error) {
            packages = JSON.parse(pricingData.value);
        } else {
            // Default pricing if not found in database
            packages = [
                { sites: 100, baseTokens: 100, tokens: 100, subscriberTokens: 60 },
                { sites: 250, baseTokens: 200, tokens: 250, subscriberTokens: 100 },
                { sites: 550, baseTokens: 550, tokens: 550, subscriberTokens: 350 },
                { sites: 650, baseTokens: 600, tokens: 650, subscriberTokens: 400 },
                { sites: 850, baseTokens: 800, tokens: 850, subscriberTokens: 600 },
                { sites: 1000, baseTokens: 850, tokens: 1000, subscriberTokens: 650 },
                { sites: 1200, baseTokens: 1200, tokens: 1200, subscriberTokens: 1000 },
                { sites: 1350, baseTokens: 1300, tokens: 1350, subscriberTokens: 1100 },
                { sites: 1500, baseTokens: 1500, tokens: 1500, subscriberTokens: 1200 }
            ];
        }

        res.json({ packages });
    } catch (error) {
        console.error('Get pricing error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/pricing', async (req, res) => {
    try {
        const { packages } = req.body;

        // Validate packages structure
        if (!Array.isArray(packages)) {
            return res.status(400).json({ error: 'Packages must be an array' });
        }

        for (const pkg of packages) {
            if (!pkg.sites || !pkg.baseTokens || !pkg.subscriberTokens) {
                return res.status(400).json({ error: 'Each package must have sites, baseTokens, and subscriberTokens' });
            }
            // Ensure subscriber price is not higher than base price
            if (pkg.subscriberTokens > pkg.baseTokens) {
                return res.status(400).json({ error: 'Subscriber price cannot be higher than base price' });
            }
        }

        // Save to settings table
        const { data, error } = await supabase
            .from('settings')
            .upsert({
                key: 'package_pricing',
                value: JSON.stringify(packages),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        console.log('Package pricing updated:', packages.length, 'packages');

        res.json({ 
            success: true, 
            message: 'Pricing updated successfully. Note: Bot restart required for changes to take effect.',
            packages 
        });
    } catch (error) {
        console.error('Update pricing error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/pricing/reload', async (req, res) => {
    try {
        // This endpoint can be used to reload pricing without restarting the bot
        res.json({ 
            success: true, 
            message: 'For pricing changes to take effect, the bot needs to be restarted.',
            action: 'restart_required'
        });
    } catch (error) {
        console.error('Reload pricing error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Toggle user admin status
app.put('/api/admin/users/:id/admin', async (req, res) => {
    try {
        const { id } = req.params;
        const { isAdmin } = req.body;

        // Update user admin status
        const { data, error } = await supabase
            .from('users')
            .update({ is_admin: isAdmin })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Admin toggle error:', error);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log(`Admin status updated: User ${id}, isAdmin: ${isAdmin}`);
        res.json({ 
            success: true, 
            user: data,
            message: `User ${isAdmin ? 'granted' : 'removed'} admin access successfully`
        });
    } catch (error) {
        console.error('Toggle admin error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete user
app.delete('/api/admin/users/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if user exists
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', id)
            .single();

        if (userError) {
            console.error('User lookup error:', userError);
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if user has any orders
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('id')
            .eq('user_id', id)
            .limit(1);

        if (ordersError) {
            console.error('Orders check error:', ordersError);
            return res.status(500).json({ error: 'Error checking user orders' });
        }

        if (orders && orders.length > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete user with existing orders. Please archive the user instead.' 
            });
        }

        // Delete user (this will cascade to related records)
        const { error: deleteError } = await supabase
            .from('users')
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.error('Delete error:', deleteError);
            throw deleteError;
        }

        console.log(`User deleted: ${id} (${user.telegram_username || user.full_name})`);
        res.json({ 
            success: true, 
            message: 'User deleted successfully',
            deletedUser: {
                id: user.id,
                name: user.full_name || user.telegram_username
            }
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update customer
app.put('/api/admin/customers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { first_name, last_name, phone, email, password_encrypted, address, city, state, postal } = req.body;

        // Update customer
        const { data, error } = await supabase
            .from('customer_profiles')
            .update({
                first_name,
                last_name,
                phone,
                email,
                password_encrypted,
                address,
                city,
                state,
                postal
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Customer update error:', error);
            return res.status(404).json({ error: 'Customer not found' });
        }

        console.log(`Customer updated: ${id} (${first_name} ${last_name || ''})`.trim());
        res.json({ 
            success: true, 
            customer: data,
            message: 'Customer updated successfully'
        });
    } catch (error) {
        console.error('Update customer error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete customer
app.delete('/api/admin/customers/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Check if customer exists
        const { data: customer, error: customerError } = await supabase
            .from('customer_profiles')
            .select('*')
            .eq('id', id)
            .single();

        if (customerError) {
            console.error('Customer lookup error:', customerError);
            return res.status(404).json({ error: 'Customer not found' });
        }

        // Check if customer has any orders
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('id')
            .eq('customer_profile_id', id)
            .limit(1);

        if (ordersError) {
            console.error('Orders check error:', ordersError);
            return res.status(500).json({ error: 'Error checking customer orders' });
        }

        if (orders && orders.length > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete customer with existing orders. Please archive the customer instead.' 
            });
        }

        // Delete customer
        const { error: deleteError } = await supabase
            .from('customer_profiles')
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.error('Delete error:', deleteError);
            throw deleteError;
        }

        console.log(`Customer deleted: ${id} (${customer.first_name} ${customer.last_name || ''})`.trim());
        res.json({ 
            success: true, 
            message: 'Customer deleted successfully',
            deletedCustomer: {
                id: customer.id,
                name: `${customer.first_name} ${customer.last_name || ''}`.trim()
            }
        });
    } catch (error) {
        console.error('Delete customer error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Export customers to CSV
app.get('/api/admin/customers/export', async (req, res) => {
    try {
        const { data: customers, error } = await supabase
            .from('customer_profiles')
            .select('*')
            .order('registered', { ascending: false });

        if (error) throw error;

        // Create CSV content
        const headers = [
            'Customer ID', 'First Name', 'Middle Name', 'Last Name', 'Phone', 'Email', 'Password', 'Address', 
            'City', 'State', 'Postal Code', 'Gender', 'DOB', 'Registered'
        ];
        
        const csvContent = [
            headers.join(','),
            ...customers.map(customer => [
                customer.id,
                `"${customer.first_name || ''}"`,
                `"${customer.middle_name || ''}"`,
                `"${customer.last_name || ''}"`,
                `"${customer.phone || ''}"`,
                `"${customer.email || ''}"`,
                `"${customer.password_encrypted || ''}"`,
                `"${customer.address || ''}"`,
                `"${customer.city || ''}"`,
                `"${customer.state || ''}"`,
                `"${customer.postal || ''}"`,
                `"${customer.gender || ''}"`,
                `"${customer.dob || ''}"`,
                `"${customer.registered || ''}"`
            ].join(','))
        ].join('\n');

        // Set headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="customers_${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csvContent);

        console.log(`Customer export requested: ${customers.length} customers`);
    } catch (error) {
        console.error('Export customers error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Restart bot endpoint
app.post('/api/admin/restart-bot', async (req, res) => {
    try {
        const { spawn } = require('child_process');
        
        console.log('🔄 Bot restart requested from admin panel');
        
        // Use PM2 to restart the bot
        const pm2Restart = spawn('pm2', ['restart', 'telekpr-bot'], { 
            stdio: 'pipe',
            shell: true 
        });
        
        let output = '';
        let errorOutput = '';
        
        pm2Restart.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        pm2Restart.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        pm2Restart.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Bot restarted successfully');
                console.log('PM2 output:', output);
            } else {
                console.error('❌ Bot restart failed with code:', code);
                console.error('PM2 error:', errorOutput);
            }
        });
        
        // Don't wait for the restart to complete, respond immediately
        res.json({ 
            success: true, 
            message: 'Bot restart initiated. Please wait a moment for the bot to come back online.',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Restart bot error:', error);
        res.status(500).json({ 
            error: 'Failed to restart bot',
            details: error.message 
        });
    }
});

// Get bot status endpoint
app.get('/api/admin/bot-status', async (req, res) => {
    try {
        const { spawn } = require('child_process');
        
        // Use PM2 to check bot status
        const pm2Status = spawn('pm2', ['jlist'], { 
            stdio: 'pipe',
            shell: true 
        });
        
        let output = '';
        let errorOutput = '';
        
        pm2Status.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        pm2Status.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        pm2Status.on('close', (code) => {
            if (code === 0) {
                try {
                    const processes = JSON.parse(output);
                    const botProcess = processes.find(p => p.name === 'telekpr-bot');
                    
                    if (botProcess) {
                        res.json({
                            success: true,
                            status: botProcess.pm2_env.status,
                            uptime: botProcess.pm2_env.pm_uptime,
                            restarts: botProcess.pm2_env.restart_time,
                            memory: botProcess.monit.memory,
                            cpu: botProcess.monit.cpu
                        });
                    } else {
                        res.json({
                            success: false,
                            error: 'Bot process not found'
                        });
                    }
                } catch (parseError) {
                    res.status(500).json({
                        success: false,
                        error: 'Failed to parse PM2 status'
                    });
                }
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Failed to get bot status'
                });
            }
        });
        
    } catch (error) {
        console.error('Get bot status error:', error);
        res.status(500).json({ 
            error: 'Failed to get bot status',
            details: error.message 
        });
    }
});

// Test notification endpoint
app.post('/api/admin/test-notification/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { test_type = 'basic' } = req.body;

        const success = await telegramNotification.testNotification(userId, test_type);
        res.json({ 
            success, 
            message: success ? 'Test notification sent' : 'Failed to send notification' 
        });
    } catch (error) {
        console.error('Test notification error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get users for broadcast selection
app.get('/api/admin/users/broadcast', async (req, res) => {
    try {
        // Get all users with telegram_id for broadcast selection
        const { data: allUsers, error } = await supabase
            .from('users')
            .select('id, telegram_id, telegram_username, full_name, is_admin')
            .not('telegram_id', 'is', null)
            .order('full_name', { ascending: true });

        if (error) {
            console.error('Database error fetching users for broadcast:', error);
            return res.status(500).json({ error: error.message });
        }

        // Format users for selection interface
        const users = allUsers.map(user => ({
            id: user.id,
            telegram_id: user.telegram_id,
            username: user.telegram_username || 'No username',
            name: user.full_name || 'No name',
            display_name: `${user.full_name || 'No name'} (@${user.telegram_username || 'no-username'})`,
            is_admin: user.is_admin || false
        }));

        res.json({
            success: true,
            users: users,
            total: users.length,
            admins: users.filter(u => u.is_admin).length,
            regular: users.filter(u => !u.is_admin).length
        });

    } catch (error) {
        console.error('Error fetching users for broadcast:', error);
        res.status(500).json({ error: error.message });
    }
});

// Broadcast message to users (with test mode or specific user selection)
app.post('/api/admin/broadcast', async (req, res) => {
    try {
        const { title, message, emoji = '📢', testMode = true, selectedUserIds = [] } = req.body;
        
        // Validation
        if (!title || !message) {
            return res.status(400).json({ 
                error: 'Title and message are required' 
            });
        }
        
        // Telegram message length limit
        const fullMessage = `${emoji} **${title}**\n\n${message}\n\n---\n🤖 TeleKpr CRM System`;
        if (fullMessage.length > 4096) {
            return res.status(400).json({ 
                error: 'Message too long. Maximum 4096 characters including formatting.',
                currentLength: fullMessage.length
            });
        }
        
        // Get users based on selection mode
        let users;
        let broadcastMode;
        
        if (testMode) {
            // Test mode - send to admins only
            users = await db.getAdminUsers();
            broadcastMode = 'TEST MODE (Admins Only)';
        } else if (selectedUserIds && selectedUserIds.length > 0) {
            // Specific users selected
            const { data: selectedUsers, error } = await supabase
                .from('users')
                .select('id, telegram_id, telegram_username, full_name, is_admin')
                .in('id', selectedUserIds)
                .not('telegram_id', 'is', null);
            
            if (error) {
                return res.status(500).json({ error: error.message });
            }
            
            users = selectedUsers;
            broadcastMode = `CUSTOM SELECTION (${users.length} users)`;
        } else {
            // Send to all users
            users = await db.getAllUsers();
            broadcastMode = 'LIVE MODE (All Users)';
        }
        
        if (!users || users.length === 0) {
            return res.json({ 
                success: false,
                error: 'No users found',
                testMode,
                totalUsers: 0
            });
        }
        
        // Log the broadcast attempt
        console.log(`📢 Broadcast initiated by admin:`, {
            mode: broadcastMode,
            userCount: users.length,
            title,
            messageLength: message.length,
            emoji,
            timestamp: new Date().toISOString()
        });
        
        // Initialize broadcast logging
        broadcastActive = true;
        broadcastLogs = [];
        addBroadcastLog(`🚀 Starting ${broadcastMode} broadcast to ${users.length} users`, 'info');
        addBroadcastLog(`📧 Title: "${title}" | Message: ${message.length} characters`, 'info');
        
        // Extract telegram IDs
        const telegramIds = users.map(u => u.telegram_id).filter(id => id);
        
        if (telegramIds.length === 0) {
            return res.json({ 
                success: false,
                error: 'No valid Telegram IDs found',
                testMode,
                totalUsers: users.length
            });
        }
        
        // Add test mode indicator to message if in test mode
        const finalMessage = testMode 
            ? `${message}\n\n🧪 [TEST MODE - Admin Only Broadcast]`
            : message;
        
        // Send broadcast using notification service
        const result = await telegramNotification.broadcastNotification(
            telegramIds, 
            title, 
            finalMessage, 
            emoji
        );
        
        // Log results
        console.log(`📊 Broadcast complete:`, {
            mode: testMode ? 'TEST' : 'LIVE',
            sent: result.sent,
            failed: result.failed,
            successRate: `${((result.sent / telegramIds.length) * 100).toFixed(1)}%`
        });
        
        res.json({
            success: true,
            testMode,
            totalUsers: users.length,
            validTelegramIds: telegramIds.length,
            sent: result.sent,
            failed: result.failed,
            successRate: `${((result.sent / telegramIds.length) * 100).toFixed(1)}%`,
            users: testMode ? users.map(u => ({
                username: u.telegram_username,
                name: u.full_name
            })) : undefined
        });
        
    } catch (error) {
        console.error('❌ Broadcast error:', error);
        res.status(500).json({ 
            error: 'Failed to send broadcast',
            details: error.message 
        });
    }
});

// Batch broadcast endpoint - send to users in batches of 100
app.post('/api/admin/broadcast/batch', async (req, res) => {
    try {
        const { title, message, emoji = '📢', testMode = true, selectedUserIds = [], batchSize = 100 } = req.body;
        
        // Validation
        if (!title || !message) {
            return res.status(400).json({ 
                error: 'Title and message are required' 
            });
        }
        
        // Get users based on selection mode (same as regular broadcast)
        let users;
        let broadcastMode;
        
        if (testMode) {
            users = await db.getAdminUsers();
            broadcastMode = 'TEST MODE (Admins Only)';
        } else if (selectedUserIds && selectedUserIds.length > 0) {
            const { data: selectedUsers, error } = await supabase
                .from('users')
                .select('id, telegram_id, telegram_username, full_name, is_admin')
                .in('id', selectedUserIds)
                .not('telegram_id', 'is', null);
            
            if (error) {
                return res.status(500).json({ error: error.message });
            }
            
            users = selectedUsers;
            broadcastMode = `BATCH SELECTION (${users.length} users)`;
        } else {
            users = await db.getAllUsers();
            broadcastMode = 'BATCH MODE (All Users)';
        }
        
        if (!users || users.length === 0) {
            return res.json({ 
                success: false,
                error: 'No users found',
                testMode,
                totalUsers: 0
            });
        }
        
        // Extract telegram IDs
        const telegramIds = users.map(u => u.telegram_id).filter(id => id);
        
        if (telegramIds.length === 0) {
            return res.json({ 
                success: false,
                error: 'No valid Telegram IDs found',
                testMode,
                totalUsers: users.length
            });
        }
        
        // Split users into batches
        const batches = [];
        for (let i = 0; i < telegramIds.length; i += batchSize) {
            batches.push(telegramIds.slice(i, i + batchSize));
        }
        
        console.log(`📢 Batch broadcast initiated:`, {
            mode: broadcastMode,
            totalUsers: telegramIds.length,
            batches: batches.length,
            batchSize,
            title,
            timestamp: new Date().toISOString()
        });
        
        // Process batches and track progress
        let totalSent = 0;
        let totalFailed = 0;
        const batchResults = [];
        
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const batchNumber = i + 1;
            
            console.log(`📦 Processing batch ${batchNumber}/${batches.length} (${batch.length} users)`);
            
            try {
                // Add test mode indicator if needed
                const finalMessage = testMode ? `🧪 TEST MODE\n\n${message}` : message;
                
                // Send batch using notification service
                const result = await telegramNotification.broadcastNotification(
                    batch, 
                    title, 
                    finalMessage, 
                    emoji
                );
                
                totalSent += result.sent;
                totalFailed += result.failed;
                
                batchResults.push({
                    batch: batchNumber,
                    users: batch.length,
                    sent: result.sent,
                    failed: result.failed,
                    successRate: `${((result.sent / batch.length) * 100).toFixed(1)}%`
                });
                
                console.log(`✅ Batch ${batchNumber} complete: ${result.sent}/${batch.length} sent`);
                
                // Small delay between batches to avoid overwhelming the system
                if (i < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
            } catch (batchError) {
                console.error(`❌ Batch ${batchNumber} failed:`, batchError);
                totalFailed += batch.length;
                batchResults.push({
                    batch: batchNumber,
                    users: batch.length,
                    sent: 0,
                    failed: batch.length,
                    error: batchError.message,
                    successRate: '0.0%'
                });
            }
        }
        
        const overallSuccessRate = ((totalSent / telegramIds.length) * 100).toFixed(1);
        
        console.log(`📊 Batch broadcast complete:`, {
            mode: testMode ? 'TEST' : 'LIVE',
            totalBatches: batches.length,
            totalSent,
            totalFailed,
            successRate: `${overallSuccessRate}%`
        });
        
        res.json({
            success: true,
            batchMode: true,
            testMode,
            totalUsers: telegramIds.length,
            totalBatches: batches.length,
            batchSize,
            sent: totalSent,
            failed: totalFailed,
            successRate: `${overallSuccessRate}%`,
            batches: batchResults,
            users: testMode ? users.map(u => ({ 
                username: u.telegram_username, 
                name: u.full_name 
            })) : undefined
        });
        
    } catch (error) {
        console.error('❌ Batch broadcast error:', error);
        res.status(500).json({ 
            error: 'Failed to send batch broadcast',
            details: error.message 
        });
    }
});

// Broadcast live logs storage
let broadcastLogs = [];
let broadcastActive = false;

function addBroadcastLog(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        message,
        type,
        time: new Date().toLocaleTimeString()
    };
    
    broadcastLogs.push(logEntry);
    
    // Keep only last 200 entries
    if (broadcastLogs.length > 200) {
        broadcastLogs.shift();
    }
    
    console.log(`📋 Live Log: ${message}`);
}

// Get current broadcast logs
app.get('/api/admin/broadcast/logs', async (req, res) => {
    try {
        const since = req.query.since ? new Date(req.query.since) : new Date(0);
        const recentLogs = broadcastLogs.filter(log => new Date(log.timestamp) > since);
        
        res.json({
            success: true,
            logs: recentLogs,
            active: broadcastActive,
            count: recentLogs.length
        });
    } catch (error) {
        console.error('Error fetching broadcast logs:', error);
        res.status(500).json({ error: error.message });
    }
});

// Clear broadcast logs
app.post('/api/admin/broadcast/logs/clear', async (req, res) => {
    try {
        broadcastLogs = [];
        res.json({ success: true, message: 'Logs cleared' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// System Logs Endpoints
const fs = require('fs');

// Get list of available log files
app.get('/api/admin/logs', async (req, res) => {
    try {
        const logsDir = path.join(__dirname, 'logs');
        
        if (!fs.existsSync(logsDir)) {
            return res.json({ files: [] });
        }

        const files = fs.readdirSync(logsDir)
            .filter(file => file.endsWith('.log'))
            .map(file => {
                const filePath = path.join(logsDir, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    size: stats.size,
                    modified: stats.mtime,
                    readable: file.includes('admin') || file.includes('bot') || file.includes('combined') || file.includes('error')
                };
            })
            .sort((a, b) => b.modified - a.modified);

        res.json({ files });
    } catch (error) {
        console.error('Get logs error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Read log file content with pagination
app.get('/api/admin/logs/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const { lines = 100, offset = 0, search = '' } = req.query;
        
        // Security: validate filename to prevent directory traversal
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({ error: 'Invalid filename' });
        }

        const logPath = path.join(__dirname, 'logs', filename);
        
        if (!fs.existsSync(logPath)) {
            return res.status(404).json({ error: 'Log file not found' });
        }

        const content = fs.readFileSync(logPath, 'utf8');
        let logLines = content.split('\n').filter(line => line.trim() !== '');
        
        // Apply search filter if provided
        if (search) {
            logLines = logLines.filter(line => 
                line.toLowerCase().includes(search.toLowerCase())
            );
        }

        // Apply pagination
        const startIndex = parseInt(offset);
        const endIndex = startIndex + parseInt(lines);
        const paginatedLines = logLines.slice(startIndex, endIndex);

        res.json({
            lines: paginatedLines,
            totalLines: logLines.length,
            hasMore: endIndex < logLines.length,
            filename,
            lastModified: fs.statSync(logPath).mtime
        });
    } catch (error) {
        console.error('Read log error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get latest log entries (for real-time updates)
app.get('/api/admin/logs/:filename/tail', async (req, res) => {
    try {
        const { filename } = req.params;
        const { lines = 50 } = req.query;
        
        // Security: validate filename
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({ error: 'Invalid filename' });
        }

        const logPath = path.join(__dirname, 'logs', filename);
        
        if (!fs.existsSync(logPath)) {
            return res.status(404).json({ error: 'Log file not found' });
        }

        const content = fs.readFileSync(logPath, 'utf8');
        const logLines = content.split('\n').filter(line => line.trim() !== '');
        const tailLines = logLines.slice(-parseInt(lines));

        res.json({
            lines: tailLines,
            totalLines: logLines.length,
            filename,
            lastModified: fs.statSync(logPath).mtime
        });
    } catch (error) {
        console.error('Tail log error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Download log file
app.get('/api/admin/logs/:filename/download', async (req, res) => {
    try {
        const { filename } = req.params;
        
        // Security: validate filename
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({ error: 'Invalid filename' });
        }

        const logPath = path.join(__dirname, 'logs', filename);
        
        if (!fs.existsSync(logPath)) {
            return res.status(404).json({ error: 'Log file not found' });
        }

        res.download(logPath, filename);
    } catch (error) {
        console.error('Download log error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Payment fallback status endpoint
app.get('/api/admin/payment-fallback-status', async (req, res) => {
    try {
        // Get stuck payments count
        const timeoutThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        
        const { data: stuckPayments, error } = await supabase
            .from('token_transactions')
            .select('id, payment_id, created_at, amount')
            .eq('payment_status', 'pending')
            .eq('transaction_type', 'purchase')
            .lt('created_at', timeoutThreshold)
            .order('created_at', { ascending: true });
            
        if (error) throw error;
        
        const { data: recentPending, error: recentError } = await supabase
            .from('token_transactions')
            .select('id')
            .eq('payment_status', 'pending')
            .eq('transaction_type', 'purchase')
            .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last hour
            
        const { data: recentCompleted, error: completedError } = await supabase
            .from('token_transactions')
            .select('id')
            .eq('payment_status', 'completed')
            .eq('transaction_type', 'purchase')
            .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last hour
            
        res.json({
            stuckPayments: stuckPayments || [],
            stuckCount: stuckPayments ? stuckPayments.length : 0,
            recentPendingCount: recentPending ? recentPending.length : 0,
            recentCompletedCount: recentCompleted ? recentCompleted.length : 0,
            isHealthy: stuckPayments ? stuckPayments.length === 0 : true,
            lastCheck: new Date().toISOString()
        });
    } catch (error) {
        console.error('Payment fallback status error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get token transactions
app.get('/api/admin/transactions', async (req, res) => {
    try {
        const { data: transactions, error } = await supabase
            .from('token_transactions')
            .select(`
                *,
                users!token_transactions_user_id_fkey (
                    telegram_id,
                    telegram_username,
                    full_name
                )
            `)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        // Format the transactions for the frontend
        const formattedTransactions = transactions.map(transaction => ({
            id: transaction.id,
            date: new Date(transaction.created_at).toLocaleString(),
            user: {
                telegram_id: transaction.users?.telegram_id || 'Unknown',
                telegram_username: transaction.users?.telegram_username || 'Unknown',
                full_name: transaction.users?.full_name || 'Unknown User'
            },
            transaction_type: transaction.transaction_type,
            amount: transaction.amount,
            balance_after: transaction.balance_after,
            payment_method: transaction.payment_method || 'N/A',
            payment_id: transaction.payment_id || 'N/A',
            payment_status: transaction.payment_status || 'N/A',
            description: transaction.description || 'No description'
        }));

        res.json(formattedTransactions);
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get stuck payments for review
app.get('/api/admin/stuck-payments', async (req, res) => {
    try {
        const PaymentFallbackService = require('./src/services/paymentFallback');
        const fallbackService = new PaymentFallbackService();
        
        const stuckPayments = await fallbackService.getStuckPaymentsForReview();
        
        res.json(stuckPayments);
    } catch (error) {
        console.error('Get stuck payments error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Manually approve a payment
app.post('/api/admin/approve-payment', async (req, res) => {
    try {
        const { paymentId, adminNote } = req.body;
        
        if (!paymentId) {
            return res.status(400).json({ error: 'Payment ID required' });
        }
        
        const PaymentFallbackService = require('./src/services/paymentFallback');
        const fallbackService = new PaymentFallbackService();
        
        const result = await fallbackService.manuallyApprovePayment(paymentId, adminNote);
        
        res.json(result);
    } catch (error) {
        console.error('Manual payment approval error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get payment fallback status
app.get('/api/admin/fallback-status', async (req, res) => {
    try {
        const PaymentFallbackService = require('./src/services/paymentFallback');
        const fallbackService = new PaymentFallbackService();
        
        const status = await fallbackService.getStatus();
        
        res.json(status);
    } catch (error) {
        console.error('Get fallback status error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Manual fallback trigger endpoint (deprecated - kept for compatibility)
app.post('/api/admin/trigger-fallback', async (req, res) => {
    res.status(400).json({ 
        error: 'Manual fallback triggering is disabled for security',
        message: 'Use the new payment approval system instead'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`✅ Simple Admin Server running on port ${PORT}`);
    console.log(`🌐 http://82.25.90.200:${PORT}`);
});