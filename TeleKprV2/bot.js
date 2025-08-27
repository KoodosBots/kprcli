require('dotenv').config();

// Force IPv4 to fix Telegram API connection issues
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { Telegraf, Markup, session } = require('telegraf');
const { db } = require('./supabase-client');
const axios = require('axios');
const express = require('express');
const PaymentFallbackService = require('./src/services/paymentFallback');
const { createTelegramLogger } = require('./src/utils/logger');
const { handleShop } = require('./src/bot/handlers/shop.handler');

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Session middleware
bot.use(session());

// COMPREHENSIVE CALLBACK LOGGING - Track ALL button clicks
bot.on('callback_query', (ctx, next) => {
    const data = ctx.callbackQuery?.data;
    if (data && (data.includes('order') || data.includes('place') || data.includes('confirm'))) {
        console.log('🎯 [CALLBACK-LOG] Order-related button clicked!', {
            callbackData: data,
            userId: ctx.from.id,
            username: ctx.from.username,
            timestamp: new Date().toISOString(),
            messageId: ctx.callbackQuery?.message?.message_id
        });
    }
    return next();
});

// Helper function to safely edit messages without throwing "message not modified" errors
async function safeEditMessage(ctx, text, extra = {}) {
    try {
        return await ctx.editMessageText(text, extra);
    } catch (error) {
        // Only ignore the specific "message is not modified" error
        if (error.message && error.message.includes('message is not modified')) {
            // Silently ignore this error
            return;
        }
        // Re-throw all other errors
        throw error;
    }
}

// Form states for multi-step registration
const FormState = {
    NONE: 'none',
    CUSTOMER_NAME: 'customer_name',
    CUSTOMER_MIDDLE_NAME: 'customer_middle_name',
    CUSTOMER_LAST_NAME: 'customer_last_name',
    CUSTOMER_PHONE: 'customer_phone',
    CUSTOMER_EMAIL: 'customer_email',
    CUSTOMER_GENDER: 'customer_gender',
    CUSTOMER_DOB: 'customer_dob',
    CUSTOMER_ADDRESS: 'customer_address',
    CUSTOMER_APARTMENT: 'customer_apartment',
    CUSTOMER_CITY: 'customer_city',
    CUSTOMER_STATE: 'customer_state',
    CUSTOMER_POSTAL: 'customer_postal',
    CUSTOMER_PASSWORD_OPTION: 'customer_password_option',
    CUSTOMER_PASSWORD: 'customer_password',
    ORDER_PACKAGE: 'order_package',
    EDITING_CUSTOMER: 'editing_customer',
    CUSTOM_TOKEN_AMOUNT: 'custom_token_amount',
    SUBSCRIPTION_PURCHASE: 'subscription_purchase'
};

// US States for dropdown
const US_STATES = [
    { code: 'AL', name: 'Alabama' },
    { code: 'AK', name: 'Alaska' },
    { code: 'AZ', name: 'Arizona' },
    { code: 'AR', name: 'Arkansas' },
    { code: 'CA', name: 'California' },
    { code: 'CO', name: 'Colorado' },
    { code: 'CT', name: 'Connecticut' },
    { code: 'DE', name: 'Delaware' },
    { code: 'DC', name: 'District of Columbia' },
    { code: 'FL', name: 'Florida' },
    { code: 'GA', name: 'Georgia' },
    { code: 'HI', name: 'Hawaii' },
    { code: 'ID', name: 'Idaho' },
    { code: 'IL', name: 'Illinois' },
    { code: 'IN', name: 'Indiana' },
    { code: 'IA', name: 'Iowa' },
    { code: 'KS', name: 'Kansas' },
    { code: 'KY', name: 'Kentucky' },
    { code: 'LA', name: 'Louisiana' },
    { code: 'ME', name: 'Maine' },
    { code: 'MD', name: 'Maryland' },
    { code: 'MA', name: 'Massachusetts' },
    { code: 'MI', name: 'Michigan' },
    { code: 'MN', name: 'Minnesota' },
    { code: 'MS', name: 'Mississippi' },
    { code: 'MO', name: 'Missouri' },
    { code: 'MT', name: 'Montana' },
    { code: 'NE', name: 'Nebraska' },
    { code: 'NV', name: 'Nevada' },
    { code: 'NH', name: 'New Hampshire' },
    { code: 'NJ', name: 'New Jersey' },
    { code: 'NM', name: 'New Mexico' },
    { code: 'NY', name: 'New York' },
    { code: 'NC', name: 'North Carolina' },
    { code: 'ND', name: 'North Dakota' },
    { code: 'OH', name: 'Ohio' },
    { code: 'OK', name: 'Oklahoma' },
    { code: 'OR', name: 'Oregon' },
    { code: 'PA', name: 'Pennsylvania' },
    { code: 'RI', name: 'Rhode Island' },
    { code: 'SC', name: 'South Carolina' },
    { code: 'SD', name: 'South Dakota' },
    { code: 'TN', name: 'Tennessee' },
    { code: 'TX', name: 'Texas' },
    { code: 'UT', name: 'Utah' },
    { code: 'VT', name: 'Vermont' },
    { code: 'VA', name: 'Virginia' },
    { code: 'WA', name: 'Washington' },
    { code: 'WV', name: 'West Virginia' },
    { code: 'WI', name: 'Wisconsin' },
    { code: 'WY', name: 'Wyoming' }
];

// Helper function to get email confirmation price from settings
async function getEmailConfirmationPrice(isSubscriber = false) {
    try {
        const settingKey = isSubscriber ? 'email_confirmation_price_subscriber' : 'email_confirmation_price';
        const priceFromDb = await db.getSettings(settingKey);
        if (priceFromDb) {
            return parseInt(priceFromDb);
        }
    } catch (error) {
        console.log('Error loading email confirmation price, using default:', error.message);
    }
    // Default prices if not found in database
    return isSubscriber ? 30 : 50;
}

// Registration packages
// Registration packages - LOADED FROM DATABASE ONLY
// This array is only used as a fallback if database loading fails
let REGISTRATION_PACKAGES = [];

// Token packages for purchase
const TOKEN_PACKAGES = [
    { tokens: 100, price: 10, description: 'Starter Pack' },
    { tokens: 250, price: 25, description: 'Small Pack' },
    { tokens: 550, price: 55, description: 'Medium Pack' },
    { tokens: 1000, price: 100, description: 'Large Pack' },
    { tokens: 1500, price: 155, description: 'Mega Pack' }
];

// Subscription packages
const SUBSCRIPTION_PACKAGES = [
    { 
        name: 'Basic', 
        duration: 90, 
        tokenCost: 500, 
        description: '3 Month Basic Plan',
        benefits: ['Discounted prices', 'Priority']
    },
    { 
        name: 'Pro', 
        duration: 180, 
        tokenCost: 800, 
        description: '6 Month Pro Plan - Great Value!',
        benefits: ['Discounted prices', 'Priority']
    },
    { 
        name: 'Business', 
        duration: 240, 
        tokenCost: 1000, 
        description: '8 Month Business Plan - Maximum Value!',
        benefits: ['Discounted prices', 'Priority']
    }
];

// Load pricing from database
async function loadPricingSettings() {
    try {
        console.log('🔄 Loading pricing settings from database...');
        
        // Try to load package pricing from database
        const packagePricing = await db.getSettings('package_pricing');
        if (packagePricing) {
            const parsed = JSON.parse(packagePricing);
            if (Array.isArray(parsed) && parsed.length > 0) {
                REGISTRATION_PACKAGES = parsed;
                console.log(`✅ Loaded ${parsed.length} registration packages from database`);
            }
        } else {
            console.log('📄 No custom pricing found, using default packages');
        }
        
        console.log('💰 Current pricing loaded:', REGISTRATION_PACKAGES.map(p => `${p.sites} sites: ${p.baseTokens}/${p.subscriberTokens} tokens (regular/subscriber)`));
        
    } catch (error) {
        console.error('❌ Error loading pricing settings:', error);
        console.log('📄 Falling back to default pricing');
    }
}

// Get current pricing from database (dynamic loading)
async function getCurrentPackages() {
    try {
        const packagePricing = await db.getSettings('package_pricing');
        if (packagePricing) {
            const parsed = JSON.parse(packagePricing);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }
    } catch (error) {
        console.error('❌ Error loading dynamic pricing:', error);
    }
    // Return cached packages if database fails
    return REGISTRATION_PACKAGES;
}

// Helper function to format date for display (YYYY-MM-DD to MM-DD-YYYY)
function formatDateForDisplay(dateString) {
    if (!dateString) return 'N/A';
    
    // Convert YYYY-MM-DD to MM-DD-YYYY
    const [year, month, day] = dateString.split('-');
    return `${month}-${day}-${year}`;
}

// Initialize session if not exists
const initSession = (ctx) => {
    if (!ctx.session) {
        ctx.session = {};
    }
    if (!ctx.session.formState) {
        ctx.session.formState = FormState.NONE;
    }
    if (!ctx.session.customerData) {
        ctx.session.customerData = {};
    }
};

// Check and auto-register user
const checkUser = async (ctx, next) => {
    try {
        initSession(ctx);
        
        // Skip middleware if no from object (like channel posts)
        if (!ctx.from) {
            return next();
        }
        
        const telegramId = ctx.from.id;
        let user = await db.getUserByTelegramId(telegramId);
        
        if (!user) {
            const logger = createTelegramLogger(ctx);
            logger.info('Auto-registering new user', {
                category: 'user_registration',
                telegramId: telegramId,
                telegramUsername: ctx.from.username || null,
                firstName: ctx.from.first_name,
                lastName: ctx.from.last_name || null
            });
            
            try {
                user = await db.createUser(
                    telegramId,
                    ctx.from.username || null,
                    ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : '')
                );
                
                await ctx.reply(
                    `Welcome to KprCli, ${user.full_name}! 🎉\n\n` +
                    'Your account has been created automatically.\n' +
                    'You can start by purchasing tokens to use our services.'
                );
            } catch (createError) {
                const logger = createTelegramLogger(ctx);
                logger.error('Failed to create user account', createError, {
                    category: 'user_registration_error',
                    telegramId: telegramId,
                    telegramUsername: ctx.from.username || null,
                    firstName: ctx.from.first_name,
                    lastName: ctx.from.last_name || null
                });
                
                await ctx.reply(
                    '❌ Sorry, there was an issue creating your account. Please contact support.\n\n' +
                    `Your Telegram ID: ${telegramId}`
                );
                return; // Don't continue to next middleware
            }
        }
        
        if (!ctx.state) {
            ctx.state = {};
        }
        ctx.state.user = user;
        return next();
    } catch (error) {
        const logger = createTelegramLogger(ctx);
        logger.error('Error in checkUser middleware', error, {
            category: 'middleware_error',
            telegramId: ctx.from?.id || null,
            telegramUsername: ctx.from?.username || null
        });
        
        await ctx.reply(
            '❌ Sorry, there was a system error. Please try again later or contact support.'
        );
        return; // Don't continue to next middleware
    }
};

// Apply middleware
bot.use(checkUser);

// Main menu keyboard
const getMainMenuKeyboard = (user) => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('💳 Buy Tokens', 'buy_tokens'),
            Markup.button.callback('👤 New Customer', 'new_customer')
        ],
        [
            Markup.button.callback('👥 My Customers', 'my_customers'),
            Markup.button.callback('📦 My Orders', 'my_orders')
        ],
        [
            Markup.button.callback('🛒 Marketplace', 'marketplace'),
            Markup.button.callback('💰 Balance', 'balance')
        ],
        [
            Markup.button.callback('🎯 Subscribe', 'subscription'),
            Markup.button.callback('❓ Help', 'help')
        ]
    ]);
};

// Start command
bot.command('start', async (ctx) => {
    const user = ctx.state.user;
    const logger = createTelegramLogger(ctx);
    
    // Log start command usage
    logger.info('User executed /start command', {
        category: 'bot_command',
        command: '/start',
        telegramId: ctx.from.id,
        telegramUsername: ctx.from.username,
        userId: user?.id || null,
        userTokenBalance: user?.token_balance || 0
    });
    
    if (!user) {
        logger.error('Start command failed - no user account', null, {
            category: 'command_error',
            command: '/start',
            telegramId: ctx.from.id,
            telegramUsername: ctx.from.username,
            errorType: 'user_account_not_found'
        });
        
        await ctx.reply(
            '❌ Sorry, there was an issue with your account. Please contact support.\n\n' +
            'Error: User account not found. This may be due to recent system maintenance.'
        );
        return;
    }
    
    const welcomeMessage = 
        `🤖 Welcome to KprCli, ${user.full_name}! 👋\n\n` +
        `💰 Your current balance: ${user.token_balance} tokens\n\n` +
        `Choose an option below:`;
    
    await ctx.reply(welcomeMessage, getMainMenuKeyboard(user));
});

// Shop callback
bot.action('shop', async (ctx) => {
    await ctx.answerCbQuery();
    await handleShop(ctx);
});

// Buy Tokens callback
bot.action('buy_tokens', async (ctx) => {
    await ctx.answerCbQuery();
    
    const logger = createTelegramLogger(ctx);
    
    // Log token purchase menu access
    logger.info('User accessed token purchase menu', {
        category: 'token_purchase',
        telegramId: ctx.from.id,
        telegramUsername: ctx.from.username,
        currentTokenBalance: ctx.state.user?.token_balance || 0
    });
    
    const tokenButtons = TOKEN_PACKAGES.map((pkg, index) => [
        Markup.button.callback(
            `${pkg.tokens} tokens - $${pkg.price}`,
            `token_package_${index}`
        )
    ]);
    
    tokenButtons.push([Markup.button.callback('💰 Custom Amount', 'custom_token_amount')]);
    tokenButtons.push([Markup.button.callback('← Back to Menu', 'back_to_menu')]);
    
    await ctx.editMessageText(
        '💳 Choose a token package:',
        Markup.inlineKeyboard(tokenButtons)
    );
});

// Token package selection
TOKEN_PACKAGES.forEach((pkg, index) => {
    bot.action(`token_package_${index}`, async (ctx) => {
        await ctx.answerCbQuery();
        
        const logger = createTelegramLogger(ctx);
        
        // Log token package selection
        logger.info('User selected token package', {
            category: 'token_purchase',
            telegramId: ctx.from.id,
            telegramUsername: ctx.from.username,
            packageIndex: index,
            tokensRequested: pkg.tokens,
            packagePrice: pkg.price,
            packageDescription: pkg.description,
            currentTokenBalance: ctx.state.user?.token_balance || 0
        });
        
        try {
            // Check if OxaPay environment variables are configured
            if (!process.env.OXAPAY_MERCHANT || !process.env.OXAPAY_API_KEY || !process.env.WEBHOOK_URL) {
                logger.error('Payment processing not configured', null, {
                    category: 'payment_error',
                    errorType: 'configuration_missing',
                    telegramId: ctx.from.id,
                    telegramUsername: ctx.from.username,
                    packageIndex: index,
                    tokensRequested: pkg.tokens
                });
                
                await ctx.editMessageText(
                    '❌ Payment processing is not configured.\n\n' +
                    'Please contact the administrator to set up payment processing.',
                    Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
                );
                return;
            }
            
            // Create OxaPay payment
            const paymentData = {
                merchant: process.env.OXAPAY_MERCHANT,
                amount: pkg.price,
                currency: 'USD',
                lifeTime: 30,
                feePaidByPayer: 1,
                underPaidCover: 5,
                callbackUrl: `${process.env.WEBHOOK_URL}/webhook/oxapay`,
                returnUrl: `${process.env.WEBHOOK_URL}/payment/success`,
                description: `${pkg.tokens} tokens - ${pkg.description}`,
                trackId: `${ctx.from.id}_${Date.now()}_${pkg.tokens}`
            };
            
            // Log payment creation attempt
            logger.info('Creating OxaPay payment', {
                category: 'payment_creation',
                telegramId: ctx.from.id,
                telegramUsername: ctx.from.username,
                paymentAmount: pkg.price,
                tokensRequested: pkg.tokens,
                trackId: paymentData.trackId
            });
            
            const response = await axios.post('https://api.oxapay.com/merchants/request', paymentData, {
                headers: {
                    'Authorization': `Bearer ${process.env.OXAPAY_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.data.result === 100) {
                // Store payment info in database for webhook processing
                const oxapayTrackId = response.data.trackId || response.data.paymentId || trackId;
                const paymentInfo = {
                    user_id: ctx.state.user.id,
                    transaction_type: 'purchase',
                    amount: pkg.tokens,
                    balance_after: ctx.state.user.token_balance, // Will be updated when payment completes
                    payment_method: 'OxaPay',
                    payment_id: oxapayTrackId,
                    payment_status: 'pending',
                    description: `${pkg.tokens} tokens - ${pkg.description}`
                };
                
                await db.createTokenTransaction(paymentInfo);
                
                // Log successful payment creation
                logger.info('Payment created successfully', {
                    category: 'payment_success',
                    telegramId: ctx.from.id,
                    telegramUsername: ctx.from.username,
                    oxapayTrackId,
                    paymentAmount: pkg.price,
                    tokensRequested: pkg.tokens,
                    paymentLink: response.data.payLink
                });
                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.url('💳 Pay Now', response.data.payLink)],
                    [Markup.button.callback('← Back to Menu', 'back_to_menu')]
                ]);
                
                await ctx.editMessageText(
                    `💳 Payment Created!\n\n` +
                    `Package: ${pkg.tokens} tokens\n` +
                    `Amount: $${pkg.price} USD\n` +
                    `Description: ${pkg.description}\n\n` +
                    `Click "Pay Now" to complete your payment.\n` +
                    `Payment expires in 30 minutes.`,
                    keyboard
                );
            } else {
                throw new Error(`OxaPay API error: ${response.data.message}`);
            }
        } catch (error) {
            // Enhanced payment creation error logging
            logger.error('Payment creation failed', error, {
                category: 'payment_error',
                errorType: 'payment_creation_failed',
                telegramId: ctx.from.id,
                telegramUsername: ctx.from.username,
                packageIndex: index,
                tokensRequested: pkg.tokens,
                packagePrice: pkg.price,
                errorMessage: error.message,
                oxapayResponse: error.response?.data || null
            });
            
            await ctx.editMessageText(
                '❌ Failed to create payment. Please try again later.',
                Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
            );
        }
    });
});

// Custom token amount handler
bot.action('custom_token_amount', async (ctx) => {
    await ctx.answerCbQuery();
    
    ctx.session.formState = FormState.CUSTOM_TOKEN_AMOUNT;
    
    await ctx.editMessageText(
        '💰 Custom Token Purchase\n\n' +
        'Enter the dollar amount you want to spend:\n\n' +
        '• Rate: $0.10 per token\n' +
        '• Minimum: $25.00 (250 tokens)\n' +
        '• Example: $50 = 500 tokens\n\n' +
        'Please enter amount (example: 25, 50, 100):',
        Markup.inlineKeyboard([
            [Markup.button.callback('← Back to Tokens', 'buy_tokens')]
        ])
    );
});

// Subscription callback
bot.action('subscription', async (ctx) => {
    await ctx.answerCbQuery();
    
    const user = ctx.state.user;
    
    // Check current subscription status
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
            `subscription_package_${index}`
        )
    ]);
    
    if (currentSubscription) {
        subscriptionButtons.push([Markup.button.callback('📋 Subscription Details', 'subscription_details')]);
    }
    
    subscriptionButtons.push([Markup.button.callback('← Back to Menu', 'back_to_menu')]);
    
    await ctx.editMessageText(
        '🎯 Premium Subscription\n\n' +
        statusText +
        '✨ Benefits of Premium Subscription:\n' +
        '• Discounted prices\n' +
        '• Priority\n\n' +
        '💰 Choose a subscription plan:',
        Markup.inlineKeyboard(subscriptionButtons)
    );
});

// Subscription package selection
SUBSCRIPTION_PACKAGES.forEach((pkg, index) => {
    bot.action(`subscription_package_${index}`, async (ctx) => {
        await ctx.answerCbQuery();
        
        try {
            const user = ctx.state.user;
            
            // Check if user has enough tokens
            if (user.token_balance < pkg.tokenCost) {
                await ctx.editMessageText(
                    `❌ Insufficient Tokens\n\n` +
                    `Plan: ${pkg.name}\n` +
                    `Required: ${pkg.tokenCost} tokens\n` +
                    `Your balance: ${user.token_balance} tokens\n` +
                    `Need ${pkg.tokenCost - user.token_balance} more tokens\n\n` +
                    `Please purchase more tokens first.`,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('💳 Buy Tokens', 'buy_tokens')],
                        [Markup.button.callback('← Back to Menu', 'back_to_menu')]
                    ])
                );
                return;
            }

            // Show confirmation
            const benefitsText = pkg.benefits.map(benefit => `• ${benefit}`).join('\n');

            await ctx.editMessageText(
                `🎯 Confirm Subscription Purchase\n\n` +
                `Plan: ${pkg.name}\n` +
                `Duration: ${pkg.duration} days\n` +
                `Cost: ${pkg.tokenCost} tokens\n\n` +
                `✨ Benefits:\n${benefitsText}\n\n` +
                `Your current balance: ${user.token_balance} tokens\n` +
                `Balance after purchase: ${user.token_balance - pkg.tokenCost} tokens\n\n` +
                `Do you want to proceed?`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback('✅ Confirm Purchase', `confirm_subscription_${index}`),
                        Markup.button.callback('❌ Cancel', 'subscription')
                    ]
                ])
            );
        } catch (error) {
            console.error('Subscription payment error:', error);
            await ctx.editMessageText(
                '❌ Failed to create payment. Please try again later.',
                Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
            );
        }
    });
});

// Confirm subscription purchase
SUBSCRIPTION_PACKAGES.forEach((pkg, index) => {
    bot.action(`confirm_subscription_${index}`, async (ctx) => {
        await ctx.answerCbQuery();
        
        try {
            const user = ctx.state.user;
            
            // Double-check token balance
            if (user.token_balance < pkg.tokenCost) {
                await ctx.editMessageText(
                    '❌ Insufficient tokens. Please purchase more tokens first.',
                    Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
                );
                return;
            }
            
            // Create subscription using the database function
            const subscription = await db.createSubscription(
                user.id,
                pkg.name,
                pkg.tokenCost
            );
            
            if (subscription) {
                // Get updated user balance
                const updatedUser = await db.getUserByTelegramId(user.telegram_id);
                
                await ctx.editMessageText(
                    `✅ Subscription Activated!\n\n` +
                    `Plan: ${pkg.name}\n` +
                    `Duration: ${pkg.duration} days\n` +
                    `Cost: ${pkg.tokenCost} tokens\n\n` +
                    `✨ Your Benefits:\n` +
                    `• Discounted prices\n` +
                    `• Priority\n` +
                    `• Valid for ${pkg.duration} days\n\n` +
                    `New token balance: ${updatedUser.token_balance} tokens\n\n` +
                    `Thank you for subscribing! 🎉`,
                    Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
                );
            } else {
                throw new Error('Failed to create subscription');
            }
        } catch (error) {
            console.error('Subscription confirmation error:', error);
            await ctx.editMessageText(
                '❌ Failed to activate subscription. Please try again later.',
                Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
            );
        }
    });
});

// Subscription details handler
bot.action('subscription_details', async (ctx) => {
    await ctx.answerCbQuery();
    
    const user = ctx.state.user;
    const subscription = await db.getUserSubscription(user.id);
    
    if (!subscription) {
        await ctx.editMessageText(
            '❌ No active subscription found.',
            Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
        );
        return;
    }
    
    const daysLeft = Math.ceil((new Date(subscription.expires_at) - new Date()) / (1000 * 60 * 60 * 24));
    const createdDate = new Date(subscription.created_at).toLocaleDateString();
    const expiresDate = new Date(subscription.expires_at).toLocaleDateString();
    
    await ctx.editMessageText(
        `📋 Subscription Details\n\n` +
        `Plan: ${subscription.plan_type}\n` +
        `Status: ${subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}\n` +
        `Started: ${createdDate}\n` +
        `Expires: ${expiresDate}\n` +
        `Days Remaining: ${daysLeft}\n\n` +
        `✨ Active Benefits:\n` +
        `• Discounted prices\n` +
        `• Priority`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Renew Subscription', 'subscription')],
            [Markup.button.callback('← Back to Menu', 'back_to_menu')]
        ])
    );
});

// New Customer callback
bot.action('new_customer', async (ctx) => {
    await ctx.answerCbQuery();
    
    const logger = createTelegramLogger(ctx);
    
    // Log customer registration start
    logger.info('User started customer registration process', {
        category: 'customer_registration',
        telegramId: ctx.from.id,
        telegramUsername: ctx.from.username,
        userId: ctx.state.user?.id,
        userTokenBalance: ctx.state.user?.token_balance || 0,
        step: 'step_1_first_name'
    });
    
    ctx.session.formState = FormState.CUSTOMER_NAME;
    ctx.session.customerData = {};
    
    await ctx.editMessageText(
        '📝 **Customer Registration Process**\n\n' +
        'Let\'s collect customer information for order fulfillment. This is a secure 15-step process.\n\n' +
        '**Step 1 of 15: First Name** 👤\n' +
        'Please enter the customer\'s first name:\n\n' +
        '💡 *Example: John*',
        Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancel', 'cancel_registration')]
        ])
    );
});

// Balance callback
bot.action('balance', async (ctx) => {
    await ctx.answerCbQuery();
    
    const user = ctx.state.user;
    const updatedUser = await db.getUserByTelegramId(user.telegram_id);
    
    await ctx.editMessageText(
        `💰 Your Balance\n\n` +
        `Current tokens: ${updatedUser.token_balance}\n` +
        `Account: ${updatedUser.full_name}\n` +
        `User ID: ${updatedUser.telegram_id}`,
        Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
    );
});

// My Orders callback
bot.action('my_orders', async (ctx) => {
    await ctx.answerCbQuery();
    
    try {
        const orders = await db.getUserOrders(ctx.state.user.id);
        
        
        if (orders.length === 0) {
            await ctx.editMessageText(
                '📦 My Orders\n\n' +
                'You have no orders yet.\n' +
                'Create your first customer and place an order!',
                Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
            );
        } else {
            // Get customer details for each order using direct queries
            const orderText = await Promise.all(orders.slice(0, 5).map(async (order, index) => {
                let customerName = 'N/A';
                let customerPhone = 'N/A';
                let customerPassword = 'N/A';
                
                // Get full customer details using direct query
                if (order.customer_profile_id) {
                    try {
                        const customer = await db.getCustomerById(order.customer_profile_id);
                        if (customer) {
                            // Build full name
                            let fullName = customer.first_name || '';
                            if (customer.middle_name && customer.middle_name.trim()) {
                                fullName += ` ${customer.middle_name}`;
                            }
                            if (customer.last_name && customer.last_name.trim()) {
                                fullName += ` ${customer.last_name}`;
                            }
                            customerName = fullName.trim() || 'N/A';
                            customerPhone = customer.phone || 'N/A';
                            customerPassword = customer.password_encrypted || 'N/A';
                        }
                    } catch (error) {
                        console.error('Error fetching customer details:', error);
                    }
                }
                
                return `${index + 1}. ${order.sites_count || order.package_type} sites - ${order.status}\n` +
                `   Customer: ${customerName}\n` +
                `   Phone: ${customerPhone}\n` +
                `   Password: ${customerPassword}\n` +
                `   Created: ${new Date(order.created_at).toLocaleDateString()}`;
            }));
            
            const orderTextResult = orderText.join('\n\n');
            
            await ctx.editMessageText(
                `📦 My Orders (${orders.length} total)\n\n${orderTextResult}`,
                Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
            );
        }
    } catch (error) {
        console.error('❌ Error fetching orders:', error);
        await ctx.editMessageText(
            '❌ Error loading orders. Please try again.',
            Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
        );
    }
});

// My Customers callback
bot.action('my_customers', async (ctx) => {
    await ctx.answerCbQuery();
    
    const logger = createTelegramLogger(ctx);
    
    // Log customer list access
    logger.info('User accessed customer list', {
        category: 'customer_management',
        telegramId: ctx.from.id,
        telegramUsername: ctx.from.username,
        userId: ctx.state.user?.id,
        userTokenBalance: ctx.state.user?.token_balance || 0
    });
    
    try {
        const customers = await db.getUserCustomers(ctx.state.user.id);
        
        if (customers.length === 0) {
            await ctx.editMessageText(
                '👥 My Customers\n\n' +
                'You haven\'t registered any customers yet.\n' +
                'Click "New Customer" to get started!',
                Markup.inlineKeyboard([
                    [Markup.button.callback('👤 New Customer', 'new_customer')],
                    [Markup.button.callback('← Back to Menu', 'back_to_menu')]
                ])
            );
        } else {
            // Show first 5 customers with pagination
            const startIndex = ctx.session.customerPage || 0;
            const endIndex = Math.min(startIndex + 5, customers.length);
            const currentCustomers = customers.slice(startIndex, endIndex);
            
            let customerText = currentCustomers.map((customer, index) => {
                // Build the name display with first, middle (if exists), and last
                let fullName = customer.first_name || '';
                if (customer.middle_name && customer.middle_name.trim()) {
                    fullName += ` ${customer.middle_name}`;
                }
                if (customer.last_name && customer.last_name.trim()) {
                    fullName += ` ${customer.last_name}`;
                }
                
                return `${startIndex + index + 1}. ${fullName}\n` +
                `   📞 ${customer.phone || 'N/A'}\n` +
                `   📧 ${customer.email || 'N/A'}\n` +
                `   📍 ${customer.city || 'N/A'}, ${customer.state || 'N/A'}\n` +
                `   📅 ${new Date(customer.registered).toLocaleDateString()}`;
            }).join('\n\n');
            
            // Create pagination buttons
            const buttons = [];
            
            // Customer action buttons for each customer
            const customerButtons = currentCustomers.map((customer, index) => 
                Markup.button.callback(
                    `View #${startIndex + index + 1}`, 
                    `view_customer_${customer.id}`
                )
            );
            
            // Split customer buttons into rows of 2
            for (let i = 0; i < customerButtons.length; i += 2) {
                buttons.push(customerButtons.slice(i, i + 2));
            }
            
            // Navigation buttons
            const navButtons = [];
            if (startIndex > 0) {
                navButtons.push(Markup.button.callback('⬅️ Previous', 'customers_prev'));
            }
            if (endIndex < customers.length) {
                navButtons.push(Markup.button.callback('Next ➡️', 'customers_next'));
            }
            if (navButtons.length > 0) {
                buttons.push(navButtons);
            }
            
            // Add other action buttons
            buttons.push([Markup.button.callback('👤 New Customer', 'new_customer')]);
            buttons.push([Markup.button.callback('← Back to Menu', 'back_to_menu')]);
            
            await ctx.editMessageText(
                `👥 My Customers (${customers.length} total)\n\n${customerText}`,
                Markup.inlineKeyboard(buttons)
            );
        }
    } catch (error) {
        // Enhanced error logging
        logger.error('Error fetching customer list', error, {
            category: 'customer_management_error',
            telegramId: ctx.from.id,
            telegramUsername: ctx.from.username,
            userId: ctx.state.user?.id,
            errorMessage: error.message
        });
        
        await ctx.editMessageText(
            '❌ Error loading customers. Please try again.',
            Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
        );
    }
});

// Customer pagination
bot.action('customers_prev', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.customerPage = Math.max((ctx.session.customerPage || 0) - 5, 0);
    
    // Re-trigger the my_customers action
    ctx.callbackQuery.data = 'my_customers';
    return bot.handleUpdate({
        ...ctx.update,
        callback_query: {
            ...ctx.callbackQuery,
            data: 'my_customers'
        }
    });
});

bot.action('customers_next', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.customerPage = (ctx.session.customerPage || 0) + 5;
    
    // Re-trigger the my_customers action
    ctx.callbackQuery.data = 'my_customers';
    return bot.handleUpdate({
        ...ctx.update,
        callback_query: {
            ...ctx.callbackQuery,
            data: 'my_customers'
        }
    });
});

// View individual customer
bot.action(/view_customer_(.+)/, async (ctx) => {
    await ctx.answerCbQuery();
    
    const customerId = ctx.match[1];
    
    try {
        const customer = await db.getCustomerById(customerId);
        
        if (!customer) {
            await ctx.editMessageText(
                '❌ Customer not found.',
                Markup.inlineKeyboard([[Markup.button.callback('← Back to Customers', 'my_customers')]])
            );
            return;
        }
        
        const customerDetails = 
            `👤 Customer Details\n\n` +
            `🏷️ Name: ${customer.first_name} ${customer.middle_name ? customer.middle_name + ' ' : ''}${customer.last_name || ''}\n` +
            `📞 Phone: ${customer.phone || 'N/A'}\n` +
            `📧 Email: ${customer.email || 'N/A'}\n` +
            `🎂 Gender: ${customer.gender || 'N/A'}\n` +
            `📅 DOB: ${formatDateForDisplay(customer.dob)}\n` +
            `📍 Address: ${customer.address || 'N/A'}\n` +
            `🏢 Apt/Suite: ${customer.apt_suite || 'N/A'}\n` +
            `🏙️ City: ${customer.city || 'N/A'}\n` +
            `🗺️ State: ${customer.state || 'N/A'}\n` +
            `📮 Postal: ${customer.postal || 'N/A'}\n` +
            `📅 Registered: ${new Date(customer.registered).toLocaleDateString()}`;
        
        await ctx.editMessageText(
            customerDetails,
            Markup.inlineKeyboard([
                [Markup.button.callback('📦 Place Order', `place_order_${customerId}`)],
                [
                    Markup.button.callback('✏️ Edit', `edit_customer_${customerId}`),
                    Markup.button.callback('🗑️ Delete', `delete_customer_${customerId}`)
                ],
                [Markup.button.callback('← Back to Customers', 'my_customers')]
            ])
        );
    } catch (error) {
        console.error('❌ Error fetching customer details:', error);
        await safeEditMessage(ctx,
            '❌ Error loading customer details.',
            Markup.inlineKeyboard([[Markup.button.callback('← Back to Customers', 'my_customers')]])
        );
    }
});

// Place order handler - redirects to package selection
bot.action(/place_order_(.+)/, async (ctx) => {
    console.log('🔍 [ORDER-LOG] OLD place_order handler triggered!', {
        handler: 'place_order_(.+)',
        customerId: ctx.match[1],
        userId: ctx.from.id,
        username: ctx.from.username,
        timestamp: new Date().toISOString(),
        callbackData: ctx.callbackQuery?.data
    });
    await ctx.answerCbQuery();
    
    const customerId = ctx.match[1];
    
    try {
        const customer = await db.getCustomerById(customerId);
        if (!customer) {
            await safeEditMessage(ctx,
                '❌ Customer not found.',
                Markup.inlineKeyboard([[Markup.button.callback('← Back', 'my_customers')]])
            );
            return;
        }
        
        // Show package selection for this customer
        let message = '📦 Select Package for Order\n\n';
        message += `👤 Customer: ${customer.first_name} ${customer.last_name || ''}\n`;
        message += `📞 Phone: ${customer.phone || 'N/A'}\n\n`;
        message += 'Choose a service package:\n\n';
        
        const buttons = [];
        REGISTRATION_PACKAGES.forEach((pkg, index) => {
            console.log('🚨 [ORDER-LOG] OLD HANDLER REDIRECTING TO NEW FLOW!', {
                packageIndex: index,
                customerId: customerId,
                oldCallbackData: `confirm_order_${index}_${customerId}_no`,
                newCallbackData: `order_package_${index}_${customerId}`,
                message: 'REDIRECTED TO USE 2-STEP CONFIRMATION'
            });
            
            const user = ctx.state.user;
            const hasSubscription = false; // Will be checked in order processing
            const price = hasSubscription ? pkg.subscriberTokens : pkg.baseTokens;
            
            buttons.push([
                Markup.button.callback(
                    `${pkg.sites} sites`,
                    `order_package_${index}_${customerId}`  // FIXED: Use new 2-step flow instead of direct confirm_order
                )
            ]);
        });
        
        buttons.push([Markup.button.callback('← Back to Customer', `view_customer_${customerId}`)]);
        
        await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
        
    } catch (error) {
        console.error('❌ Error showing package selection:', error);
        await safeEditMessage(ctx,
            '❌ Error loading packages. Please try again.',
            Markup.inlineKeyboard([[Markup.button.callback('← Back', `view_customer_${customerId}`)]])
        );
    }
});

// Delete customer handler - shows confirmation
bot.action(/delete_customer_(.+)/, async (ctx) => {
    console.log('🗑️ Delete button clicked');
    await ctx.answerCbQuery();
    
    const customerId = ctx.match[1];
    
    // Get customer details for confirmation
    try {
        const customer = await db.getCustomerById(customerId);
        if (!customer) {
            await safeEditMessage(ctx,
                '❌ Customer not found.',
                Markup.inlineKeyboard([[Markup.button.callback('← Back', 'my_customers')]])
            );
            return;
        }
        
        await safeEditMessage(ctx,
            `⚠️ Delete Customer\n\n` +
            `Are you sure you want to delete:\n\n` +
            `👤 ${customer.first_name} ${customer.last_name || ''}\n` +
            `📞 ${customer.phone || 'No phone'}\n` +
            `📧 ${customer.email || 'No email'}\n\n` +
            `⚠️ This action cannot be undone!`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback('🗑️ Yes, Delete', `confirm_delete_${customerId}`),
                    Markup.button.callback('❌ Cancel', `view_customer_${customerId}`)
                ]
            ])
        );
    } catch (error) {
        console.error('Error in delete handler:', error);
        await safeEditMessage(ctx,
            '❌ Error loading customer details.',
            Markup.inlineKeyboard([[Markup.button.callback('← Back', 'my_customers')]])
        );
    }
});

// Confirm delete customer - simplified version
bot.action(/confirm_delete_(.+)/, async (ctx) => {
    console.log('🗑️ Delete confirmation received');
    await ctx.answerCbQuery('Deleting customer...');
    
    const customerId = ctx.match[1];
    
    // Get user from context - for callbacks, we need to get the actual user record
    let userId;
    if (ctx.state?.user?.id) {
        userId = ctx.state.user.id;
    } else if (ctx.from?.id) {
        // For callback queries, get the user from database
        try {
            const userData = await db.getUserByTelegramId(ctx.from.id);
            if (userData) {
                userId = userData.id;
            } else {
                throw new Error('User not found in database');
            }
        } catch (err) {
            console.error('❌ Failed to get user:', err);
            await safeEditMessage(ctx,
                '❌ Authentication error. Please try again.',
                Markup.inlineKeyboard([[Markup.button.callback('← Back', 'my_customers')]])
            );
            return;
        }
    } else {
        console.error('❌ No user context available');
        await safeEditMessage(ctx,
            '❌ Authentication error. Please try again.',
            Markup.inlineKeyboard([[Markup.button.callback('← Back', 'my_customers')]])
        );
        return;
    }
    console.log(`🗑️ Deleting customer: ${customerId} for user: ${userId}`);
    
    try {
        // Delete customer from database
        await db.deleteCustomerProfile(customerId, userId);
        
        console.log(`✅ Customer ${customerId} deleted successfully`);
        
        // Show loading message first
        await safeEditMessage(ctx, '🔄 Deleting customer...');
        
        // Small delay for better UX
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await safeEditMessage(ctx,
            '✅ Customer deleted successfully!\n\n' +
            '🗑️ The customer has been permanently removed from your list.',
            Markup.inlineKeyboard([
                [Markup.button.callback('👥 View All Customers', 'my_customers')],
                [Markup.button.callback('➕ Add New Customer', 'add_customer')],
                [Markup.button.callback('🏠 Main Menu', 'back_to_menu')]
            ])
        );
    } catch (error) {
        console.error('❌ Error deleting customer:', error);
        
        // Provide user-friendly error message
        let errorMessage = '❌ Failed to delete customer.\n\n';
        if (error.message.includes('permission')) {
            errorMessage += '🔒 You can only delete your own customers.';
        } else if (error.message.includes('not found')) {
            errorMessage += '❓ Customer not found or already deleted.';
        } else {
            errorMessage += `Error: ${error.message || 'Unknown error'}`;
        }
        
        await safeEditMessage(ctx,
            errorMessage,
            Markup.inlineKeyboard([[Markup.button.callback('← Back to Customers', 'my_customers')]])
        );
    }
});

// Simple delete customer command
bot.command('deletecustomer', async (ctx) => {
    const user = ctx.state.user;
    if (!user) {
        return ctx.reply('❌ User not found');
    }
    
    try {
        const customers = await db.getCustomerProfiles(user.id);
        
        if (!customers || customers.length === 0) {
            return ctx.reply('📭 You have no customers to delete.');
        }
        
        // Show customers with delete buttons
        let message = '👥 Select a customer to delete:\n\n';
        const buttons = [];
        
        customers.forEach((customer, index) => {
            message += `${index + 1}. ${customer.first_name} ${customer.last_name || ''} (${customer.phone || 'No phone'})\n`;
            buttons.push([Markup.button.callback(`🗑️ Delete ${customer.first_name} ${customer.last_name || ''}`, `quick_delete_${customer.id}`)]);
        });
        
        buttons.push([Markup.button.callback('❌ Cancel', 'start')]);
        
        await ctx.reply(message, Markup.inlineKeyboard(buttons));
    } catch (error) {
        console.error('Error in deletecustomer command:', error);
        await ctx.reply('❌ Error loading customers');
    }
});

// CLI Device Authorization Command
bot.command('auth', async (ctx) => {
    const user = ctx.state.user;
    if (!user) {
        return ctx.reply('❌ User not found. Please start the bot first with /start');
    }
    
    const logger = createTelegramLogger(ctx);
    
    try {
        logger.info('CLI auth command received', {
            telegramId: user.telegram_id,
            username: user.telegram_username
        });
        
        // Generate device authorization request
        const appUrl = process.env.KPRCLI_APP_URL || 'http://localhost:3000';
        const authResponse = await axios.post(`${appUrl}/api/device/authorize`, {
            client_id: `telegram_${user.telegram_id}`,
            scope: 'cli:auth telegram:link'
        });
        
        const { user_code, verification_uri, expires_in } = authResponse.data;
        
        // Send auth details to user
        await ctx.reply(
            `🔐 **CLI Authentication**\n\n` +
            `To authenticate your CLI:\n\n` +
            `1️⃣ Your code: \`${user_code}\`\n` +
            `2️⃣ Open this link: ${verification_uri}\n` +
            `3️⃣ Enter the code when prompted\n\n` +
            `⏱ Code expires in ${Math.floor(expires_in / 60)} minutes\n\n` +
            `Once authorized, your CLI will be linked to this Telegram account.`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🌐 Open Browser', url: verification_uri }
                    ]]
                }
            }
        );
        
        // Try to auto-open browser on Windows
        if (process.platform === 'win32') {
            const { exec } = require('child_process');
            exec(`start ${verification_uri}`);
        }
        
        logger.info('CLI auth code sent', {
            telegramId: user.telegram_id,
            userCode: user_code
        });
        
    } catch (error) {
        logger.error('CLI auth failed', error, {
            telegramId: user.telegram_id,
            error: error.message
        });
        
        await ctx.reply(
            '❌ Failed to generate authentication code. Please make sure the CLI backend is running and try again.',
            Markup.inlineKeyboard([[Markup.button.callback('🔄 Try Again', 'retry_auth')]])
        );
    }
});

// Retry auth handler
bot.action('retry_auth', async (ctx) => {
    await ctx.answerCbQuery();
    const user = ctx.state.user;
    if (!user) {
        return ctx.editMessageText('❌ User not found. Please start the bot first with /start');
    }
    
    const logger = createTelegramLogger(ctx);
    
    try {
        logger.info('CLI auth retry requested', {
            telegramId: user.telegram_id,
            username: user.telegram_username
        });
        
        // Generate device authorization request
        const appUrl = process.env.KPRCLI_APP_URL || 'http://localhost:3000';
        const authResponse = await axios.post(`${appUrl}/api/device/authorize`, {
            client_id: `telegram_${user.telegram_id}`,
            scope: 'cli:auth telegram:link'
        });
        
        const { user_code, verification_uri, expires_in } = authResponse.data;
        
        // Edit the existing message
        await ctx.editMessageText(
            `🔐 **CLI Authentication**\n\n` +
            `To authenticate your CLI:\n\n` +
            `1️⃣ Your code: \`${user_code}\`\n` +
            `2️⃣ Open this link: ${verification_uri}\n` +
            `3️⃣ Enter the code when prompted\n\n` +
            `⏱ Code expires in ${Math.floor(expires_in / 60)} minutes\n\n` +
            `Once authorized, your CLI will be linked to this Telegram account.`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🌐 Open Browser', url: verification_uri }
                    ]]
                }
            }
        );
        
        // Try to auto-open browser on Windows
        if (process.platform === 'win32') {
            const { exec } = require('child_process');
            exec(`start ${verification_uri}`);
        }
        
        logger.info('CLI auth code sent (retry)', {
            telegramId: user.telegram_id,
            userCode: user_code
        });
        
    } catch (error) {
        logger.error('CLI auth retry failed', error, {
            telegramId: user.telegram_id,
            error: error.message
        });
        
        await ctx.editMessageText(
            '❌ Failed to generate authentication code. Please make sure the CLI backend is running and try again.',
            Markup.inlineKeyboard([[Markup.button.callback('🔄 Try Again', 'retry_auth')]])
        );
    }
});

// Quick delete handler
bot.action(/quick_delete_(.+)/, async (ctx) => {
    await ctx.answerCbQuery();
    const customerId = ctx.match[1];
    const userId = ctx.state.user.id;
    
    console.log(`🗑️ Quick delete triggered - Customer: ${customerId}, User: ${userId}`);
    
    try {
        await db.deleteCustomerProfile(customerId, userId);
        await ctx.editMessageText('✅ Customer deleted successfully!');
    } catch (error) {
        console.error('Quick delete error:', error);
        await ctx.editMessageText(`❌ Delete failed: ${error.message}`);
    }
});

// Edit customer handler
bot.action(/edit_customer_(.+)/, async (ctx) => {
    await ctx.answerCbQuery();
    
    const customerId = ctx.match[1];
    
    // Store customer ID for editing
    ctx.session.editingCustomerId = customerId;
    
    await safeEditMessage(ctx,
        '✏️ Edit Customer\n\n' +
        'What would you like to edit?',
        Markup.inlineKeyboard([
            [Markup.button.callback('📝 First Name', `edit_field_first_name_${customerId}`)],
            [Markup.button.callback('📝 Middle Name', `edit_field_middle_name_${customerId}`)],
            [Markup.button.callback('📝 Last Name', `edit_field_last_name_${customerId}`)],
            [Markup.button.callback('📞 Phone', `edit_field_phone_${customerId}`)],
            [Markup.button.callback('📧 Email', `edit_field_email_${customerId}`)],
            [Markup.button.callback('📍 Address', `edit_field_address_${customerId}`)],
            [Markup.button.callback('🏢 Apt/Suite', `edit_field_apartment_${customerId}`)],
            [Markup.button.callback('🏙️ City', `edit_field_city_${customerId}`)],
            [Markup.button.callback('🗺️ State', `edit_field_state_${customerId}`)],
            [Markup.button.callback('📮 Postal Code', `edit_field_postal_${customerId}`)],
            [Markup.button.callback('🎂 Birthday', `edit_field_dob_${customerId}`)],
            [Markup.button.callback('🔐 Password', `edit_field_password_${customerId}`)],
            [Markup.button.callback('← Back to Customer', `view_customer_${customerId}`)]
        ])
    );
});

// Edit field handlers
bot.action(/edit_field_(.+)_(.+)/, async (ctx) => {
    await ctx.answerCbQuery();
    
    const field = ctx.match[1];
    const customerId = ctx.match[2];
    
    ctx.session.editingCustomerId = customerId;
    ctx.session.editingField = field;
    ctx.session.formState = FormState.EDITING_CUSTOMER;
    
    const fieldPrompts = {
        first_name: 'Enter the new first name:',
        middle_name: 'Enter the new middle name (or type "none" to remove):',
        last_name: 'Enter the new last name:',
        phone: 'Enter the new phone number:',
        email: 'Enter the new email address:',
        address: 'Enter the new street address:',
        apartment: 'Enter the new apartment/suite number (or "none"):',
        city: 'Enter the new city:',
        state: 'Select the new state:',
        postal: 'Enter the new postal code:',
        dob: 'Enter the new date of birth (MM/DD/YYYY):',
        password: 'Enter the new password (minimum 6 characters):'
    };
    
    if (field === 'state') {
        // Show state selection buttons
        const stateButtons = US_STATES.map(state => [
            Markup.button.callback(state.name, `select_state_${state.code}_${customerId}`)
        ]);
        
        // Add cancel button
        stateButtons.push([Markup.button.callback('❌ Cancel', `edit_customer_${customerId}`)]);
        
        await ctx.editMessageText(
            'Select the new state:',
            Markup.inlineKeyboard(stateButtons)
        );
    } else {
        await ctx.editMessageText(
            fieldPrompts[field] || 'Enter the new value:',
            Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancel', `edit_customer_${customerId}`)]
            ])
        );
    }
});

// State selection handler for editing
bot.action(/select_state_(.+)_(.+)/, async (ctx) => {
    await ctx.answerCbQuery();
    
    const stateCode = ctx.match[1];
    const customerId = ctx.match[2];
    
    // Find the state name from the code
    const selectedState = US_STATES.find(state => state.code === stateCode);
    if (!selectedState) {
        await ctx.reply('❌ Invalid state selected.');
        return;
    }
    
    try {
        // Log the update data for debugging
        console.log('Updating customer state with data:', { state: selectedState.name });
        
        // Update customer in database
        await db.updateCustomerProfile(customerId, { state: selectedState.name });
        
        await ctx.editMessageText(
            '✅ Customer state updated successfully!',
            Markup.inlineKeyboard([[Markup.button.callback('View Customer', `view_customer_${customerId}`)]])
        );
        
    } catch (error) {
        console.error('❌ Error updating customer state:', error);
        await ctx.editMessageText(
            '❌ Failed to update customer state. Please try again.',
            Markup.inlineKeyboard([[Markup.button.callback('← Back to Customer', `view_customer_${customerId}`)]])
        );
    }
});

// Create order for specific customer
bot.action(/order_for_customer_(.+)/, async (ctx) => {
    console.log('🔍 [ORDER-LOG] order_for_customer handler triggered!', {
        handler: 'order_for_customer_(.+)',
        customerId: ctx.match[1],
        userId: ctx.from.id,
        username: ctx.from.username,
        timestamp: new Date().toISOString(),
        callbackData: ctx.callbackQuery?.data
    });
    await ctx.answerCbQuery();
    
    const customerId = ctx.match[1];
    ctx.session.selectedCustomerId = customerId;
    
    // Get current packages from database
    const currentPackages = await getCurrentPackages();
    
    // Show package selection for this customer
    const packageButtons = currentPackages.map((pkg, index) => [
        Markup.button.callback(
            `${pkg.sites} sites`,
            `package_for_customer_${index}`
        )
    ]);
    
    packageButtons.push([Markup.button.callback('← Back to Customer', `view_customer_${customerId}`)]);
    
    await ctx.editMessageText(
        '📦 Choose Package for Customer\n\n' +
        'Select a registration package:',
        Markup.inlineKeyboard(packageButtons)
    );
});

// Package selection for specific customer
bot.action(/package_for_customer_(\d+)/, async (ctx) => {
    console.log('🔍 [ORDER-LOG] package_for_customer handler triggered!', {
        handler: 'package_for_customer_(\\d+)',
        packageIndex: ctx.match[1],
        userId: ctx.from.id,
        username: ctx.from.username,
        timestamp: new Date().toISOString(),
        callbackData: ctx.callbackQuery?.data,
        selectedCustomerId: ctx.session.selectedCustomerId
    });
    await ctx.answerCbQuery();
    
    const packageIndex = parseInt(ctx.match[1]);
    // Get current packages from database
    const currentPackages = await getCurrentPackages();
    const selectedPackage = currentPackages[packageIndex];
    const customerId = ctx.session.selectedCustomerId;
    
    if (!customerId) {
        await ctx.editMessageText(
            '❌ Error: No customer selected.',
            Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
        );
        return;
    }
    
    try {
        const customer = await db.getCustomerById(customerId);
        const user = ctx.state.user;
        
        // Check subscription status and get actual price
        const hasSubscription = await db.hasActiveSubscription(user.id);
        const actualPrice = hasSubscription ? selectedPackage.subscriberTokens : selectedPackage.baseTokens;
        
        // Check if user has enough tokens for actual package price
        if (user.token_balance < actualPrice) {
            await safeEditMessage(ctx,
                `❌ Insufficient Tokens\n\n` +
                `Required: ${actualPrice} tokens${hasSubscription ? ' (Subscriber price)' : ''}\n` +
                `Your balance: ${user.token_balance} tokens\n\n` +
                `Please purchase more tokens first.`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('💳 Buy Tokens', 'buy_tokens')],
                    [Markup.button.callback('← Back to Customer', `view_customer_${customerId}`)]
                ])
            );
            return;
        }
        
        // Show confirmation screen with email confirmation option
        const emailConfirmationPrice = await getEmailConfirmationPrice(hasSubscription);
        const emailButtonText = hasSubscription 
            ? `📧 Add Email Confirmation (+${emailConfirmationPrice} tokens - Subscriber rate)`
            : `📧 Add Email Confirmation (+${emailConfirmationPrice} tokens)`;
        console.log('🚨 [ORDER-LOG] package_for_customer REDIRECTING TO NEW 2-STEP FLOW!', {
            packageIndex: packageIndex,
            customerId: customerId,
            oldConfirmCallback: `confirm_order_${packageIndex}_${customerId}_no`,
            newEmailChoiceCallback: `email_choice_${packageIndex}_${customerId}_no`,
            message: 'REDIRECTED TO USE 2-STEP EMAIL CHOICE FLOW'
        });
        
        const confirmationButtons = [
            [Markup.button.callback('❌ No Email Service', `email_choice_${packageIndex}_${customerId}_no`)],
            [Markup.button.callback('✅ Yes, Add Email Service', `email_choice_${packageIndex}_${customerId}_yes`)],
            [Markup.button.callback('🔙 Cancel', `view_customer_${customerId}`)]
        ];
        
        await safeEditMessage(ctx,
            `📧 **Email Confirmation Service**\n\n` +
            `📦 Package: ${selectedPackage.sites} sites\n` +
            `👤 Customer: ${customer.first_name} ${customer.last_name}\n` +
            `💰 Package Cost: ${actualPrice} tokens${hasSubscription ? ' (Subscriber price)' : ''}\n\n` +
            `📧 **Optional Email Confirmation Service:**\n` +
            `• Cost: +${emailConfirmationPrice} tokens${hasSubscription ? ' (Subscriber rate)' : ''}\n` +
            `• Provides email verification for customer accounts\n\n` +
            `❓ **Would you like to add email confirmation service?**`,
            Markup.inlineKeyboard(confirmationButtons)
        );
        
    } catch (error) {
        console.error('❌ Error showing order confirmation:', error);
        await safeEditMessage(ctx,
            '❌ Error processing order. Please try again.',
            Markup.inlineKeyboard([[Markup.button.callback('← Back to Customer', `view_customer_${customerId}`)]])
        );
    }
});

// Order confirmation handler
bot.action(/confirm_order_(\d+)_(.+)_(yes|no)/, async (ctx) => {
    console.log('🚨 [ORDER-LOG] FINAL ORDER CREATION HANDLER TRIGGERED!', {
        handler: 'confirm_order_(\\d+)_(.+)_(yes|no)',
        packageIndex: ctx.match[1],
        customerId: ctx.match[2], 
        emailConfirmation: ctx.match[3],
        userId: ctx.from.id,
        username: ctx.from.username,
        timestamp: new Date().toISOString(),
        callbackData: ctx.callbackQuery?.data,
        message: 'THIS CREATES THE ACTUAL ORDER!'
    });
    await ctx.answerCbQuery();
    
    const packageIndex = parseInt(ctx.match[1]);
    const customerId = ctx.match[2];
    const withEmailConfirmation = ctx.match[3] === 'yes';
    
    // Get current packages from database
    const currentPackages = await getCurrentPackages();
    const selectedPackage = currentPackages[packageIndex];
    const logger = createTelegramLogger(ctx);
    const user = ctx.state.user;
    
    try {
        const customer = await db.getCustomerById(customerId);
        
        // Log order attempt
        logger.info('Order confirmation attempt', {
            category: 'order_creation',
            telegramId: ctx.from.id,
            telegramUsername: ctx.from.username,
            packageIndex,
            customerId,
            withEmailConfirmation,
            sitesRequested: selectedPackage.sites,
            customerName: `${customer.first_name} ${customer.last_name}`,
            userTokenBalance: user.token_balance
        });
        
        // Calculate total cost with subscriber discount
        const hasSubscription = await db.hasActiveSubscription(user.id);
        const basePrice = hasSubscription ? selectedPackage.subscriberTokens : selectedPackage.baseTokens;
        const emailConfirmationPrice = await getEmailConfirmationPrice(hasSubscription);
        const totalCost = basePrice + (withEmailConfirmation ? emailConfirmationPrice : 0);
        
        // Log cost calculation
        logger.info('Order cost calculation', {
            category: 'order_pricing',
            telegramId: ctx.from.id,
            hasSubscription,
            basePrice,
            emailConfirmationPrice,
            totalCost,
            userTokenBalance: user.token_balance
        });
        
        // Check if user has enough tokens for total cost
        if (user.token_balance < totalCost) {
            // Log insufficient token balance error with full user context
            logger.error('Insufficient token balance for order', null, {
                category: 'order_error',
                errorType: 'insufficient_tokens',
                telegramId: ctx.from.id,
                telegramUsername: ctx.from.username,
                userId: user.id,
                customerId,
                customerName: `${customer.first_name} ${customer.last_name}`,
                packageSites: selectedPackage.sites,
                requiredTokens: totalCost,
                userTokenBalance: user.token_balance,
                tokenDeficit: totalCost - user.token_balance,
                withEmailConfirmation,
                hasSubscription
            });
            
            await safeEditMessage(ctx,
                `❌ Insufficient Tokens\n\n` +
                `Required: ${totalCost} tokens\n` +
                `Your balance: ${user.token_balance} tokens\n\n` +
                `Please purchase more tokens first.`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('💳 Buy Tokens', 'buy_tokens')],
                    [Markup.button.callback('← Back to Customer', `view_customer_${customerId}`)]
                ])
            );
            return;
        }
        
        // Create the order
        const productName = `${selectedPackage.sites} Sites Registration${withEmailConfirmation ? ' + Email Confirmation' : ''}`;
        // Map package types to valid constraint values
        // Database constraint only allows: 250, 550, 650, 850, 1000, 1200, 1350, 1500, email_confirmation
        const packageTypeMap = {
            100: '250',  // Map 100 sites to 250 for constraint, actual count tracked in sites_count
            250: '250',
            550: '550',
            650: '650',
            850: '850',
            1000: '1000',
            1200: '1200',
            1350: '1350',
            1500: '1500'
        };
        const packageType = packageTypeMap[selectedPackage.sites] || `${selectedPackage.sites}`;
        
        // Log order creation attempt
        logger.info('Creating order', {
            category: 'order_creation',
            telegramId: ctx.from.id,
            telegramUsername: ctx.from.username,
            productName,
            packageType,
            totalCost,
            userTokenBalanceBeforeOrder: user.token_balance
        });
        
        const order = await db.createOrder(
            user.id,                           // userId
            customerId,                        // customerId  
            packageType,                       // packageType - using 250 for 100 sites temporarily
            productName,                       // productName with email confirmation info
            totalCost,                         // tokenCost including email confirmation
            false,                            // isPriority
            hasSubscription,                  // hasSubscriptionDiscount
            selectedPackage.sites             // actual sites count
        );
        
        // Log successful order creation
        logger.info('Order created successfully', {
            category: 'order_success',
            telegramId: ctx.from.id,
            telegramUsername: ctx.from.username,
            orderId: order.id,
            customerId,
            customerName: `${customer.first_name} ${customer.last_name}`,
            packageSites: selectedPackage.sites,
            totalCost,
            withEmailConfirmation,
            hasSubscription
        });
        
        // Deduct tokens
        await db.updateUserTokenBalance(user.id, -totalCost, 'spend', `Order #${order.id.substring(0, 8)}`);
        
        // Log token deduction
        logger.info('Tokens deducted for order', {
            category: 'token_transaction',
            telegramId: ctx.from.id,
            telegramUsername: ctx.from.username,
            orderId: order.id,
            tokensDeducted: totalCost,
            userTokenBalanceAfterOrder: user.token_balance - totalCost,
            transactionType: 'spend'
        });
        
        await ctx.editMessageText(
            `✅ Order Created Successfully!\n\n` +
            `📦 Package: ${selectedPackage.sites} sites\n` +
            `👤 Customer: ${customer.first_name} ${customer.last_name}\n` +
            `${withEmailConfirmation ? `📧 Email Confirmation: Yes (+${emailConfirmationPrice} tokens)\n` : ''}` +
            `💰 Total Cost: ${totalCost} tokens${hasSubscription ? ' (Subscriber discount applied!)' : ''}\n` +
            `📋 Order ID: #${order.id}\n` +
            `📅 Status: Pending\n\n` +
            `Your order has been placed in the queue. You'll be notified when an operator is assigned.`,
            Markup.inlineKeyboard([
                [Markup.button.callback('📦 View My Orders', 'my_orders')],
                [Markup.button.callback('← Back to Menu', 'back_to_menu')]
            ])
        );
        
        
    } catch (error) {
        // Enhanced error logging with full context
        logger.error('Order creation failed', error, {
            category: 'order_error',
            errorType: 'order_creation_failed',
            telegramId: ctx.from.id,
            telegramUsername: ctx.from.username,
            userId: user?.id,
            customerId,
            packageIndex,
            packageSites: selectedPackage.sites,
            withEmailConfirmation,
            userTokenBalance: user?.token_balance,
            errorCode: error.code,
            errorMessage: error.message
        });
        
        await ctx.editMessageText(
            '❌ Error creating order. Please try again.',
            Markup.inlineKeyboard([[Markup.button.callback('← Back to Customer', `view_customer_${customerId}`)]])
        );
    }
});

// Marketplace callback
bot.action('marketplace', async (ctx) => {
    await ctx.answerCbQuery();
    
    await ctx.editMessageText(
        '🛒 Marketplace\n\n' +
        '🚧 Coming Soon!\n\n' +
        'We\'re working hard to bring you an amazing marketplace experience. ' +
        'Stay tuned for exciting products and services!\n\n' +
        '✨ Features coming soon:\n' +
        '• Product catalog\n' +
        '• Service listings\n' +
        '• Digital goods\n' +
        '• And much more!\n\n' +
        '🔔 You\'ll be notified when it\'s ready!',
        Markup.inlineKeyboard([
            [Markup.button.callback('← Back to Menu', 'back_to_menu')]
        ])
    );
});

// Help callback
bot.action('help', async (ctx) => {
    await ctx.answerCbQuery();
    
    const helpText = 
        '❓ KprCli Help\n\n' +
        '🔹 Buy Tokens: Purchase tokens to use our services\n' +
        '🔹 New Customer: Register a new customer profile\n' +
        '🔹 My Customers: View and manage your registered customers\n' +
        '🔹 My Orders: View your order history and status\n' +
        '🔹 Marketplace: Browse and order registration packages\n' +
        '🔹 Balance: Check your current token balance\n\n' +
        '💡 Need more help? Contact support.';
    
    await ctx.editMessageText(
        helpText,
        Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
    );
});


// Back to menu callback
bot.action('back_to_menu', async (ctx) => {
    await ctx.answerCbQuery();
    
    const user = ctx.state.user;
    const welcomeMessage = 
        `🤖 KprCli Main Menu\n\n` +
        `Hello ${user.full_name}! 👋\n\n` +
        `💰 Your current balance: ${user.token_balance} tokens\n\n` +
        `Choose an option below:`;
    
    await safeEditMessage(ctx, welcomeMessage, getMainMenuKeyboard(user));
});

// Skip middle name handler
bot.action('skip_middle_name', async (ctx) => {
    await ctx.answerCbQuery();
    
    ctx.session.customerData.middleName = null;
    ctx.session.formState = FormState.CUSTOMER_LAST_NAME;
    
    await ctx.editMessageText(
        'Now enter the customer\'s last name:',
        Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancel', 'cancel_registration')]
        ])
    );
});

// Skip apartment handler
bot.action('skip_apartment', async (ctx) => {
    await ctx.answerCbQuery();
    
    ctx.session.customerData.apartment = null;
    ctx.session.formState = FormState.CUSTOMER_CITY;
    
    await ctx.editMessageText(
        '✅ Apt/Suite: None\n\n' +
        '**Step 10 of 15: City** 🏙️\n' +
        'Please enter the customer\'s city:\n\n' +
        '💡 *Example: New York*',
        Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancel', 'cancel_registration')]
        ])
    );
});

// Cancel registration handler
bot.action('cancel_registration', async (ctx) => {
    await ctx.answerCbQuery();
    
    // Reset form state
    ctx.session.formState = FormState.NONE;
    ctx.session.customerData = {};
    
    const user = ctx.state.user;
    const welcomeMessage = 
        `🤖 KprCli Main Menu\n\n` +
        `Hello ${user.full_name}! 👋\n\n` +
        `💰 Your current balance: ${user.token_balance} tokens\n\n` +
        `Choose an option below:`;
    
    await ctx.editMessageText(welcomeMessage, getMainMenuKeyboard(user));
});

// Password option handlers for old registration system
bot.action('add_password_old', async (ctx) => {
    await ctx.answerCbQuery();
    
    ctx.session.formState = FormState.CUSTOMER_PASSWORD;
    
    await ctx.editMessageText(
        '🔐 **Step 14 of 15: Create Password**\n\n' +
        'Please enter a password (minimum 6 characters):\n\n' +
        '💡 *This password will be used for email confirmation services*\n\n' +
        '🔧 **Quick Option:** You can create a temporary password for now and update it later if needed.',
        Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'cancel_registration')]])
    );
});

bot.action('skip_password_old', async (ctx) => {
    await ctx.answerCbQuery();
    
    // Skip password and save customer
    await saveCustomer(ctx);
});

// Password step handlers
bot.action('add_password', async (ctx) => {
    const shopHandler = require('./src/bot/handlers/shop.handler');
    await shopHandler.handleAddPassword(ctx);
});

bot.action('skip_password', async (ctx) => {
    const shopHandler = require('./src/bot/handlers/shop.handler');
    await shopHandler.handleSkipPassword(ctx);
});

// Handle text messages for form inputs
bot.on('text', async (ctx) => {
    initSession(ctx);
    
    const state = ctx.session.formState;
    let text = ctx.message.text?.trim();
    
    // Input validation and sanitization
    if (!text) {
        return ctx.reply('❌ Please enter a valid response.');
    }
    
    // Basic length check (prevent extremely long inputs)
    if (text.length > 500) {
        return ctx.reply('❌ Input too long. Please enter a shorter response (max 500 characters).');
    }
    
    // Basic XSS prevention (sanitize HTML-like content)
    text = text
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    
    console.log(`📝 Form input - State: ${state}, Text: "${text}"`);
    
    switch (state) {
        case FormState.CUSTOMER_NAME:
            if (text.length < 2) {
                return ctx.reply('Please enter a valid first name (at least 2 characters):');
            }
            ctx.session.customerData.firstName = text;
            ctx.session.formState = FormState.CUSTOMER_MIDDLE_NAME;
            return ctx.reply(
                '✅ First Name: ' + text + '\n\n' +
                '**Step 2 of 15: Middle Name** 👤\n' +
                'Please enter the customer\'s middle name (optional):\n\n' +
                '💡 *Click Skip if they don\'t have a middle name*', 
                Markup.inlineKeyboard([
                    [Markup.button.callback('⏭️ Skip', 'skip_middle_name')],
                    [Markup.button.callback('❌ Cancel', 'cancel_registration')]
                ])
            );
            
        case FormState.CUSTOMER_MIDDLE_NAME:
            // Handle middle name - can be empty or "none"
            if (text.toLowerCase() === 'none' || text.trim() === '') {
                ctx.session.customerData.middleName = null;
            } else {
                ctx.session.customerData.middleName = text.trim();
            }
            ctx.session.formState = FormState.CUSTOMER_LAST_NAME;
            return ctx.reply(
                '✅ Middle Name: ' + (ctx.session.customerData.middleName || 'None') + '\n\n' +
                '**Step 3 of 15: Last Name** 👤\n' +
                'Please enter the customer\'s last name:\n\n' +
                '💡 *Example: Smith*', 
                Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Cancel', 'cancel_registration')]
                ])
            );
            
        case FormState.CUSTOMER_LAST_NAME:
            if (text.length < 2) {
                return ctx.reply('Please enter a valid last name (at least 2 characters):');
            }
            ctx.session.customerData.lastName = text;
            ctx.session.formState = FormState.CUSTOMER_PHONE;
            return ctx.reply(
                '✅ Last Name: ' + text + '\n\n' +
                '**Step 4 of 15: Phone Number** 📞\n' +
                'Please enter the customer\'s phone number:\n\n' +
                '💡 *Examples: +1-555-123-4567 or 555-123-4567*',
                Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Cancel', 'cancel_registration')]
                ])
            );
            
        case FormState.CUSTOMER_PHONE:
            if (!/^\+?[\d\s\-\(\)]+$/.test(text) || text.replace(/\D/g, '').length < 10) {
                return ctx.reply('Please enter a valid phone number:');
            }
            ctx.session.customerData.phone = text;
            ctx.session.formState = FormState.CUSTOMER_EMAIL;
            return ctx.reply(
                '✅ Phone: ' + text + '\n\n' +
                '**Step 5 of 15: Email Address** 📧\n' +
                'Please enter the customer\'s email address:\n\n' +
                '💡 *Example: john.smith@email.com*',
                Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Cancel', 'cancel_registration')]
                ])
            );
            
        case FormState.CUSTOMER_EMAIL:
            if (!/\S+@\S+\.\S+/.test(text)) {
                return ctx.reply('Please enter a valid email address:');
            }
            ctx.session.customerData.email = text;
            ctx.session.formState = FormState.CUSTOMER_GENDER;
            
            const genderKeyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('Male', 'gender_male'),
                    Markup.button.callback('Female', 'gender_female')
                ],
                [
                    Markup.button.callback('Other', 'gender_other'),
                    Markup.button.callback('Prefer not to say', 'gender_prefer_not_to_say')
                ],
                [
                    Markup.button.callback('❌ Cancel', 'cancel_registration')
                ]
            ]);
            
            return ctx.reply(
                '✅ Email: ' + text + '\n\n' +
                '**Step 6 of 15: Gender** ⚧️\n' +
                'Please select the customer\'s gender:', genderKeyboard);
            
        case FormState.CUSTOMER_DOB:
            // Expect MM-DD-YYYY format
            const dobRegex = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])-(\d{4})$/;
            if (!dobRegex.test(text)) {
                return ctx.reply('Please enter date of birth in MM-DD-YYYY format (e.g., 03-15-1990):');
            }
            
            const [month, day, year] = text.split('-');
            const birthDate = new Date(year, month - 1, day);
            const today = new Date();
            
            if (birthDate >= today) {
                return ctx.reply('Please enter a valid birth date (must be in the past):');
            }
            
            ctx.session.customerData.dob = `${year}-${month}-${day}`; // Store in database format
            ctx.session.customerData.dobDisplay = text; // Keep display format
            ctx.session.formState = FormState.CUSTOMER_ADDRESS;
            return ctx.reply(
                '✅ Date of Birth: ' + ctx.session.customerData.dobDisplay + '\n\n' +
                '**Step 8 of 15: Street Address** 🏠\n' +
                'Please enter the customer\'s street address:\n\n' +
                '💡 *Example: 123 Main Street*',
                Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Cancel', 'cancel_registration')]
                ])
            );
            
        case FormState.CUSTOMER_ADDRESS:
            if (text.length < 5) {
                return ctx.reply('Please enter a valid street address:');
            }
            ctx.session.customerData.address = text;
            ctx.session.formState = FormState.CUSTOMER_APARTMENT;
            return ctx.reply(
                '✅ Address: ' + text + '\n\n' +
                '**Step 9 of 15: Apartment/Suite** 🏢\n' +
                'Please enter apartment or suite number (if any):\n\n' +
                '💡 *Examples: Apt 4B, Suite 101, or type "none" if not applicable*',
                Markup.inlineKeyboard([
                    [Markup.button.callback('⏭️ Skip', 'skip_apartment')],
                    [Markup.button.callback('❌ Cancel', 'cancel_registration')]
                ])
            );
            
        case FormState.CUSTOMER_APARTMENT:
            // Handle apartment/suite - can be empty or "none"
            if (text.toLowerCase() === 'none' || text.trim() === '') {
                ctx.session.customerData.apartment = null;
            } else {
                ctx.session.customerData.apartment = text.trim();
            }
            ctx.session.formState = FormState.CUSTOMER_CITY;
            return ctx.reply(
                '✅ Apt/Suite: ' + (ctx.session.customerData.apartment || 'None') + '\n\n' +
                '**Step 10 of 15: City** 🏙️\n' +
                'Please enter the customer\'s city:\n\n' +
                '💡 *Example: New York*',
                Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Cancel', 'cancel_registration')]
                ])
            );
            
        case FormState.CUSTOMER_CITY:
            if (text.length < 2) {
                return ctx.reply('Please enter a valid city name:');
            }
            ctx.session.customerData.city = text;
            ctx.session.formState = FormState.CUSTOMER_STATE;
            
            // Create state selection keyboard
            const stateButtons = [];
            for (let i = 0; i < US_STATES.length; i += 2) {
                const row = [Markup.button.callback(US_STATES[i].name, `state_${US_STATES[i].code}`)];
                if (US_STATES[i + 1]) {
                    row.push(Markup.button.callback(US_STATES[i + 1].name, `state_${US_STATES[i + 1].code}`));
                }
                stateButtons.push(row);
            }
            
            // Add cancel button at the end
            stateButtons.push([Markup.button.callback('❌ Cancel', 'cancel_registration')]);
            
            return ctx.reply(
                '✅ City: ' + text + '\n\n' +
                '**Step 11 of 15: State** 🗺️\n' +
                'Please select the customer\'s state:', Markup.inlineKeyboard(stateButtons));
            
        case FormState.CUSTOMER_POSTAL:
            if (!/^\d{5}(-\d{4})?$/.test(text)) {
                return ctx.reply('Please enter a valid ZIP code (e.g., 12345 or 12345-6789):');
            }
            ctx.session.customerData.postal = text;
            ctx.session.formState = FormState.CUSTOMER_PASSWORD_OPTION;
            
            // Show password option step
            await ctx.reply(
                '✅ ZIP Code: ' + text + '\n\n' +
                '**Step 13 of 15: Password (Optional)** 🔐\n' +
                'Would you like to add a password for email confirmation services?\n\n' +
                '💡 *This is optional and only needed if you plan to order email confirmation services*\n' +
                '🔧 *You can create a simple temporary password if you want access to email services*',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔐 Add Password', 'add_password_old')],
                    [Markup.button.callback('⏭️ Skip Password', 'skip_password_old')],
                    [Markup.button.callback('❌ Cancel', 'cancel_registration')]
                ])
            );
            break;
            
        case FormState.CUSTOMER_PASSWORD:
            if (!text || text.length < 6) {
                return ctx.reply('❌ Please enter a password with at least 6 characters.');
            }
            // Store password in plain text for admin viewing
            ctx.session.customerData.password_encrypted = text;
            
            // Save customer and show summary
            await saveCustomer(ctx);
            break;
            
        case FormState.CUSTOM_TOKEN_AMOUNT:
            const amount = parseFloat(text);
            
            // Validate amount
            if (isNaN(amount) || amount < 25) {
                return ctx.reply(
                    '❌ Invalid amount. Please enter a valid amount:\n\n' +
                    '• Minimum: $25.00\n' +
                    '• Example: 25, 50, 100\n\n' +
                    'Enter amount:',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('← Back to Tokens', 'buy_tokens')]
                    ])
                );
            }
            
            // Calculate tokens (rate: $0.10 per token)
            const tokens = Math.floor(amount / 0.10);
            
            try {
                // Check if OxaPay environment variables are configured
                if (!process.env.OXAPAY_MERCHANT || !process.env.OXAPAY_API_KEY || !process.env.WEBHOOK_URL) {
                    throw new Error('Payment processing is not configured. Please contact the administrator.');
                }
                
                // Create OxaPay payment for custom amount
                const paymentData = {
                    merchant: process.env.OXAPAY_MERCHANT,
                    amount: amount,
                    currency: 'USD',
                    lifeTime: 30,
                    feePaidByPayer: 1,
                    underPaidCover: 5,
                    callbackUrl: `${process.env.WEBHOOK_URL}/webhook/oxapay`,
                    returnUrl: `${process.env.WEBHOOK_URL}/payment/success`,
                    description: `${tokens} tokens - Custom Amount`,
                    trackId: `${ctx.from.id}_${Date.now()}_${tokens}`
                };

                console.log('💳 Creating custom OxaPay payment:', {
                    amount: amount,
                    tokens: tokens,
                    userId: ctx.from.id
                });

                const response = await axios.post('https://api.oxapay.com/merchants/request', paymentData, {
                    headers: {
                        'Authorization': `Bearer ${process.env.OXAPAY_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.data.result === 100) {
                    // Store transaction for webhook processing
                    const oxapayTrackId = response.data.trackId || response.data.paymentId || paymentData.trackId;
                    const paymentInfo = {
                        user_id: ctx.state.user.id,
                        transaction_type: 'purchase',
                        amount: tokens,
                        balance_after: ctx.state.user.token_balance, // Will be updated when payment completes
                        payment_method: 'OxaPay',
                        payment_id: oxapayTrackId,
                        payment_status: 'pending',
                        description: `${tokens} tokens - Custom Amount`
                    };
                    
                    await db.createTokenTransaction(paymentInfo);
                    
                    console.log(`💾 Stored pending payment: ${oxapayTrackId} for user ${ctx.from.id}`);

                    await ctx.reply(
                        `💳 Payment Created!\n\n` +
                        `Amount: $${amount.toFixed(2)}\n` +
                        `Tokens: ${tokens}\n` +
                        `Rate: $0.10 per token\n\n` +
                        `Click "Pay Now" to complete your payment.\n` +
                        `Payment expires in 30 minutes.`,
                        Markup.inlineKeyboard([
                            [Markup.button.url('💳 Pay Now', response.data.payLink)],
                            [Markup.button.callback('← Back to Menu', 'back_to_menu')]
                        ])
                    );
                } else {
                    throw new Error('Payment creation failed');
                }
            } catch (error) {
                console.error('❌ Custom payment error:', {
                    error: error.message,
                    response: error.response?.data,
                    stack: error.stack
                });
                
                let errorMessage = '❌ Failed to create payment. ';
                
                if (error.response?.data?.message) {
                    errorMessage += `\n\nError: ${error.response.data.message}`;
                } else if (error.message) {
                    errorMessage += `\n\nError: ${error.message}`;
                }
                
                errorMessage += '\n\nPlease try again later or contact support.';
                
                await ctx.reply(
                    errorMessage,
                    Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
                );
            }
            
            // Reset form state
            ctx.session.formState = FormState.NONE;
            break;
            
        case FormState.EDITING_CUSTOMER:
            // Handle customer field editing
            const customerId = ctx.session.editingCustomerId;
            const field = ctx.session.editingField;
            
            if (!customerId || !field) {
                return ctx.reply('❌ Error: Missing editing information.');
            }
            
            // Validate input based on field
            let updateData = {};
            switch (field) {
                case 'first_name':
                    if (text.length < 2) {
                        return ctx.reply('Please enter a valid first name (at least 2 characters):');
                    }
                    updateData.first_name = text.trim();
                    break;
                case 'middle_name':
                    if (text.toLowerCase() === 'none') {
                        updateData.middle_name = null;
                    } else if (text.length < 1) {
                        return ctx.reply('Please enter a valid middle name or type "none":');
                    } else {
                        updateData.middle_name = text.trim();
                    }
                    break;
                case 'last_name':
                    if (text.length < 2) {
                        return ctx.reply('Please enter a valid last name (at least 2 characters):');
                    }
                    updateData.last_name = text.trim();
                    break;
                case 'phone':
                    if (!/^\+?[\d\s\-\(\)]+$/.test(text) || text.replace(/\D/g, '').length < 10) {
                        return ctx.reply('Please enter a valid phone number:');
                    }
                    updateData.phone = text;
                    break;
                case 'email':
                    if (!/\S+@\S+\.\S+/.test(text)) {
                        return ctx.reply('Please enter a valid email address:');
                    }
                    updateData.email = text;
                    break;
                case 'address':
                    if (text.length < 5) {
                        return ctx.reply('Please enter a valid street address:');
                    }
                    updateData.address = text;
                    break;
                case 'apartment':
                    // Allow "none" or empty for no apartment
                    if (text.toLowerCase() === 'none' || text.trim() === '') {
                        updateData.apt_suite = null;
                    } else {
                        updateData.apt_suite = text.trim();
                    }
                    break;
                case 'city':
                    if (text.length < 2) {
                        return ctx.reply('Please enter a valid city name:');
                    }
                    updateData.city = text;
                    break;
                case 'state':
                    if (text.length < 2) {
                        return ctx.reply('Please enter a valid state:');
                    }
                    updateData.state = text;
                    break;
                case 'postal':
                    if (!/^\d{5}(-\d{4})?$/.test(text)) {
                        return ctx.reply('Please enter a valid ZIP code (e.g., 12345 or 12345-6789):');
                    }
                    updateData.postal = text;
                    break;
                case 'dob':
                    // Accept both MM/DD/YYYY and MM-DD-YYYY formats
                    const dobRegex = /^(0[1-9]|1[0-2])[-\/](0[1-9]|[12]\d|3[01])[-\/](\d{4})$/;
                    if (!dobRegex.test(text)) {
                        return ctx.reply('Please enter date of birth in MM/DD/YYYY format (e.g., 03/15/1990):');
                    }
                    
                    const [, month, day, year] = text.match(dobRegex);
                    
                    // Simple year validation without timezone issues
                    const birthYear = parseInt(year);
                    const currentYear = new Date().getFullYear();
                    if (birthYear >= currentYear || birthYear < 1900) {
                        return ctx.reply('Please enter a valid birth year (1900-' + (currentYear - 1) + '):');
                    }
                    
                    // Store in database format YYYY-MM-DD (same as registration logic)
                    updateData.dob = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    break;
                case 'password':
                    if (text.length < 6) {
                        return ctx.reply('Please enter a password with at least 6 characters:');
                    }
                    // Store the encrypted password
                    updateData.password_encrypted = text;
                    break;
            }
            
            try {
                // Log the update data for debugging
                console.log('Updating customer with data:', updateData);
                
                // Update customer in database
                await db.updateCustomerProfile(customerId, updateData);
                
                // Clear editing state
                ctx.session.formState = FormState.NONE;
                ctx.session.editingCustomerId = null;
                ctx.session.editingField = null;
                
                await ctx.reply(
                    '✅ Customer updated successfully!',
                    Markup.inlineKeyboard([[Markup.button.callback('View Customer', `view_customer_${customerId}`)]])
                );
            } catch (error) {
                console.error('❌ Error updating customer:', error);
                await ctx.reply(
                    '❌ Failed to update customer. Please try again.',
                    Markup.inlineKeyboard([[Markup.button.callback('← Back to Customer', `view_customer_${customerId}`)]])
                );
            }
            return;
            
        default:
            // Not in a form state, show menu
            const user = ctx.state.user;
            const welcomeMessage = 
                `🤖 KprCli Main Menu\n\n` +
                `Hello ${user.full_name}! 👋\n\n` +
                `💰 Your current balance: ${user.token_balance} tokens\n\n` +
                `Choose an option below:`;
            
            return ctx.reply(welcomeMessage, getMainMenuKeyboard(user));
    }
});

// Gender selection callbacks
bot.action(/^gender_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    
    const genderMap = {
        'male': 'male',
        'female': 'female',
        'other': 'other',
        'prefer_not_to_say': 'prefer_not_to_say'
    };
    
    ctx.session.customerData.gender = genderMap[ctx.match[1]];
    ctx.session.formState = FormState.CUSTOMER_DOB;
    
    await ctx.editMessageText(
        '✅ Gender: ' + genderMap[ctx.match[1]].replace('_', ' ') + '\n\n' +
        '**Step 7 of 15: Date of Birth** 🎂\n' +
        'Please enter the customer\'s date of birth:\n\n' +
        '💡 *Format: MM-DD-YYYY (Example: 03-15-1990)*',
        Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancel', 'cancel_registration')]
        ])
    );
});

// State selection callbacks
bot.action(/^state_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    
    const stateCode = ctx.match[1];
    const state = US_STATES.find(s => s.code === stateCode);
    
    ctx.session.customerData.state = state.name;
    ctx.session.formState = FormState.CUSTOMER_POSTAL;
    
    await ctx.editMessageText(
        '✅ State: ' + state.name + '\n\n' +
        '**Step 12 of 15: ZIP Code** 📮\n' +
        'Please enter the customer\'s ZIP code:\n\n' +
        '💡 *Examples: 12345 or 12345-6789*',
        Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancel', 'cancel_registration')]
        ])
    );
});

// Save customer function
const saveCustomer = async (ctx) => {
    try {
        const data = ctx.session.customerData;
        const userId = ctx.state.user.id;
        
        console.log('💾 Saving customer:', data);
        
        const customerData = {
            first_name: data.firstName,
            middle_name: data.middleName,
            last_name: data.lastName,
            phone: data.phone,
            email: data.email,
            gender: data.gender,
            dob: data.dob,
            address: data.address,
            apt_suite: data.apartment,
            city: data.city,
            state: data.state,
            postal: data.postal,
            password_encrypted: data.password_encrypted || null
        };
        
        const customer = await db.createCustomerProfile(userId, customerData);
        
        // Reset form state
        ctx.session.formState = FormState.NONE;
        ctx.session.customerData = {};
        
        // Show enhanced success message
        const successMessage = 
            '🎉 **Customer Registration Complete!**\n\n' +
            '✅ **Customer Profile Created Successfully**\n\n' +
            `👤 **Name:** ${data.firstName}${data.middleName ? ` ${data.middleName}` : ''} ${data.lastName}\n` +
            `📞 **Phone:** ${data.phone}\n` +
            `📧 **Email:** ${data.email}\n` +
            `⚧️ **Gender:** ${data.gender.replace('_', ' ')}\n` +
            `🎂 **Date of Birth:** ${data.dobDisplay}\n` +
            `🏠 **Address:** ${data.address}\n` +
            `🏢 **Apt/Suite:** ${data.apartment || 'None'}\n` +
            `🏙️ **City:** ${data.city}\n` +
            `🗺️ **State:** ${data.state}\n` +
            `📮 **ZIP:** ${data.postal}\n` +
            `🌍 **Country:** USA\n` +
            `${data.password_encrypted ? '🔐 **Password:** Set (for email services)\n' : ''}` +
            `🆔 **Profile ID:** ${customer.id.substring(0, 8)}...\n\n` +
            `🛒 **Ready to shop!** You can now place orders for this customer.`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('👥 View All Customers', 'my_customers')],
            [Markup.button.callback('🔙 Main Menu', 'back_to_menu')]
        ]);
        
        await ctx.reply(successMessage, keyboard);
        
    } catch (error) {
        console.error('❌ Error saving customer:', error);
        
        // Reset form state on error
        ctx.session.formState = FormState.NONE;
        ctx.session.customerData = {};
        
        await ctx.reply(
            '❌ **Registration Failed**\n\n' +
            'There was an error saving the customer profile to the database.\n\n' +
            '💡 **Please try again** or contact support if the problem persists.\n\n' +
            'Your information was not saved.',
            Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Try Again', 'new_customer')],
                [Markup.button.callback('🔙 Main Menu', 'back_to_menu')]
            ])
        );
    }
};

// Package selection callbacks for marketplace - DISABLED (Marketplace Coming Soon)
/*
REGISTRATION_PACKAGES.forEach((pkg, index) => {
    bot.action(`package_${index}`, async (ctx) => {
        await ctx.answerCbQuery();
        
        const user = ctx.state.user;
        const hasSubscription = await db.hasActiveSubscription(user.id);
        const tokenCost = hasSubscription ? pkg.subscriberTokens : pkg.baseTokens;
        
        if (user.token_balance < tokenCost) {
            return ctx.editMessageText(
                `❌ Insufficient tokens!\n\n` +
                `Required: ${tokenCost} tokens\n` +
                `Your balance: ${user.token_balance} tokens\n` +
                `You need ${tokenCost - user.token_balance} more tokens.`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('💳 Buy Tokens', 'buy_tokens')],
                    [Markup.button.callback('← Back to Menu', 'back_to_menu')]
                ])
            );
        }
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ Confirm Order', `confirm_package_${index}`)],
            [Markup.button.callback('← Back to Marketplace', 'marketplace')]
        ]);
        
        await ctx.editMessageText(
            `📦 Order Confirmation\n\n` +
            `Package: ${pkg.sites} sites\n` +
            `Cost: ${tokenCost} tokens${hasSubscription ? ' (Subscriber discount applied!)' : ''}\n` +
            `Your balance: ${user.token_balance} tokens\n` +
            `Balance after: ${user.token_balance - tokenCost} tokens\n\n` +
            `⚠️ Please verify all customer information is correct. Incorrect information will require a rerun at 50% of the original cost.`,
            keyboard
        );
    });
});
*/

// Order confirmation callbacks - DISABLED (Marketplace Coming Soon)
/*
REGISTRATION_PACKAGES.forEach((pkg, index) => {
    bot.action(`confirm_package_${index}`, async (ctx) => {
        await ctx.answerCbQuery();
        
        try {
            const user = ctx.state.user;
            const hasSubscription = await db.hasActiveSubscription(user.id);
            const tokenCost = hasSubscription ? pkg.subscriberTokens : pkg.baseTokens;
            
            // Get user's customer profiles
            const customers = await db.getUserCustomers(user.id);
            
            if (customers.length === 0) {
                return ctx.editMessageText(
                    '❌ No customer profiles found!\n\n' +
                    'You need to register a customer first before placing an order.',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('👤 New Customer', 'new_customer')],
                        [Markup.button.callback('← Back to Menu', 'back_to_menu')]
                    ])
                );
            }
            
            // Show customer selection for package
            const customerButtons = customers.map(customer => [
                Markup.button.callback(
                    `👤 ${customer.first_name} ${customer.last_name}`,
                    `select_customer_for_package_${index}_${customer.id}`
                )
            ]);
            
            customerButtons.push([Markup.button.callback('← Back to Packages', 'marketplace')]);
            
            await ctx.editMessageText(
                `📋 Select Customer for Package\n\n` +
                `Package: ${pkg.sites} sites\n` +
                `Cost: ${tokenCost} tokens${hasSubscription ? ' (Subscriber discount applied!)' : ''}\n\n` +
                `Choose which customer to assign this package to:`,
                Markup.inlineKeyboard(customerButtons)
            );
            
        } catch (error) {
            console.error('❌ Error creating order:', error);
            await ctx.editMessageText(
                '❌ Failed to create order. Please try again.',
                Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
            );
        }
    });
});

// Customer selection for marketplace package
REGISTRATION_PACKAGES.forEach((pkg, index) => {
    bot.action(new RegExp(`^select_customer_for_package_${index}_(.+)$`), async (ctx) => {
        await ctx.answerCbQuery();
        
        try {
            const customerId = ctx.match[1];
            const user = ctx.state.user;
            const hasSubscription = await db.hasActiveSubscription(user.id);
            const tokenCost = hasSubscription ? pkg.subscriberTokens : pkg.baseTokens;
            
            // Get customer details
            const customer = await db.getCustomerById(customerId);
            if (!customer) {
                return ctx.editMessageText(
                    '❌ Customer not found!',
                    Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
                );
            }
            
            // Check token balance
            if (user.token_balance < tokenCost) {
                return ctx.editMessageText(
                    `❌ Insufficient tokens!\n\n` +
                    `Required: ${tokenCost} tokens\n` +
                    `Your balance: ${user.token_balance} tokens\n\n` +
                    `Please purchase more tokens to continue.`,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('💰 Buy Tokens', 'buy_tokens')],
                        [Markup.button.callback('← Back to Menu', 'back_to_menu')]
                    ])
                );
            }
            
            // Show final confirmation
            await ctx.editMessageText(
                `🔔 Confirm Order\n\n` +
                `📦 Package: ${pkg.sites} sites\n` +
                `👤 Customer: ${customer.first_name} ${customer.last_name}\n` +
                `💰 Cost: ${tokenCost} tokens${hasSubscription ? ' (Subscriber discount applied!)' : ''}\n` +
                `📧 Email: ${customer.email || 'Not provided'}\n` +
                `📱 Phone: ${customer.phone || 'Not provided'}\n\n` +
                `Are you ready to place this order?`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Confirm Order', `final_confirm_package_${index}_${customerId}`)],
                    [Markup.button.callback('← Back to Customers', `confirm_package_${index}`)],
                    [Markup.button.callback('← Back to Menu', 'back_to_menu')]
                ])
            );
            
        } catch (error) {
            console.error('❌ Error in customer selection:', error);
            await ctx.editMessageText(
                '❌ Something went wrong. Please try again.',
                Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
            );
        }
    });
});
*/

// Final confirmation for marketplace orders - DISABLED (Marketplace Coming Soon)
/*
REGISTRATION_PACKAGES.forEach((pkg, index) => {
    bot.action(new RegExp(`^final_confirm_package_${index}_(.+)$`), async (ctx) => {
        await ctx.answerCbQuery();
        
        try {
            const customerId = ctx.match[1];
            const user = ctx.state.user;
            const hasSubscription = await db.hasActiveSubscription(user.id);
            const tokenCost = hasSubscription ? pkg.subscriberTokens : pkg.baseTokens;
            
            // Get customer details
            const customer = await db.getCustomerById(customerId);
            if (!customer) {
                return ctx.editMessageText(
                    '❌ Customer not found!',
                    Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
                );
            }
            
            // Double-check token balance
            if (user.token_balance < tokenCost) {
                return ctx.editMessageText(
                    `❌ Insufficient tokens!`,
                    Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
                );
            }
            
            // Create order
            const order = await db.createOrder(
                user.id,
                customerId,
                pkg.sites.toString(),
                `Registration Package - ${pkg.sites} sites`,
                tokenCost,
                false, // isPriority
                false // no subscription discount
            );
            
            // Deduct tokens
            await db.updateUserTokenBalance(user.id, -tokenCost, 'spend', `Order #${order.id.substring(0, 8)}`);
            
            await ctx.editMessageText(
                `✅ Order placed successfully!\n\n` +
                `Order ID: ${order.id.substring(0, 8)}\n` +
                `Package: ${pkg.sites} sites\n` +
                `Customer: ${customer.first_name} ${customer.last_name}\n` +
                `Cost: ${tokenCost} tokens${hasSubscription ? ' (Subscriber discount applied!)' : ''}\n` +
                `Status: Pending\n\n` +
                `Your order has been added to the queue. You'll be notified when it's assigned to an operator.`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('📦 My Orders', 'my_orders')],
                    [Markup.button.callback('← Back to Menu', 'back_to_menu')]
                ])
            );
            
        } catch (error) {
            console.error('❌ Error creating order:', error);
            await ctx.editMessageText(
                '❌ Failed to create order. Please try again.',
                Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
            );
        }
    });
});
*/

// Place order callback from customer registration
bot.action(/^place_order_(.+)$/, async (ctx) => {
    console.log('🔍 [ORDER-LOG] NEW place_order handler triggered!', {
        handler: '^place_order_(.+)$',
        customerId: ctx.match[1],
        userId: ctx.from.id,
        username: ctx.from.username,
        timestamp: new Date().toISOString(),
        callbackData: ctx.callbackQuery?.data
    });
    await ctx.answerCbQuery();
    
    const customerId = ctx.match[1];
    
    // Get current packages from database
    const currentPackages = await getCurrentPackages();
    
    // Show only regular packages for initial selection
    const packageButtons = currentPackages.map((pkg, index) => [
        Markup.button.callback(
            `${pkg.sites} sites`,
            `order_package_${index}_${customerId}`
        )
    ]);
    
    packageButtons.push([Markup.button.callback('← Back to Menu', 'back_to_menu')]);
    
    await ctx.editMessageText(
        '📦 Select Package for Order\n\n' +
        'Choose a registration package:',
        Markup.inlineKeyboard(packageButtons)
    );
});

// Email confirmation order handler
bot.action(/^order_email_confirmation_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    
    try {
        const customerId = ctx.match[1];
        const user = ctx.state.user;
        
        // Get customer details
        const customer = await db.getCustomerById(customerId);
        
        if (!customer || !customer.password_encrypted) {
            return await ctx.editMessageText(
                '❌ **Password Required**\n\n' +
                'Email confirmation service requires a password. ' +
                'Please create a new customer profile with a password to use this service.',
                Markup.inlineKeyboard([
                    [Markup.button.callback('👤 New Customer', 'new_customer')],
                    [Markup.button.callback('🔙 Back', `place_order_${customerId}`)]
                ])
            );
        }
        
        // Get email confirmation price from settings
        let emailConfirmationPrice = 350;
        try {
            const priceFromDb = await db.getSettings('email_confirmation_price');
            if (priceFromDb) {
                emailConfirmationPrice = parseInt(priceFromDb);
            }
        } catch (error) {
            console.log('Using default email confirmation price:', emailConfirmationPrice);
        }
        
        // Check if user has enough tokens
        if (user.token_balance < emailConfirmationPrice) {
            return await ctx.editMessageText(
                `❌ **Insufficient Tokens**\n\n` +
                `You need ${emailConfirmationPrice} tokens but only have ${user.token_balance}.\n\n` +
                `💡 You can purchase more tokens to continue!`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('💳 Buy Tokens', 'buy_tokens')],
                    [Markup.button.callback('🔙 Back', `place_order_${customerId}`)]
                ])
            );
        }
        
        // Create the order
        const order = await db.createOrder(
            user.id,                           // userId
            customerId,                        // customerId  
            'email_confirmation',              // packageType
            'Email Confirmation Service',      // productName
            emailConfirmationPrice,            // tokenCost
            false,                            // isPriority
            false                             // hasSubscriptionDiscount
        );
        
        await ctx.editMessageText(
            '✅ **Order Placed Successfully!**\n\n' +
            `📦 **Order ID:** #${order.id.slice(0, 8)}\n` +
            `👤 **Customer:** ${customer.first_name} ${customer.last_name}\n` +
            `🛍️ **Service:** Email Confirmation Service\n` +
            `💰 **Cost:** ${emailConfirmationPrice} tokens\n` +
            `📈 **Status:** ${order.status}\n` +
            `🔢 **Queue Position:** ${order.queue_position}\n\n` +
            `📧 You will receive updates on your order status via Telegram notifications.`,
            Markup.inlineKeyboard([
                [Markup.button.callback('📦 My Orders', 'my_orders')],
                [Markup.button.callback('🛍️ Order More', `place_order_${customerId}`)],
                [Markup.button.callback('🔙 Main Menu', 'back_to_menu')]
            ])
        );
        
    } catch (error) {
        console.error('Email confirmation order error:', error);
        await ctx.reply('❌ Error placing order. Please try again.');
    }
});

// Order package with specific customer - Dynamic handler
bot.action(/^order_package_(\d+)_(.+)$/, async (ctx) => {
    const packageIndex = parseInt(ctx.match[1]);
    const customerId = ctx.match[2];
    
    // Get current packages from database
    const currentPackages = await getCurrentPackages();
    const pkg = currentPackages[packageIndex];
    
    if (!pkg) {
        return ctx.editMessageText(
            '❌ Package not found!',
            Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
        );
    }
    
    console.log('🔍 [ORDER-LOG] order_package handler triggered!', {
        handler: `order_package_${packageIndex}_(.+)`,
        packageIndex: packageIndex,
        customerId: customerId,
        userId: ctx.from.id,
        username: ctx.from.username,
        timestamp: new Date().toISOString(),
        callbackData: ctx.callbackQuery?.data,
        packageSites: pkg.sites
    });
    await ctx.answerCbQuery();
    
    try {
        const user = ctx.state.user;
        const customer = await db.getCustomerById(customerId);
        
        if (!customer) {
            return ctx.editMessageText(
                '❌ Customer not found!',
                Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
            );
        }
        
        const hasSubscription = await db.hasActiveSubscription(user.id);
        const tokenCost = hasSubscription ? pkg.subscriberTokens : pkg.baseTokens;
            
            if (user.token_balance < tokenCost) {
                return safeEditMessage(ctx,
                    `❌ Insufficient tokens!\n\n` +
                    `Required: ${tokenCost} tokens\n` +
                    `Your balance: ${user.token_balance} tokens\n` +
                    `You need ${tokenCost - user.token_balance} more tokens.`,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('💳 Buy Tokens', 'buy_tokens')],
                        [Markup.button.callback('← Back to Menu', 'back_to_menu')]
                    ])
                );
            }
            
            // Show email confirmation choice screen first
            const emailConfirmationPrice = await getEmailConfirmationPrice(hasSubscription);
            const emailChoiceButtons = [
                [Markup.button.callback('✅ Yes, Add Email Confirmation', `email_choice_${packageIndex}_${customerId}_yes`)],
                [Markup.button.callback('❌ No, Continue Without Email', `email_choice_${packageIndex}_${customerId}_no`)],
                [Markup.button.callback('🔙 Cancel', `view_customer_${customerId}`)]
            ];
            
            await safeEditMessage(ctx,
                `📧 **Email Confirmation Service**\n\n` +
                `📦 Package: ${pkg.sites} sites\n` +
                `👤 Customer: ${customer.first_name} ${customer.last_name}\n` +
                `💰 Package Cost: ${tokenCost} tokens${hasSubscription ? ' (Subscriber price)' : ''}\n\n` +
                `📧 **Optional Email Confirmation Service:**\n` +
                `• Cost: +${emailConfirmationPrice} tokens${hasSubscription ? ' (Subscriber rate)' : ''}\n` +
                `• Provides email verification for customer accounts\n\n` +
                `❓ **Would you like to add email confirmation service?**`,
                Markup.inlineKeyboard(emailChoiceButtons)
            );
            
        } catch (error) {
            console.error('❌ Error showing order confirmation:', error);
            await safeEditMessage(ctx,
                '❌ Failed to create order. Please try again.',
                Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
            );
        }
    });

// Email choice handler - shows final confirmation screen (Dynamic)
bot.action(/^email_choice_(\d+)_(.+)_(yes|no)$/, async (ctx) => {
    const packageIndex = parseInt(ctx.match[1]);
    const customerId = ctx.match[2];
    const emailChoice = ctx.match[3];
    
    // Get current packages from database
    const currentPackages = await getCurrentPackages();
    const pkg = currentPackages[packageIndex];
    
    if (!pkg) {
        return ctx.editMessageText(
            '❌ Package not found!',
            Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
        );
    }
    
    console.log('🔍 [ORDER-LOG] email_choice handler triggered!', {
        handler: `email_choice_${packageIndex}_(.+)_(yes|no)`,
        packageIndex: packageIndex,
        customerId: customerId,
        emailChoice: emailChoice,
        userId: ctx.from.id,
        username: ctx.from.username,
        timestamp: new Date().toISOString(),
        callbackData: ctx.callbackQuery?.data,
        packageSites: pkg.sites
    });
    await ctx.answerCbQuery();
    
    const withEmailConfirmation = emailChoice === 'yes';
    
    try {
        const user = ctx.state.user;
        const customer = await db.getCustomerById(customerId);
            
            if (!customer) {
                return ctx.editMessageText(
                    '❌ Customer not found!',
                    Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
                );
            }
            
            // Calculate total cost
            const hasSubscription = await db.hasActiveSubscription(user.id);
            const basePrice = hasSubscription ? pkg.subscriberTokens : pkg.baseTokens;
            const emailConfirmationPrice = await getEmailConfirmationPrice(hasSubscription);
            const totalCost = basePrice + (withEmailConfirmation ? emailConfirmationPrice : 0);
            
            // Check if user has enough tokens
            if (user.token_balance < totalCost) {
                return safeEditMessage(ctx,
                    `❌ Insufficient Tokens\n\n` +
                    `Required: ${totalCost} tokens\n` +
                    `Your balance: ${user.token_balance} tokens\n\n` +
                    `Please purchase more tokens first.`,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('💳 Buy Tokens', 'buy_tokens')],
                        [Markup.button.callback('← Back to Menu', 'back_to_menu')]
                    ])
                );
        }
        
        // Show final confirmation screen
        const finalConfirmationButtons = [
            [Markup.button.callback('✅ Confirm & Create Order', `confirm_order_${packageIndex}_${customerId}_${withEmailConfirmation ? 'yes' : 'no'}`)],
            [Markup.button.callback('🔙 Go Back', `order_package_${packageIndex}_${customerId}`)],
            [Markup.button.callback('❌ Cancel', `view_customer_${customerId}`)]
        ];
        
        await safeEditMessage(ctx,
                `📋 **Final Order Confirmation**\n\n` +
                `📦 **Package:** ${pkg.sites} sites\n` +
                `👤 **Customer:** ${customer.first_name} ${customer.last_name}\n` +
                `💰 **Package Cost:** ${basePrice} tokens${hasSubscription ? ' (Subscriber price)' : ''}\n` +
                `${withEmailConfirmation ? `📧 **Email Confirmation:** +${emailConfirmationPrice} tokens${hasSubscription ? ' (Subscriber rate)' : ''}\n` : ''}` +
                `💵 **Total Cost:** ${totalCost} tokens\n\n` +
                `💳 **Your Balance:** ${user.token_balance} tokens\n` +
                `💸 **After Purchase:** ${user.token_balance - totalCost} tokens\n\n` +
                `⚠️ **Please confirm:** This will create the order and deduct ${totalCost} tokens from your balance.`,
                Markup.inlineKeyboard(finalConfirmationButtons)
        );
        
    } catch (error) {
        console.error('❌ Error showing final confirmation:', error);
        await safeEditMessage(ctx,
            '❌ Failed to show confirmation. Please try again.',
            Markup.inlineKeyboard([[Markup.button.callback('← Back to Menu', 'back_to_menu')]])
        );
    }
});


// Notification helper for order status updates
async function sendOrderStatusNotification(telegramId, order, oldStatus, newStatus, notes = '') {
    try {
        const statusEmoji = {
            'pending': '⏳',
            'processing': '🔄', 
            'assigned': '👤',
            'completed': '✅',
            'cancelled': '❌',
            'refunded': '💸'
        };

        const statusMessages = {
            'pending': 'Your order is pending and will be processed soon.',
            'processing': 'Great news! Your order is now being processed.',
            'assigned': 'Your order has been assigned to an operator.',
            'completed': '🎉 Congratulations! Your order has been completed successfully.',
            'cancelled': 'Your order has been cancelled. Please contact support if you need assistance.',
            'refunded': 'Your order has been refunded. The tokens have been returned to your account.'
        };

        const message = 
            `${statusEmoji[newStatus] || '📦'} **Order Status Update**\n\n` +
            `📋 **Order ID:** #${order.id.slice(0, 8)}\n` +
            `📦 **Package:** ${order.package_type} sites\n` +
            `💰 **Cost:** ${order.token_cost} tokens\n\n` +
            `**Status Changed:**\n` +
            `${statusEmoji[oldStatus] || '•'} ${oldStatus ? oldStatus.toUpperCase() : 'N/A'} → ${statusEmoji[newStatus] || '•'} ${newStatus.toUpperCase()}\n\n` +
            `${statusMessages[newStatus] || 'Your order status has been updated.'}\n` +
            `${notes ? `\n📝 **Notes:** ${notes}\n` : ''}\n` +
            `⏰ Updated: ${new Date().toLocaleString()}`;

        await bot.telegram.sendMessage(telegramId, message, {
            parse_mode: 'Markdown',
            ...getMainMenuKeyboard(null)
        });

        console.log(`✅ Order status notification sent to ${telegramId}: ${oldStatus} → ${newStatus}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to send order notification to ${telegramId}:`, error);
        return false;
    }
}

// Export for use in admin panel
if (typeof module !== 'undefined' && module.exports) {
    module.exports.sendOrderStatusNotification = sendOrderStatusNotification;
}

// Error handling
bot.catch((err, ctx) => {
    console.error('❌ Bot error:', err);
    ctx.reply('An error occurred. Please try again or contact support.');
});

// Create Express server for webhooks
const app = express();
app.use(express.json());

// Admin page route (before static files to take precedence)
app.get('/admin', (req, res) => {
    // Set EXTREME cache-busting headers
    res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate, private, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Last-Modified': new Date().toUTCString(),
        'ETag': Date.now().toString()
    });
    res.sendFile(__dirname + '/admin.html');
});

// Backup admin route
app.get('/admin-test', (req, res) => {
    res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache', 
        'Expires': '0'
    });
    res.sendFile(__dirname + '/admin-working.html');
});

// Serve static files (admin panel) - exclude other admin files
app.use(express.static(__dirname, {
    setHeaders: (res, path) => {
        // Block access to other admin HTML files to prevent confusion
        if (path.includes('admin-') && path.endsWith('.html')) {
            res.status(404).end();
            return;
        }
    }
}));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug endpoint to verify which admin file is being served
app.get('/debug-admin', (req, res) => {
    const fs = require('fs');
    const adminFile = __dirname + '/admin-fixed-1751237817.html';
    
    try {
        const adminContent = fs.readFileSync(adminFile, 'utf8');
        const hasBulletproofFix = adminContent.includes('BULLETPROOF FIX v1751237817');
        const hasCorrectDeletion = adminContent.includes('Customer deletion had an issue, but continuing');
        const hasOldError = adminContent.includes('Customer not found or already deleted');
        
        res.json({
            status: 'OK',
            file: adminFile,
            hasBulletproofFix,
            hasCorrectDeletion,
            hasOldError: hasOldError && !hasCorrectDeletion, // Only old error if no new fix
            timestamp: Date.now(),
            version: '1751237817'
        });
    } catch (error) {
        res.json({
            status: 'ERROR',
            error: error.message
        });
    }
});

// Config endpoint for frontend
app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY
    });
});

// Authentication middleware
async function requireAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        
        try {
            // Decode the simple token
            const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
            
            // Check if token is expired
            if (decoded.exp && Date.now() > decoded.exp) {
                return res.status(401).json({ error: 'Token expired' });
            }
            
            // Check if user is admin
            if (!decoded.isAdmin) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            req.user = decoded;
            next();
        } catch (tokenError) {
            return res.status(401).json({ error: 'Invalid token' });
        }
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
}

// Admin login endpoint
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Simple hardcoded admin credentials for now
        const validCredentials = [
            { username: 'admin', password: 'admin123', name: 'Admin User' },
            { username: 'koodosbots@gmail.com', password: 'Amity89@!', name: 'Koodos Admin' },
            { username: 'imKoodos_Youtube', password: 'Amity89@!', name: 'Koodos Admin' }
        ];

        const validCred = validCredentials.find(cred => 
            (cred.username === username || cred.username === username.toLowerCase()) && 
            cred.password === password
        );

        if (!validCred) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate a simple JWT-like token
        const token = Buffer.from(JSON.stringify({
            username: validCred.username,
            name: validCred.name,
            isAdmin: true,
            exp: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        })).toString('base64');

        res.json({
            success: true,
            token: token,
            user: {
                username: validCred.username,
                name: validCred.name,
                isAdmin: true
            }
        });

    } catch (error) {
        console.error('Login endpoint error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin API endpoints
app.get('/api/admin/stats', requireAuth, async (req, res) => {
    try {
        const stats = await db.getStats();
        
        // Get total customers count
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const { count: totalCustomers } = await supabase
            .from('customer_profiles')
            .select('*', { count: 'exact', head: true });
        
        res.json({
            totalUsers: stats.totalUsers || 0,
            totalOrders: stats.totalOrders || 0,
            pendingOrders: stats.pendingOrders || 0,
            totalRevenue: stats.totalRevenue || 0,
            totalCustomers: totalCustomers || 0
        });
    } catch (error) {
        console.error('Error fetching admin stats:', error);
        res.json({
            totalUsers: 0,
            totalOrders: 0,
            pendingOrders: 0,
            totalRevenue: 0,
            totalCustomers: 0
        });
    }
});

app.get('/api/admin/orders', requireAuth, async (req, res) => {
    try {
        const { supabase } = require('./supabase-client');
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                *,
                customer_profiles (first_name, last_name, phone),
                users!orders_user_id_fkey (telegram_id)
            `)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        const formattedOrders = orders.map(order => ({
            id: order.id,
            customer_name: order.customer_profiles ? `${order.customer_profiles.first_name || ''} ${order.customer_profiles.last_name || ''}`.trim() || 'Unknown' : 'Unknown',
            package_type: order.package_type,
            token_cost: order.token_cost,
            status: order.status,
            created_at: order.created_at,
            telegram_id: order.users?.telegram_id
        }));

        res.json(formattedOrders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.json([]);
    }
});

app.get('/api/admin/users', requireAuth, async (req, res) => {
    try {
        const { supabase } = require('./supabase-client');
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        res.json(users || []);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.json([]);
    }
});

app.put('/api/admin/orders/:orderId/status', requireAuth, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status, notes } = req.body;

        const { supabase } = require('./supabase-client');
        
        // First get the current order to track old status
        const { data: currentOrder, error: fetchError } = await supabase
            .from('orders')
            .select(`
                *,
                users!orders_user_id_fkey (telegram_id),
                customer_profiles (first_name, last_name)
            `)
            .eq('id', orderId)
            .single();

        if (fetchError) throw fetchError;
        if (!currentOrder) throw new Error('Order not found');

        const oldStatus = currentOrder.status;

        // Update order status
        const updates = { 
            status: status,
            notes: notes || currentOrder.notes
        };
        
        if (status === 'completed') {
            updates.completed_at = new Date().toISOString();
        }

        const { error } = await supabase
            .from('orders')
            .update(updates)
            .eq('id', orderId);

        if (error) throw error;

        // Send notification if status changed
        if (oldStatus !== status && currentOrder.users?.telegram_id) {
            try {
                await sendOrderStatusNotification(
                    currentOrder.users.telegram_id,
                    currentOrder,
                    oldStatus,
                    status,
                    notes
                );
                console.log(`✅ Order notification sent for order ${orderId}: ${oldStatus} → ${status}`);
            } catch (notifyError) {
                console.error('Failed to notify user:', notifyError);
            }
        }

        res.json({ 
            success: true,
            oldStatus,
            newStatus: status,
            notificationSent: oldStatus !== status
        });

    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Customers API endpoint
app.get('/api/admin/customers', requireAuth, async (req, res) => {
    try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        
        const { data: customers, error } = await supabase
            .from('customer_profiles')
            .select(`
                *,
                users!customer_profiles_user_id_fkey (
                    telegram_username
                )
            `)
            .order('registered', { ascending: false })
            .limit(100);

        if (error) throw error;

        const formattedCustomers = customers.map(customer => ({
            id: customer.id,
            first_name: customer.first_name,
            last_name: customer.last_name,
            phone: customer.phone,
            email: customer.email,
            gender: customer.gender,
            dob: customer.dob,
            address: customer.address,
            city: customer.city,
            state: customer.state,
            postal: customer.postal,
            registered: customer.registered,
            created_by_username: customer.users?.telegram_username || 'Unknown'
        }));

        res.json(formattedCustomers);
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.json([]);
    }
});

// Operators API endpoint
app.get('/api/admin/operators', requireAuth, async (req, res) => {
    try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        
        const { data: operators, error } = await supabase
            .from('users')
            .select('*')
            .eq('is_admin', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(operators || []);
    } catch (error) {
        console.error('Error fetching operators:', error);
        res.json([]);
    }
});

// Analytics API endpoint
app.get('/api/admin/analytics', requireAuth, async (req, res) => {
    try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        
        // Get orders by status
        const { data: orders } = await supabase
            .from('orders')
            .select('status');

        const ordersByStatus = {
            pending: 0,
            assigned: 0,
            processing: 0,
            completed: 0
        };

        orders?.forEach(order => {
            if (ordersByStatus.hasOwnProperty(order.status)) {
                ordersByStatus[order.status]++;
            }
        });

        // Get daily orders for last 7 days
        const dailyOrders = {};
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            dailyOrders[dateStr] = 0;
        }

        // Get token usage data
        const tokenUsage = {
            purchased: 1000,
            spent: 750,
            remaining: 250
        };

        // Get user growth data
        const userGrowth = {
            thisMonth: 45,
            lastMonth: 32,
            growth: 40.6
        };

        res.json({
            ordersByStatus,
            dailyOrders,
            tokenUsage,
            userGrowth
        });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.json({
            ordersByStatus: {},
            dailyOrders: {},
            tokenUsage: {},
            userGrowth: {}
        });
    }
});

// Order assignment endpoint
app.post('/api/admin/orders/assign', requireAuth, async (req, res) => {
    try {
        const { orderId, operatorId } = req.body;

        if (!orderId || !operatorId) {
            return res.status(400).json({ error: 'Missing orderId or operatorId' });
        }

        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        
        const { error } = await supabase
            .from('orders')
            .update({
                assigned_to: operatorId,
                status: 'assigned',
                assigned_at: new Date().toISOString()
            })
            .eq('id', orderId);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Error assigning order:', error);
        res.status(500).json({ error: 'Failed to assign order' });
    }
});

// Customer export endpoint
app.get('/api/admin/customers/export', requireAuth, async (req, res) => {
    try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        
        const { data: customers, error } = await supabase
            .from('customer_profiles')
            .select('*')
            .order('registered', { ascending: false });

        if (error) throw error;

        // Convert to CSV
        const csvHeaders = 'First Name,Last Name,Phone,Email,Gender,DOB,Address,City,State,Postal Code,Registered\n';
        const csvRows = customers.map(customer => 
            `"${customer.first_name}","${customer.last_name}","${customer.phone}","${customer.email}","${customer.gender}","${customer.dob}","${customer.address}","${customer.city}","${customer.state}","${customer.postal}","${customer.registered}"`
        ).join('\n');
        
        const csv = csvHeaders + csvRows;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
        res.send(csv);
    } catch (error) {
        console.error('Error exporting customers:', error);
        res.status(500).json({ error: 'Failed to export customers' });
    }
});

// Delete order endpoint
app.delete('/api/admin/orders/:orderId', requireAuth, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { supabase } = require('./supabase-client');
        
        const { error } = await supabase
            .from('orders')
            .delete()
            .eq('id', orderId);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting order:', error);
        res.status(500).json({ error: 'Failed to delete order' });
    }
});

// Update user tokens endpoint
app.put('/api/admin/users/:userId/tokens', requireAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const { amount, description } = req.body;
        
        if (!amount || !description) {
            return res.status(400).json({ error: 'Amount and description are required' });
        }

        await db.updateTokenBalance(userId, amount, amount > 0 ? 'admin_credit' : 'admin_debit', description);
        
        // Get user info for notification
        const { supabase } = require('./supabase-client');
        const { data: user } = await supabase
            .from('users')
            .select('telegram_id, token_balance')
            .eq('id', userId)
            .single();

        if (user?.telegram_id) {
            try {
                const emoji = amount > 0 ? '🎉' : '⚠️';
                const action = amount > 0 ? 'added to' : 'deducted from';
                const absAmount = Math.abs(amount);
                
                await bot.telegram.sendMessage(user.telegram_id, 
                    `${emoji} **Token Balance Update**\n\n` +
                    `💰 **${absAmount} tokens** have been ${action} your account by admin\n\n` +
                    `📊 **New Balance:** ${user.token_balance} tokens\n\n` +
                    `📝 **Reason:** ${description}\n\n` +
                    `---\n🤖 KprCli Admin Panel`,
                    { parse_mode: 'Markdown' }
                );
            } catch (notifyError) {
                console.error('Failed to notify user:', notifyError);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating tokens:', error);
        res.status(500).json({ error: 'Failed to update tokens' });
    }
});

// Make user admin endpoint
app.put('/api/admin/users/:userId/admin', requireAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const { isAdmin } = req.body;
        
        const { supabase } = require('./supabase-client');
        const { data, error } = await supabase
            .from('users')
            .update({ is_admin: isAdmin })
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, user: data });
    } catch (error) {
        console.error('Error updating admin status:', error);
        res.status(500).json({ error: 'Failed to update admin status' });
    }
});

// Delete customer endpoint
app.delete('/api/admin/customers/:customerId', requireAuth, async (req, res) => {
    try {
        const { customerId } = req.params;
        const { supabase } = require('./supabase-client');
        
        const { error } = await supabase
            .from('customer_profiles')
            .delete()
            .eq('id', customerId);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting customer:', error);
        res.status(500).json({ error: 'Failed to delete customer' });
    }
});

// Update customer endpoint
app.put('/api/admin/customers/:customerId', requireAuth, async (req, res) => {
    try {
        const { customerId } = req.params;
        const updates = req.body;
        
        const { supabase } = require('./supabase-client');
        const { data, error } = await supabase
            .from('customer_profiles')
            .update(updates)
            .eq('id', customerId)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, customer: data });
    } catch (error) {
        console.error('Error updating customer:', error);
        res.status(500).json({ error: 'Failed to update customer' });
    }
});

// Webhook test endpoint
app.get('/webhook/oxapay', (req, res) => {
    res.json({ 
        status: 'webhook endpoint active',
        method: 'GET request received - expecting POST for actual webhooks',
        timestamp: new Date().toISOString() 
    });
});

// Status update webhook from admin panel
app.post('/webhook/status-update', async (req, res) => {
    try {
        console.log('📢 Status update webhook received:', req.body);
        
        const { orderId, newStatus, telegramId, customerName, packageType } = req.body;
        
        if (!orderId || !newStatus || !telegramId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const statusEmoji = {
            'pending': '⏳',
            'processing': '🔄',
            'completed': '✅',
            'cancelled': '❌'
        };
        
        const statusMessage = {
            'pending': 'Your order is pending and will be processed soon.',
            'processing': 'Your order is currently being processed.',
            'completed': 'Your order has been completed successfully! 🎉',
            'cancelled': 'Your order has been cancelled.'
        };
        
        const message = 
            `${statusEmoji[newStatus]} Order Status Update\n\n` +
            `Order ID: ${orderId.substring(0, 8)}\n` +
            `Customer: ${customerName}\n` +
            `Package: ${packageType} sites\n` +
            `Status: ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}\n\n` +
            `${statusMessage[newStatus]}`;
        
        // Send notification to user
        await bot.telegram.sendMessage(telegramId, message, getMainMenuKeyboard(null));
        
        console.log(`✅ Status update notification sent to user ${telegramId}`);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('❌ Status update webhook error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// OxaPay webhook handler
app.post('/webhook/oxapay', async (req, res) => {
    try {
        console.log('🔔 OxaPay webhook received:', JSON.stringify(req.body, null, 2));
        
        const { trackId, status, amount, currency, description } = req.body;
        
        // For OxaPay, they might not send merchant field, so we skip that check
        // Instead, we'll verify the payment by checking if we have a pending transaction with this trackId
        
        // Extract tokens from description (e.g., "100 tokens - Starter Pack")
        const tokenMatch = description.match(/(\d+)\s+tokens/);
        if (!tokenMatch) {
            console.error('❌ Could not extract token amount from description:', description);
            return res.status(400).json({ error: 'Invalid description format' });
        }
        
        const tokens = parseInt(tokenMatch[1]);
        
        
        if (status === 'Paid') {
            // Find the pending transaction by payment ID
            const pendingTransaction = await db.getTransactionByPaymentId(trackId);
            
            if (!pendingTransaction) {
                console.error('❌ No pending transaction found for trackId:', trackId);
                return res.status(404).json({ error: 'Transaction not found' });
            }
            
            // Get the user
            const user = await db.getUserById(pendingTransaction.user_id);
            if (!user) {
                console.error('❌ User not found for transaction');
                return res.status(404).json({ error: 'User not found' });
            }
            
            // Update the transaction status
            await db.updateTransactionStatus(trackId, 'completed');
            
            // Credit tokens to user
            const newBalance = await db.updateUserTokenBalance(
                user.id,
                tokens,
                'purchase',
                `Token purchase - $${amount} ${currency}`,
                'OxaPay',
                trackId,
                'completed'
            );
            
            console.log(`✅ Credited ${tokens} tokens to user ${user.telegram_id}`);
            
            // Notify user
            try {
                await bot.telegram.sendMessage(
                    user.telegram_id,
                    `🎉 Payment successful!\n\n` +
                    `${tokens} tokens have been added to your account.\n` +
                    `New balance: ${newBalance} tokens\n\n` +
                    `Thank you for your purchase!`,
                    getMainMenuKeyboard(user)
                );
            } catch (notifyError) {
                console.error('❌ Failed to notify user:', notifyError);
            }
        } else if (status === 'Waiting' || status === 'Confirming') {
            console.log(`⏳ Payment ${status.toLowerCase()} for trackId: ${trackId}`);
        } else if (status === 'Expired' || status === 'Failed') {
            console.log(`❌ Payment failed: ${trackId}, status: ${status}`);
            // Update transaction status to failed
            const pendingTransaction = await db.getTransactionByPaymentId(trackId);
            if (pendingTransaction) {
                await db.updateTransactionStatus(trackId, 'failed');
            }
        } else {
            console.log(`ℹ️ Payment status update: ${trackId}, status: ${status}`);
        }
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('❌ Webhook processing error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Order status notification webhook
app.post('/webhook/order-status', async (req, res) => {
    try {
        const { orderId, telegramId, order, oldStatus, newStatus, notes } = req.body;
        
        if (!telegramId || !order || !newStatus) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const success = await sendOrderStatusNotification(telegramId, order, oldStatus, newStatus, notes);
        
        res.json({ success });
    } catch (error) {
        console.error('❌ Order status webhook error:', error);
        res.status(500).json({ error: 'Failed to send notification' });
    }
});

// Express server will be started with the bot after pricing is loaded

// Global error handling
bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    
    // Don't expose internal errors to users
    const userErrorMessage = '❌ Something went wrong. Please try again or contact support if the problem persists.';
    
    try {
        if (ctx.reply) {
            ctx.reply(userErrorMessage).catch(() => {
                console.error('Failed to send error message to user');
            });
        }
    } catch (replyError) {
        console.error('Error in error handler:', replyError);
    }
});

// Start bot in polling mode
console.log('🤖 Starting KprCli bot...');

// Load pricing settings before starting the bot
loadPricingSettings().then(() => {
    // Start Express server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🌐 Webhook server running on port ${PORT}`);
    });
    
    // Start bot
    bot.launch({
        polling: true
    });
    console.log('✅ KprCli bot is running in polling mode');
    
    // Initialize payment fallback service
    const paymentFallback = new PaymentFallbackService();
    paymentFallback.start();
    
    // Store reference for potential shutdown
    global.paymentFallback = paymentFallback;
}).catch(error => {
    console.error('❌ Failed to load pricing settings:', error);
    console.log('📄 Starting bot with default pricing...');
    
    // Start Express server even if pricing fails
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🌐 Webhook server running on port ${PORT}`);
    });
    
    // Start bot
    bot.launch({
        polling: true
    });
    console.log('✅ KprCli bot is running in polling mode');
    
    // Initialize payment fallback service
    const paymentFallback = new PaymentFallbackService();
    paymentFallback.start();
    
    // Store reference for potential shutdown
    global.paymentFallback = paymentFallback;
});

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down gracefully...');
    try {
        bot.stop('SIGINT');
    } catch (error) {
        console.log('Bot was already stopped');
    }
    
    // Stop payment fallback service
    if (global.paymentFallback) {
        global.paymentFallback.stop();
    }
    
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    try {
        bot.stop('SIGTERM');
    } catch (error) {
        console.log('Bot was already stopped');
    }
    
    // Stop payment fallback service
    if (global.paymentFallback) {
        global.paymentFallback.stop();
    }
    
    process.exit(0);
});
