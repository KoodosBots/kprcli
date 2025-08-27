const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

console.log('🚀 CLEAN Admin Server Starting...');

// Initialize Supabase with service key
// Make sure to set SUPABASE_URL and SUPABASE_SERVICE_KEY in your .env file
const supabase = createClient(
    process.env.SUPABASE_URL || 'https://your-project-id.supabase.co',
    process.env.SUPABASE_SERVICE_KEY || 'your_supabase_service_key_here'
);

app.use(express.json());

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', '*');
    res.header('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Anti-cache
app.use((req, res, next) => {
    res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    next();
});

// Serve admin panel
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API test
app.get('/api/test', async (req, res) => {
    try {
        const { data } = await supabase.from('customer_profiles').select('id').limit(1);
        res.json({ status: 'success', message: 'Database connected', time: new Date().toISOString() });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
});

// Get customers
app.get('/api/customers', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('customer_profiles')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Delete customer
app.delete('/api/customers/:id', async (req, res) => {
    const id = req.params.id;
    console.log(`🗑️ Deleting customer: ${id}`);
    
    try {
        const { data, error } = await supabase
            .from('customer_profiles')
            .delete()
            .eq('id', id);
        
        console.log(`✅ Deletion result:`, { data, error });
        
        res.json({ 
            success: true, 
            message: 'Customer deleted successfully',
            id: id,
            time: new Date().toISOString()
        });
    } catch (err) {
        console.log(`❌ Deletion error:`, err);
        res.json({ 
            success: false, 
            error: err.message,
            id: id
        });
    }
});

// Get orders
app.get('/api/orders', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Get users
app.get('/api/users', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Get subscriptions
app.get('/api/subscriptions', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('subscriptions')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Clean Admin Server running on port ${PORT}`);
    console.log(`📍 http://82.25.90.200:${PORT}`);
});