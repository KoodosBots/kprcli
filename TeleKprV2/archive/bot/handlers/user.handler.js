const { Markup } = require('telegraf');

async function handleStart(ctx) {
    try {
        const { db } = require('../../services/database');
        const user = ctx.from;
        
        // Ensure user exists in database
        await db.ensureUser(user);
        
        const welcomeMessage = `🎉 Welcome to TeleKpr!\n\n` +
            `🤖 Your AI-powered Telegram assistant for:\n` +
            `• 📦 Product ordering\n` +
            `• 🎫 Subscription management\n` +
            `• 💰 Token balance tracking\n\n` +
            `Let's get started! 🚀`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📋 My Account', 'account')],
            [Markup.button.callback('🛍️ Shop Products', 'shop')],
            [Markup.button.callback('🎫 Subscriptions', 'subscription')],
            [Markup.button.callback('ℹ️ Help & Support', 'help')]
        ]);

        await ctx.reply(welcomeMessage, keyboard);
    } catch (error) {
        console.error('Start command error:', error);
        await ctx.reply('❌ Welcome failed. Please try again.');
    }
}

async function handleAccount(ctx) {
    try {
        const { db } = require('../../services/database');
        const user = ctx.from;
        
        const userInfo = await db.getUserByTelegramId(user.id);
        const subscription = await db.getUserSubscription(user.id);
        
        let subscriptionText = '❌ No active subscription';
        if (subscription) {
            const daysLeft = Math.ceil((new Date(subscription.expires_at) - new Date()) / (1000 * 60 * 60 * 24));
            subscriptionText = `✅ ${subscription.plan_type} (${daysLeft} days left)`;
        }
        
        const accountMessage = `👤 Account Information\n\n` +
            `📱 Telegram: @${user.username || 'N/A'}\n` +
            `🆔 User ID: ${user.id}\n` +
            `💰 Token Balance: ${userInfo?.token_balance || 0}\n` +
            `🎫 Subscription: ${subscriptionText}\n` +
            `📅 Member since: ${new Date(userInfo?.created_at || Date.now()).toLocaleDateString()}`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🎫 Manage Subscription', 'subscription')],
            [Markup.button.callback('💰 Token History', 'token_history')],
            [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
        ]);

        await ctx.editMessageText(accountMessage, keyboard);
    } catch (error) {
        console.error('Account error:', error);
        await ctx.reply('❌ Error loading account. Please try again.');
    }
}

module.exports = {
    handleStart,
    handleAccount
};
