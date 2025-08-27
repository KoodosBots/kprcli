const { handleStart, handleAccount } = require('./handlers/user.handler');
const { handleSubscriptionMenu, handleSubscriptionPurchase } = require('./handlers/subscription.handler');
const { handleShop, handleCreateCustomer, handleShopAs, handleOrder, handleTextInput, handleCancelRegistration, handleMyOrders, handleViewOrder, handleTokenHistory, handleHelp, handleConfirmOrder, handleAddEmailWithPassword, handleSetPasswordConfirm, handleAddPassword, handleSkipPassword } = require('./handlers/shop.handler');
const { ensureUser } = require('./middleware/auth.middleware');

function setupRoutes(bot) {
    // Middleware
    bot.use(ensureUser);
    
    // Commands
    bot.start(handleStart);
    bot.command('account', handleAccount);
    bot.command('subscription', handleSubscriptionMenu);
    
    // Callback queries
    bot.action('account', handleAccount);
    bot.action('subscription', handleSubscriptionMenu);
    bot.action(/subscription:(\d+)/, (ctx) => {
        const packageIndex = parseInt(ctx.match[1]);
        return handleSubscriptionPurchase(ctx, packageIndex);
    });
    
    // Shop actions
    bot.action('shop', handleShop);
    bot.action('create_customer', handleCreateCustomer);
    bot.action(/shop_as:(.+)/, handleShopAs);
    bot.action(/order:(.+):(.+)/, handleOrder);
    bot.action('cancel_registration', handleCancelRegistration);
    bot.action('add_password', handleAddPassword);
    bot.action('skip_password', handleSkipPassword);
    
    // Order confirmation actions
    bot.action(/confirm_order:(.+):(.+):(.+)/, handleConfirmOrder);
    bot.action(/add_email_with_password:(.+):(.+)/, handleAddEmailWithPassword);
    bot.action(/set_password_confirm:(.+):(.+)/, handleSetPasswordConfirm);
    
    // Order and account actions
    bot.action('my_orders', handleMyOrders);
    bot.action(/view_order:(.+)/, handleViewOrder);
    bot.action('token_history', handleTokenHistory);
    bot.action('help', handleHelp);
    
    // Text input handler for customer registration
    bot.on('text', handleTextInput);
    
    bot.action('back_to_menu', handleStart);
    
    // Error handling
    bot.catch((err, ctx) => {
        console.error('Bot error:', err);
        ctx.reply('❌ Something went wrong. Please try again.').catch(() => {});
    });
}

module.exports = { setupRoutes };
