require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const telegramNotification = require('../services/telegramNotification');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 8080;

console.log('🚀 TeleKpr CRM Server Starting...');

// Initialize Supabase with service key
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// Simple CORS - allow everything for admin panel
const corsOptions = {
    origin: '*',
    methods: '*',
    allowedHeaders: '*',
    credentials: false
};

// Input validation and sanitization middleware
const validateAndSanitize = (req, res, next) => {
    try {
        // Validate content length
        if (req.headers['content-length'] && parseInt(req.headers['content-length']) > 10000000) { // 10MB limit
            return res.status(413).json({ error: 'Request too large' });
        }
        
        // Don't sanitize login requests to avoid issues
        if (req.path === '/api/admin/login') {
            return next();
        }
        
        // Sanitize JSON body for other requests
        if (req.body && typeof req.body === 'object') {
            for (const key in req.body) {
                if (typeof req.body[key] === 'string') {
                    // Basic XSS prevention
                    req.body[key] = req.body[key]
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .trim();
                }
            }
        }
        
        next();
    } catch (error) {
        console.error('Validation middleware error:', error);
        next();
    }
};

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors(corsOptions));
app.use(validateAndSanitize);

// Manual CORS and anti-cache middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
    
    res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Serve Enhanced CRM Dashboard
app.get('/', (req, res) => {
    const filePath = path.join(__dirname, '../../admin.html');
    console.log('Serving admin panel from:', filePath);
    res.sendFile(filePath);
});

// Also serve admin.html directly
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../../admin.html'));
});

// Test page for debugging
app.get('/test', (req, res) => {
    res.sendFile(path.join(__dirname, '../../test-login.html'));
});

// =================== DASHBOARD ANALYTICS ===================

// Admin login endpoint
app.post('/api/admin/login', (req, res) => {
    try {
        console.log('Login attempt:', req.body);
        const { username, password } = req.body;
        
        if (username === 'admin' && password === 'admin123') {
            console.log('Login successful');
            res.json({ success: true, token: 'admin-token-123' });
        } else {
            console.log('Login failed - invalid credentials');
            res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Login endpoint error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Dashboard stats
app.get('/api/admin/stats', async (req, res) => {
    try {
        const [customersResult, ordersResult, usersResult, subscriptionsResult] = await Promise.all([
            supabase.from('customer_profiles').select('id', { count: 'exact' }),
            supabase.from('orders').select('id', { count: 'exact' }),
            supabase.from('users').select('id', { count: 'exact' }),
            supabase.from('subscriptions').select('id', { count: 'exact' })
        ]);

        // Revenue calculations
        const { data: revenueData } = await supabase
            .from('orders')
            .select('token_cost')
            .eq('status', 'completed');

        const totalRevenue = revenueData?.reduce((sum, order) => sum + (order.token_cost || 0), 0) || 0;

        // Today's stats
        const today = new Date().toISOString().split('T')[0];
        const { data: todayOrders } = await supabase
            .from('orders')
            .select('id')
            .gte('created_at', today);

        const { data: todayCustomers } = await supabase
            .from('customer_profiles')
            .select('id')
            .gte('created_at', today);

        // Get pending orders count
        const { data: pendingOrders } = await supabase
            .from('orders')
            .select('id')
            .eq('status', 'pending');

        res.json({
            totalUsers: usersResult.count || 0,
            totalOrders: ordersResult.count || 0,
            pendingOrders: pendingOrders?.length || 0,
            totalRevenue: totalRevenue,
            totalCustomers: customersResult.count || 0,
            totalSubscriptions: subscriptionsResult.count || 0
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Recent activity
app.get('/api/dashboard/activity', async (req, res) => {
    try {
        const { data: recentOrders } = await supabase
            .from('orders')
            .select(`
                id, created_at, status, product_name, token_cost,
                customer_profiles (first_name, last_name)
            `)
            .order('created_at', { ascending: false })
            .limit(10);

        const { data: recentCustomers } = await supabase
            .from('customer_profiles')
            .select('id, first_name, last_name, registered')
            .order('registered', { ascending: false })
            .limit(5);

        res.json({
            recent_orders: recentOrders || [],
            recent_customers: recentCustomers || []
        });
    } catch (error) {
        console.error('Activity error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Charts data
app.get('/api/dashboard/charts', async (req, res) => {
    try {
        // Orders by day (last 7 days)
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            days.push(date.toISOString().split('T')[0]);
        }

        const ordersByDay = await Promise.all(
            days.map(async (day) => {
                const { data } = await supabase
                    .from('orders')
                    .select('id')
                    .gte('created_at', day)
                    .lt('created_at', new Date(new Date(day).getTime() + 24 * 60 * 60 * 1000).toISOString());
                return { date: day, count: data?.length || 0 };
            })
        );

        // Orders by status
        const { data: orderStatuses } = await supabase
            .from('orders')
            .select('status');

        const statusCounts = {};
        orderStatuses?.forEach(order => {
            statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
        });

        res.json({
            orders_by_day: ordersByDay,
            orders_by_status: Object.entries(statusCounts).map(([status, count]) => ({ status, count }))
        });
    } catch (error) {
        console.error('Charts error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =================== CUSTOMER MANAGEMENT ===================

// Get customers with pagination and search
app.get('/api/admin/customers', async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', status = '' } = req.query;
        const offset = (page - 1) * limit;

        let query = supabase
            .from('customer_profiles')
            .select(`
                id, first_name, last_name, middle_name, email, phone, 
                gender, dob, address,
                city, state, postal, apt_suite,
                registered,
                users (telegram_username, token_balance, is_admin)
            `)
            .order('registered', { ascending: false })
            .range(offset, offset + limit - 1);

        if (search) {
            query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
        }

        const { data, error, count } = await query;
        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Customers error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get customer details
app.get('/api/admin/customers/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: customer, error } = await supabase
            .from('customer_profiles')
            .select(`
                *,
                users (*)
            `)
            .eq('id', id)
            .single();

        if (error) throw error;

        // Get customer's orders
        const { data: orders } = await supabase
            .from('orders')
            .select('*')
            .eq('customer_profile_id', id)
            .order('created_at', { ascending: false });

        res.json({
            customer,
            orders: orders || []
        });
    } catch (error) {
        console.error('Customer details error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update customer
app.put('/api/admin/customers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const { data, error } = await supabase
            .from('customer_profiles')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, customer: data });
    } catch (error) {
        console.error('Update customer error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete customer
app.delete('/api/admin/customers/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('customer_profiles')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true, message: 'Customer deleted successfully' });
    } catch (error) {
        console.error('Delete customer error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =================== ORDER MANAGEMENT ===================

// Get orders with pagination and filters
app.get('/api/admin/orders', async (req, res) => {
    try {
        const { page = 1, limit = 50, status = '', customer_id = '' } = req.query;
        const offset = (page - 1) * limit;

        let query = supabase
            .from('orders')
            .select(`
                *,
                customer_profiles (
                    id, first_name, last_name, middle_name, email, phone,
                    gender, dob, address,
                    city, state, postal,
                    users (telegram_username, telegram_id, token_balance)
                ),
                users!orders_user_id_fkey (telegram_username, telegram_id, token_balance)
            `)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (status) {
            query = query.eq('status', status);
        }

        if (customer_id) {
            query = query.eq('customer_profile_id', customer_id);
        }

        const { data, error, count } = await query;
        if (error) throw error;

        // Transform data to match frontend expectations
        const transformedOrders = (data || []).map(order => ({
            ...order,
            customer_name: order.customer_profiles ? 
                `${order.customer_profiles.first_name || ''} ${order.customer_profiles.last_name || ''}`.trim() || 'Unknown' : 'Unknown',
            telegram_id: order.users?.telegram_id || order.customer_profiles?.users?.telegram_id
        }));

        res.json(transformedOrders);
    } catch (error) {
        console.error('Orders error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update order status
app.put('/api/admin/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes = '' } = req.body;

        // First get the current order with user details
        const { data: currentOrder, error: fetchError } = await supabase
            .from('orders')
            .select(`
                *,
                users!orders_user_id_fkey (
                    telegram_id,
                    telegram_username
                )
            `)
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;
        if (!currentOrder) throw new Error('Order not found');

        const oldStatus = currentOrder.status;

        // Update the order
        const updates = { status, notes };
        if (status === 'completed') {
            updates.completed_at = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('orders')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Send notification to user if status changed
        if (oldStatus !== status && currentOrder.users?.telegram_id) {
            const notificationService = require('../services/telegramNotification');
            
            // Prepare order data for notification
            const orderForNotification = {
                ...data,
                admin_notes: notes
            };
            
            await notificationService.sendOrderStatusNotification(
                currentOrder.users.telegram_id,
                orderForNotification,
                oldStatus,
                status,
                'Admin'
            );
        }

        res.json({ success: true, order: data });
    } catch (error) {
        console.error('Update order error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =================== USER MANAGEMENT ===================

// Get users
app.get('/api/admin/users', async (req, res) => {
    try {
        const { page = 1, limit = 50, role = '' } = req.query;
        const offset = (page - 1) * limit;

        let query = supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (role === 'admin') {
            query = query.eq('is_admin', true);
        }

        const { data, error, count } = await query;
        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Users error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update user tokens (enhanced with Telegram notifications)
app.put('/api/admin/users/:id/tokens', async (req, res) => {
    try {
        const { id } = req.params;
        const { token_balance, operation, amount, admin_name = 'Admin' } = req.body;

        // Get current user data
        const { data: currentUser } = await supabase
            .from('users')
            .select('token_balance, telegram_id, telegram_username')
            .eq('id', id)
            .single();

        if (!currentUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        let newBalance;
        let tokenChange = 0;

        if (operation && amount) {
            const currentBalance = currentUser.token_balance || 0;
            newBalance = operation === 'add' ? currentBalance + amount : currentBalance - amount;
            newBalance = Math.max(0, newBalance); // Prevent negative balance
            tokenChange = newBalance - currentBalance;
        } else {
            const currentBalance = currentUser.token_balance || 0;
            newBalance = token_balance;
            tokenChange = newBalance - currentBalance;
        }

        // Update database
        const { data, error } = await supabase
            .from('users')
            .update({ token_balance: newBalance })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Send Telegram notification if there was a change
        if (tokenChange !== 0 && currentUser.telegram_id) {
            try {
                await telegramNotification.sendTokenNotification(
                    currentUser.telegram_id,
                    tokenChange,
                    newBalance,
                    admin_name
                );
                console.log(`📱 Token notification sent to @${currentUser.telegram_username}: ${tokenChange} tokens`);
            } catch (notificationError) {
                console.error('Notification error:', notificationError.message);
                // Don't fail the main operation if notification fails
            }
        }

        // Emit real-time update
        io.emit('user_updated', { user: data, action: 'tokens_updated', tokenChange });

        res.json({ 
            success: true, 
            user: data, 
            newBalance,
            tokenChange,
            notificationSent: tokenChange !== 0 && currentUser.telegram_id ? true : false
        });
    } catch (error) {
        console.error('Update tokens error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Bulk token operations (with Telegram notifications)
app.put('/api/admin/users/bulk/tokens', async (req, res) => {
    try {
        const { userIds, operation, amount, admin_name = 'Admin' } = req.body;

        const results = [];
        let notificationsSent = 0;

        for (const userId of userIds) {
            const { data: currentUser } = await supabase
                .from('users')
                .select('token_balance, telegram_id, telegram_username')
                .eq('id', userId)
                .single();
            
            if (currentUser) {
                const currentBalance = currentUser.token_balance || 0;
                const newBalance = Math.max(0, operation === 'add' ? currentBalance + amount : currentBalance - amount);
                const tokenChange = newBalance - currentBalance;

                const { data, error } = await supabase
                    .from('users')
                    .update({ token_balance: newBalance })
                    .eq('id', userId)
                    .select()
                    .single();

                if (!error) {
                    results.push(data);
                    
                    // Send Telegram notification
                    if (tokenChange !== 0 && currentUser.telegram_id) {
                        try {
                            await telegramNotification.sendTokenNotification(
                                currentUser.telegram_id,
                                tokenChange,
                                newBalance,
                                admin_name
                            );
                            notificationsSent++;
                        } catch (notificationError) {
                            console.error(`Notification error for user ${userId}:`, notificationError.message);
                        }
                    }
                    
                    io.emit('user_updated', { user: data, action: 'bulk_tokens_updated', tokenChange });
                }
            }
        }

        res.json({ 
            success: true, 
            updated: results.length, 
            users: results,
            notificationsSent 
        });
    } catch (error) {
        console.error('Bulk token update error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Toggle admin status
app.put('/api/admin/users/:id/admin', async (req, res) => {
    try {
        const { id } = req.params;
        const { is_admin } = req.body;

        const { data, error } = await supabase
            .from('users')
            .update({ is_admin })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, user: data });
    } catch (error) {
        console.error('Update admin status error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =================== ENHANCED ORDER MANAGEMENT ===================

// Get detailed order information
app.get('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: order, error } = await supabase
            .from('orders')
            .select(`
                *,
                customer_profiles (
                    id, first_name, last_name, middle_name, 
                    email, phone, city, state
                )
            `)
            .eq('id', id)
            .single();

        if (error) throw error;

        res.json({ success: true, order });
    } catch (error) {
        console.error('Order details error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Enhanced order status update (with Telegram notifications)
app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes = '', admin_notes = '', admin_name = 'Admin' } = req.body;

        // Get current order with customer info
        const { data: currentOrder } = await supabase
            .from('orders')
            .select(`
                *,
                customer_profiles (
                    first_name, last_name, email, user_id,
                    users (telegram_id, telegram_username)
                ),
                users!orders_user_id_fkey (telegram_id, telegram_username)
            `)
            .eq('id', id)
            .single();

        if (!currentOrder) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const oldStatus = currentOrder.status;

        const updates = { 
            status, 
            notes,
            admin_notes,
            updated_at: new Date().toISOString()
        };
        
        if (status === 'completed') {
            updates.completed_at = new Date().toISOString();
        } else if (status === 'cancelled') {
            updates.cancelled_at = new Date().toISOString();
        }

        // Update the order
        const { data, error } = await supabase
            .from('orders')
            .update(updates)
            .eq('id', id)
            .select(`
                *,
                customer_profiles (first_name, last_name, email)
            `)
            .single();

        if (error) throw error;

        // Send Telegram notification if status changed and user has Telegram ID
        const telegramId = currentOrder.users?.telegram_id || currentOrder.customer_profiles?.users?.telegram_id;
        const telegramUsername = currentOrder.users?.telegram_username || currentOrder.customer_profiles?.users?.telegram_username;
        
        if (oldStatus !== status && telegramId) {
            try {
                
                await telegramNotification.sendOrderStatusNotification(
                    telegramId,
                    { ...currentOrder, admin_notes }, // Include the updated admin notes
                    oldStatus,
                    status,
                    admin_name
                );
                
                console.log(`📱 Order notification sent to @${telegramUsername}: ${oldStatus} → ${status}`);
            } catch (notificationError) {
                console.error('Order notification error:', notificationError.message);
                // Don't fail the main operation if notification fails
            }
        }

        // Emit real-time update
        io.emit('order_updated', { 
            order: data, 
            action: 'status_changed',
            oldStatus,
            newStatus: status,
            notificationSent: oldStatus !== status && telegramId ? true : false
        });

        res.json({ 
            success: true, 
            order: data,
            oldStatus,
            newStatus: status,
            notificationSent: oldStatus !== status && telegramId ? true : false
        });
    } catch (error) {
        console.error('Update order error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =================== REAL-TIME LOGS MANAGEMENT ===================

// Get bot logs
app.get('/api/logs', async (req, res) => {
    try {
        const { type = 'combined', lines = 100 } = req.query;
        const logPath = path.join(__dirname, '../../logs');
        
        // Get the latest log file
        const today = new Date().toISOString().split('T')[0];
        const logFile = path.join(logPath, `${type}-${today}.log`);
        
        let logContent = '';
        if (fs.existsSync(logFile)) {
            const content = fs.readFileSync(logFile, 'utf8');
            const logLines = content.split('\n').filter(line => line.trim());
            logContent = logLines.slice(-lines).join('\n');
        } else {
            // Try the general log file
            const generalLog = path.join(logPath, `${type}.log`);
            if (fs.existsSync(generalLog)) {
                const content = fs.readFileSync(generalLog, 'utf8');
                const logLines = content.split('\n').filter(line => line.trim());
                logContent = logLines.slice(-lines).join('\n');
            }
        }
        
        res.json({ success: true, logs: logContent, type, timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('Logs error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Stream logs via WebSocket
let logWatchers = new Map();

app.post('/api/logs/stream/start', (req, res) => {
    try {
        const { type = 'combined' } = req.body;
        const logPath = path.join(__dirname, '../../logs');
        const today = new Date().toISOString().split('T')[0];
        const logFile = path.join(logPath, `${type}-${today}.log`);
        
        if (fs.existsSync(logFile)) {
            const watcher = fs.watchFile(logFile, (curr, prev) => {
                if (curr.mtime > prev.mtime) {
                    const content = fs.readFileSync(logFile, 'utf8');
                    const lines = content.split('\n').filter(line => line.trim());
                    const latestLines = lines.slice(-5); // Send last 5 new lines
                    io.emit('log_update', { type, lines: latestLines, timestamp: new Date().toISOString() });
                }
            });
            
            logWatchers.set(type, watcher);
            res.json({ success: true, message: `Started watching ${type} logs` });
        } else {
            res.status(404).json({ error: 'Log file not found' });
        }
    } catch (error) {
        console.error('Stream start error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/logs/stream/stop', (req, res) => {
    try {
        const { type } = req.body;
        if (logWatchers.has(type)) {
            fs.unwatchFile(logWatchers.get(type));
            logWatchers.delete(type);
        }
        res.json({ success: true, message: `Stopped watching ${type} logs` });
    } catch (error) {
        console.error('Stream stop error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =================== TELEGRAM NOTIFICATIONS ===================

// Test notification endpoint
app.post('/api/telegram/test', async (req, res) => {
    try {
        const { user_id, test_type = 'basic' } = req.body;

        if (!user_id) {
            return res.status(400).json({ error: 'user_id is required' });
        }

        // Get user's Telegram ID
        const { data: user } = await supabase
            .from('users')
            .select('telegram_id, telegram_username')
            .eq('id', user_id)
            .single();

        if (!user || !user.telegram_id) {
            return res.status(404).json({ error: 'User not found or no Telegram ID' });
        }

        const success = await telegramNotification.testNotification(user.telegram_id, test_type);

        res.json({
            success,
            message: success ? 'Test notification sent successfully' : 'Failed to send notification',
            telegram_username: user.telegram_username
        });
    } catch (error) {
        console.error('Test notification error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get notification service status
app.get('/api/telegram/status', (req, res) => {
    res.json({
        initialized: telegramNotification.isReady(),
        service: 'TelegramNotificationService',
        timestamp: new Date().toISOString()
    });
});

// Send custom notification
app.post('/api/telegram/notify', async (req, res) => {
    try {
        const { user_id, title, message, emoji = '📢' } = req.body;

        if (!user_id || !title || !message) {
            return res.status(400).json({ error: 'user_id, title, and message are required' });
        }

        // Get user's Telegram ID
        const { data: user } = await supabase
            .from('users')
            .select('telegram_id, telegram_username')
            .eq('id', user_id)
            .single();

        if (!user || !user.telegram_id) {
            return res.status(404).json({ error: 'User not found or no Telegram ID' });
        }

        const success = await telegramNotification.sendCustomNotification(
            user.telegram_id,
            title,
            message,
            emoji
        );

        res.json({
            success,
            message: success ? 'Notification sent successfully' : 'Failed to send notification',
            telegram_username: user.telegram_username
        });
    } catch (error) {
        console.error('Custom notification error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Broadcast notification to multiple users
app.post('/api/telegram/broadcast', async (req, res) => {
    try {
        const { user_ids, title, message, emoji = '📢' } = req.body;

        if (!user_ids || !Array.isArray(user_ids) || !title || !message) {
            return res.status(400).json({ error: 'user_ids (array), title, and message are required' });
        }

        // Get users' Telegram IDs
        const { data: users } = await supabase
            .from('users')
            .select('id, telegram_id, telegram_username')
            .in('id', user_ids);

        const telegramIds = users
            .filter(user => user.telegram_id)
            .map(user => user.telegram_id);

        if (telegramIds.length === 0) {
            return res.status(404).json({ error: 'No users found with Telegram IDs' });
        }

        const result = await telegramNotification.broadcastNotification(
            telegramIds,
            title,
            message,
            emoji
        );

        res.json({
            ...result,
            total_users: user_ids.length,
            users_with_telegram: telegramIds.length,
            message: `Broadcast completed: ${result.sent} sent, ${result.failed} failed`
        });
    } catch (error) {
        console.error('Broadcast notification error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =================== SYSTEM MANAGEMENT ===================

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const { data } = await supabase.from('users').select('id').limit(1);
        res.json({ 
            status: 'healthy', 
            database: 'connected',
            timestamp: new Date().toISOString() 
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'unhealthy', 
            database: 'disconnected',
            error: error.message,
            timestamp: new Date().toISOString() 
        });
    }
});

// Export customers specifically
app.get('/api/admin/customers/export', async (req, res) => {
    try {
        const { data: customers } = await supabase
            .from('customer_profiles')
            .select('*');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=customers-export-${new Date().toISOString().split('T')[0]}.csv`);
        
        // Convert to CSV
        if (customers && customers.length > 0) {
            const headers = Object.keys(customers[0]).join(',');
            const rows = customers.map(customer => 
                Object.values(customer).map(value => 
                    typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value
                ).join(',')
            );
            res.send([headers, ...rows].join('\n'));
        } else {
            res.send('');
        }
    } catch (error) {
        console.error('Export customers error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Export data
app.get('/api/export/:type', async (req, res) => {
    try {
        const { type } = req.params;
        let data;

        switch (type) {
            case 'customers':
                const { data: customers } = await supabase
                    .from('customer_profiles')
                    .select('*');
                data = customers;
                break;
            case 'orders':
                const { data: orders } = await supabase
                    .from('orders')
                    .select(`
                        *, 
                        customer_profiles (
                            id, first_name, last_name, middle_name, email, phone,
                            gender, dob, address,
                            city, state, postal,
                            users (telegram_username, telegram_id, token_balance)
                        )
                    `);
                data = orders;
                break;
            case 'users':
                const { data: users } = await supabase
                    .from('users')
                    .select('*');
                data = users;
                break;
            default:
                return res.status(400).json({ error: 'Invalid export type' });
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=${type}-export-${new Date().toISOString().split('T')[0]}.json`);
        res.json(data);
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Global error handler for API routes
app.use('/api', (err, req, res, next) => {
    console.error('API Error:', err);
    
    // Ensure JSON response for API routes
    if (!res.headersSent) {
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error',
            message: err.message 
        });
    }
});

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('🔌 Admin client connected:', socket.id);
    
    socket.on('join_logs', (data) => {
        socket.join('logs');
        console.log('📊 Client joined logs room');
    });
    
    socket.on('disconnect', () => {
        console.log('🔌 Admin client disconnected:', socket.id);
    });
});

// Start server with WebSocket support
server.listen(PORT, () => {
    console.log(`✅ TeleKpr CRM Server running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`🌐 http://82.25.90.200:${PORT}`);
    console.log(`🔌 WebSocket server ready for real-time updates`);
});

module.exports = app;