require('dotenv').config();

const { Telegraf, session } = require('telegraf');
const { setupRoutes } = require('./router');
const express = require('express');

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Add session support
bot.use(session());

// Setup routes
setupRoutes(bot);

// Webhook server for payments and health checks
const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;

async function startBot() {
    try {
        console.log('🤖 Starting TeleKpr bot...');
        
        if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
            // Production: use webhooks
            await bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}/webhook`);
            app.use(bot.webhookCallback('/webhook'));
            app.listen(PORT, () => {
                console.log(`✅ Bot webhook server running on port ${PORT}`);
            });
        } else {
            // Development: use polling
            app.listen(PORT, () => {
                console.log(`🌐 Webhook server running on port ${PORT}`);
            });
            await bot.launch();
            console.log('✅ TeleKpr bot is running in polling mode');
        }
        
        // Graceful shutdown
        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));
        
    } catch (error) {
        console.error('❌ Failed to start bot:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    startBot();
}

module.exports = { bot, startBot };
