async function ensureUser(ctx, next) {
    try {
        const { db } = require('../../services/database');
        const user = ctx.from;
        
        // Ensure user exists in database
        await db.ensureUser(user);
        
        return next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        await ctx.reply('❌ Authentication failed. Please try /start again.');
    }
}

async function requireSubscription(ctx, next) {
    try {
        const { db } = require('../../services/database');
        const subscription = await db.getUserSubscription(ctx.from.id);
        
        if (!subscription) {
            await ctx.reply(
                '🎫 This feature requires an active subscription.\n\n' +
                'Click below to view subscription plans:',
                { reply_markup: { inline_keyboard: [[{ text: '🎫 View Plans', callback_data: 'subscription' }]] } }
            );
            return;
        }
        
        return next();
    } catch (error) {
        console.error('Subscription middleware error:', error);
        await ctx.reply('❌ Error checking subscription status.');
    }
}

module.exports = {
    ensureUser,
    requireSubscription
};
