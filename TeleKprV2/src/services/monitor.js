require('dotenv').config();
const { db } = require('./services/database');
const { createLogger } = require('./utils/logger');

// Simple monitoring service
class TeleKprMonitor {
    constructor() {
        this.checkInterval = 60000; // 1 minute
        this.isRunning = false;
        this.logger = createLogger({ component: 'TeleKprMonitor' });
    }

    async start() {
        this.isRunning = true;
        this.logger.info('TeleKpr Monitor started', { checkInterval: this.checkInterval });
        
        // Initial check
        await this.performHealthCheck();
        
        // Set up interval
        this.intervalId = setInterval(async () => {
            if (this.isRunning) {
                await this.performHealthCheck();
            }
        }, this.checkInterval);
    }

    async stop() {
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.logger.info('🛑 TeleKpr Monitor stopped');
    }

    async performHealthCheck() {
        try {
            const timestamp = new Date().toISOString();
            
            // Check database connectivity
            const stats = await db.getStats();
            
            // Log health status
            this.logger.info(`✅ [${timestamp}] Health check passed - Users: ${stats.totalUsers}, Orders: ${stats.totalOrders}, Pending: ${stats.pendingOrders}`);
            
            // Check for stuck orders (pending for more than 24 hours)
            await this.checkStuckOrders();
            
            // Check system resources
            const memUsage = process.memoryUsage();
            const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);
            
            if (memMB > 500) {
                this.logger.warn(`High memory usage detected: ${memMB}MB`, { memoryUsage: memMB });
            }
            
        } catch (error) {
            this.logger.error(`❌ [${new Date().toISOString()}] Health check failed:`, error.message);
            
            // Alert mechanisms could be added here
            // - Send notification to admin
            // - Log to external service
            // - Restart services if needed
        }
    }

    async checkStuckOrders() {
        try {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            
            const { data: stuckOrders, error } = await db.supabase
                .from('orders')
                .select('id, created_at, status')
                .eq('status', 'pending')
                .lt('created_at', twentyFourHoursAgo.toISOString());

            if (error) throw error;

            if (stuckOrders && stuckOrders.length > 0) {
                this.logger.warn(`Found ${stuckOrders.length} orders stuck in pending status for >24h`, {
                    stuckOrdersCount: stuckOrders.length,
                    stuckOrders: stuckOrders.map(order => ({
                        id: order.id.slice(0, 8),
                        createdAt: order.created_at
                    }))
                });
            }
        } catch (error) {
            this.logger.error('Error checking stuck orders:', error);
        }
    }

    async generateDailyReport() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const { data: todayOrders } = await db.supabase
                .from('orders')
                .select('*')
                .gte('created_at', today.toISOString());

            const { data: completedToday } = await db.supabase
                .from('orders')
                .select('*')
                .eq('status', 'completed')
                .gte('completed_at', today.toISOString());

            const stats = await db.getStats();

            const report = {
                date: today.toDateString(),
                totalUsers: stats.totalUsers,
                totalOrders: stats.totalOrders,
                pendingOrders: stats.pendingOrders,
                todayOrders: todayOrders?.length || 0,
                completedToday: completedToday?.length || 0,
                timestamp: new Date().toISOString()
            };

            this.logger.info('📊 Daily Report:', JSON.stringify(report, null, 2));
            
            return report;
        } catch (error) {
            this.logger.error('Error generating daily report:', error);
        }
    }
}

// Start monitor
const monitor = new TeleKprMonitor();

// Generate daily report at midnight
const scheduleDaily = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
        monitor.generateDailyReport();
        // Schedule for next day
        setInterval(() => monitor.generateDailyReport(), 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
};

// Create logger for process handlers
const processLogger = createLogger({ component: 'TeleKprMonitor-Process' });

// Graceful shutdown
process.on('SIGINT', async () => {
    processLogger.info('Received SIGINT, shutting down gracefully...');
    await monitor.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    processLogger.info('Received SIGTERM, shutting down gracefully...');
    await monitor.stop();
    process.exit(0);
});

// Start services
monitor.start();
scheduleDaily();

// Generate initial report
setTimeout(() => monitor.generateDailyReport(), 5000);