const { Markup } = require('telegraf');

const SUBSCRIPTION_PACKAGES = [
    { name: 'Basic', tokenCost: 500, description: '3 months access' },
    { name: 'Pro', tokenCost: 1200, description: '6 months access' },
    { name: 'Business', tokenCost: 2000, description: '8 months access' }
];

async function handleSubscriptionMenu(ctx) {
    try {
        const { db } = require('../../services/database');
        const user = ctx.from;
        
        // Get current subscription status
        const currentSubscription = await db.getUserSubscription(user.id);
        
        let statusText = '';
        if (currentSubscription) {
            const daysLeft = Math.ceil((new Date(currentSubscription.expires_at) - new Date()) / (1000 * 60 * 60 * 24));
            statusText = `\n🎯 Current Subscription: ${currentSubscription.plan_type}\n` +
                        `📅 Expires: ${new Date(currentSubscription.expires_at).toLocaleDateString()}\n` +
                        `⏰ Days remaining: ${daysLeft}\n\n`;
        } else {
            statusText = '\n💡 No active subscription\n\n';
        }
        
        const subscriptionButtons = SUBSCRIPTION_PACKAGES.map((pkg, index) => [
            Markup.button.callback(
                `${pkg.name} - ${pkg.tokenCost} tokens`,
                `subscription:${index}`
            )
        ]);
        
        await ctx.editMessageText(
            `🎫 Choose Your Subscription Plan${statusText}` +
            `💎 Benefits:\n` +
            `• Discounted prices\n` +
            `• Priority\n\n` +
            `💰 Current Balance: ${user.token_balance || 0} tokens`,
            Markup.inlineKeyboard([
                ...subscriptionButtons,
                [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
            ])
        );
    } catch (error) {
        console.error('Subscription menu error:', error);
        await ctx.reply('❌ Error loading subscription menu. Please try again.');
    }
}

async function handleSubscriptionPurchase(ctx, packageIndex) {
    try {
        const { db } = require('../../services/database');
        const user = ctx.from;
        const pkg = SUBSCRIPTION_PACKAGES[packageIndex];
        
        if (!pkg) {
            await ctx.reply('❌ Invalid subscription package.');
            return;
        }
        
        // Create subscription
        const subscription = await db.createSubscription(user.id, pkg.name, pkg.tokenCost);
        
        if (subscription) {
            await ctx.reply(
                `🎉 Subscription Activated!\n\n` +
                `📦 Plan: ${pkg.name}\n` +
                `💰 Cost: ${pkg.tokenCost} tokens\n` +
                `✅ Status: Active\n\n` +
                `Thank you for subscribing! 🙏`
            );
        }
    } catch (error) {
        console.error('Subscription purchase error:', error);
        await ctx.reply('❌ Subscription failed. Please try again or contact support.');
    }
}

module.exports = {
    handleSubscriptionMenu,
    handleSubscriptionPurchase,
    SUBSCRIPTION_PACKAGES
};
