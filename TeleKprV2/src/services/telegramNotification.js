const { Telegram } = require('telegraf');

class TelegramNotificationService {
    constructor() {
        // Force IPv4 for DNS resolution to avoid IPv6 timeout issues
        // Set DNS to prefer IPv4 addresses
        process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
        
        // Use Telegram API directly (not Telegraf) to avoid conflicts with main bot
        this.telegram = new Telegram(process.env.TELEGRAM_BOT_TOKEN);
        this.isInitialized = false;
        this.init();
    }

    async init() {
        try {
            // Test the bot token
            const botInfo = await this.telegram.getMe();
            console.log(`📱 Telegram Notification Service initialized for bot: @${botInfo.username}`);
            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Failed to initialize Telegram Notification Service:', error.message);
            this.isInitialized = false;
        }
    }

    async sendTokenNotification(userId, tokenChange, newBalance, adminName = 'Admin') {
        if (!this.isInitialized) {
            console.warn('⚠️ Telegram service not initialized, skipping notification');
            return false;
        }

        try {
            const action = tokenChange > 0 ? 'added to' : 'deducted from';
            const amount = Math.abs(tokenChange);
            const emoji = tokenChange > 0 ? '🎉' : '⚠️';
            
            const message = `${emoji} **Token Balance Update**

💰 **${amount} tokens** have been ${action} your account by ${adminName}

📊 **New Balance:** ${newBalance} tokens

${tokenChange > 0 
    ? '✨ Enjoy your additional tokens!' 
    : '📝 Please contact support if you have questions about this adjustment.'
}

---
🤖 TeleKpr CRM System`;

            await this.telegram.sendMessage(userId, message, {
                parse_mode: 'Markdown'
            });

            console.log(`✅ Token notification sent to user ${userId}: ${tokenChange} tokens`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to send token notification to user ${userId}:`, error.message);
            return false;
        }
    }

    async sendOrderStatusNotification(userId, order, oldStatus, newStatus, adminName = 'Admin') {
        if (!this.isInitialized) {
            console.warn('⚠️ Telegram service not initialized, skipping notification');
            return false;
        }

        try {
            const statusEmojis = {
                pending: '⏳',
                processing: '🔄',
                completed: '✅',
                cancelled: '❌'
            };

            const statusMessages = {
                pending: 'Your order is now pending and will be processed soon.',
                processing: 'Great news! Your order is now being processed.',
                completed: '🎉 Congratulations! Your order has been completed successfully.',
                cancelled: 'Your order has been cancelled. Please contact support if you need assistance.'
            };

            const message = `${statusEmojis[newStatus]} **Order Status Update**

📦 **Order #${order.id.slice(0, 8)}**
🛍️ **Product:** ${order.product_name || 'N/A'}
💰 **Amount:** ${(order.token_cost || 0).toLocaleString()} tokens

📈 **Status Changed:** ${statusEmojis[oldStatus]} ${oldStatus.toUpperCase()} → ${statusEmojis[newStatus]} ${newStatus.toUpperCase()}

${statusMessages[newStatus]}

${order.notes ? `📝 **Admin Notes:** ${order.notes}` : ''}

---
Updated by: ${adminName}
🤖 TeleKpr CRM System`;

            await this.telegram.sendMessage(userId, message, {
                parse_mode: 'Markdown'
            });

            console.log(`✅ Order status notification sent to user ${userId}: ${oldStatus} → ${newStatus}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to send order notification to user ${userId}:`, error.message);
            return false;
        }
    }

    async sendCustomNotification(userId, title, message, emoji = '📢') {
        if (!this.isInitialized) {
            console.warn('⚠️ Telegram service not initialized, skipping notification');
            return false;
        }

        try {
            const formattedMessage = `${emoji} **${title}**

${message}

---
🤖 TeleKpr CRM System`;

            await this.telegram.sendMessage(userId, formattedMessage, {
                parse_mode: 'Markdown'
            });

            console.log(`✅ Custom notification sent to user ${userId}: ${title}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to send custom notification to user ${userId}:`, error.message);
            return false;
        }
    }

    async broadcastNotification(userIds, title, message, emoji = '📢') {
        if (!this.isInitialized) {
            console.warn('⚠️ Telegram service not initialized, skipping broadcast');
            return { sent: 0, failed: 0 };
        }

        let sent = 0;
        let failed = 0;

        for (const userId of userIds) {
            try {
                const success = await this.sendCustomNotification(userId, title, message, emoji);
                if (success) sent++;
                else failed++;
            } catch (error) {
                failed++;
            }
            
            // Rate limiting - small delay between messages
            await this.sleep(100);
        }

        console.log(`📊 Broadcast complete: ${sent} sent, ${failed} failed`);
        return { sent, failed };
    }

    async testNotification(userId, testType = 'basic') {
        if (!this.isInitialized) {
            return false;
        }

        try {
            const testMessages = {
                basic: {
                    title: 'Test Notification',
                    message: 'This is a test notification from TeleKpr CRM. If you received this, notifications are working correctly!',
                    emoji: '🧪'
                },
                token: async () => {
                    return await this.sendTokenNotification(userId, 100, 1000, 'Test Admin');
                },
                order: async () => {
                    const testOrder = {
                        id: 'test-order-123',
                        product_name: 'Test Product',
                        token_cost: 500,
                        admin_notes: 'This is a test order status notification'
                    };
                    return await this.sendOrderStatusNotification(userId, testOrder, 'pending', 'completed', 'Test Admin');
                }
            };

            if (typeof testMessages[testType] === 'function') {
                return await testMessages[testType]();
            } else {
                const test = testMessages[testType] || testMessages.basic;
                return await this.sendCustomNotification(userId, test.title, test.message, test.emoji);
            }
        } catch (error) {
            console.error(`❌ Test notification failed:`, error.message);
            return false;
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Get user's Telegram ID from database
    async getUserTelegramId(userId) {
        try {
            // This should be implemented based on your user schema
            // For now, we'll assume the userId is the Telegram ID
            // In a real implementation, you'd query your database here
            return userId;
        } catch (error) {
            console.error('❌ Failed to get user Telegram ID:', error.message);
            return null;
        }
    }

    isReady() {
        return this.isInitialized;
    }
}

module.exports = new TelegramNotificationService();