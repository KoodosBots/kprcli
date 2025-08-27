#!/usr/bin/env node

/**
 * Enhanced KprCli Telegram Bot
 * Integrates TeleKpr functionality with AI automation and admin control
 * 
 * Features:
 * - User authentication and Clerk account linking
 * - AI form automation job management
 * - Admin system control commands
 * - Real-time status updates and notifications
 * - Token-based economy with subscription tiers
 */

require('dotenv').config();

// Force IPv4 for Telegram API stability
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { Telegraf, Markup, session } = require('telegraf');
const { db } = require('./supabase-client');
const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Initialize enhanced bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Session middleware
bot.use(session());

// Configuration
const CONFIG = {
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    KPRCLI_API_URL: process.env.KPRCLI_API_URL || 'http://kprcli-api:8000',
    ADMIN_CONTROL_ENABLED: process.env.ADMIN_CONTROL_ENABLED === 'true',
    AI_AUTOMATION_ENABLED: process.env.AI_FORM_AUTOMATION_ENABLED === 'true',
    WEBHOOK_URL: process.env.WEBHOOK_URL,
    MAX_CONCURRENT_JOBS: parseInt(process.env.MAX_CONCURRENT_JOBS) || 3,
    SQUAD_TIER_REQUIRED: true // Telegram bot access requires Squad tier
};

// Enhanced FormState with AI automation states
const FormState = {
    ...require('./bot.js').FormState, // Import existing states
    AI_FORM_URL: 'ai_form_url',
    AI_PROFILE_SELECTION: 'ai_profile_selection',
    AI_MODEL_SELECTION: 'ai_model_selection',
    AI_TRAINING_CONFIRMATION: 'ai_training_confirmation',
    ADMIN_COMMAND: 'admin_command',
    ADMIN_CONFIRMATION: 'admin_confirmation'
};

// Admin command definitions
const ADMIN_COMMANDS = {
    '/admin_status': {
        description: 'Check system status across all user installations',
        adminOnly: true,
        handler: handleAdminStatus
    },
    '/admin_update': {
        description: 'Push system updates to user installations',
        adminOnly: true,
        handler: handleAdminUpdate
    },
    '/admin_monitor': {
        description: 'Monitor user activities and system health',
        adminOnly: true,
        handler: handleAdminMonitor
    },
    '/admin_broadcast': {
        description: 'Send broadcast message to all users',
        adminOnly: true,
        handler: handleAdminBroadcast
    },
    '/admin_restart': {
        description: 'Restart services for specific user',
        adminOnly: true,
        handler: handleAdminRestart
    }
};

// AI automation commands
const AI_COMMANDS = {
    '/train_form': {
        description: 'Train AI to fill a specific form',
        handler: handleTrainForm
    },
    '/my_automations': {
        description: 'View your automation jobs and patterns',
        handler: handleMyAutomations
    },
    '/start_automation': {
        description: 'Start form automation job',
        handler: handleStartAutomation
    },
    '/automation_status': {
        description: 'Check status of running automations',
        handler: handleAutomationStatus
    },
    '/link_account': {
        description: 'Link Telegram to your KprCli web account',
        handler: handleLinkAccount
    }
};

// Enhanced user management
async function getOrCreateEnhancedUser(ctx) {
    const telegramId = ctx.from.id;
    const telegramUsername = ctx.from.username;
    const fullName = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim();

    try {
        // Check if user exists
        let { data: user } = await db
            .from('users')
            .select('*')
            .eq('telegram_id', telegramId)
            .single();

        if (!user) {
            // Create new user
            const { data: newUser, error } = await db
                .from('users')
                .insert({
                    telegram_id: telegramId,
                    telegram_username: telegramUsername,
                    full_name: fullName,
                    token_balance: 100, // Welcome bonus
                    subscription_tier: 'solo',
                    subscription_status: 'active',
                    automation_credits: 10 // Free automation credits
                })
                .select()
                .single();

            if (error) throw error;
            user = newUser;

            // Send welcome message for new users
            await sendWelcomeMessage(ctx, user);
        }

        return user;
    } catch (error) {
        console.error('[USER] Failed to get/create enhanced user:', error);
        throw error;
    }
}

async function sendWelcomeMessage(ctx, user) {
    const welcomeText = `🎉 *Welcome to KprCli!*

Hi ${user.full_name || 'there'}! You've just joined the future of form automation.

🤖 *What is KprCli?*
KprCli uses AI to learn how you fill forms once, then automates the process forever with 99% accuracy.

🎁 *Welcome Bonus:*
• 100 tokens added to your account
• 10 free automation credits
• Access to Solo tier features

🚀 *Getting Started:*
1. Visit your web dashboard to train your first form
2. Use /train_form to start AI training via Telegram
3. Upgrade to Squad tier for full Telegram bot access

💡 *Quick Commands:*
/my_automations - View your automation jobs
/balance - Check token balance
/help - See all available commands

Ready to save hours of manual work? Let's get started! 🚀`;

    await ctx.reply(welcomeText, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🌐 Open Web Dashboard', url: `${CONFIG.WEBHOOK_URL}` },
                    { text: '🤖 Train First Form', callback_data: 'train_form' }
                ],
                [
                    { text: '⬆️ Upgrade to Squad', callback_data: 'upgrade_squad' },
                    { text: '❓ Help', callback_data: 'help' }
                ]
            ]
        }
    });
}

// Enhanced start command with AI automation info
bot.command('start', async (ctx) => {
    try {
        const user = await getOrCreateEnhancedUser(ctx);
        
        const startText = `🤖 *KprCli - AI Form Automation*

Welcome back, ${user.full_name || 'Automation Expert'}!

📊 *Your Account:*
• Balance: ${user.token_balance} tokens
• Tier: ${user.subscription_tier.toUpperCase()}
• Credits: ${user.automation_credits} automation credits

🎯 *What would you like to do?*`;

        const keyboard = [
            [
                { text: '🤖 Train New Form', callback_data: 'train_form' },
                { text: '📋 My Automations', callback_data: 'my_automations' }
            ],
            [
                { text: '⚡ Start Automation', callback_data: 'start_automation' },
                { text: '📊 View Status', callback_data: 'automation_status' }
            ],
            [
                { text: '💰 Buy Tokens', callback_data: 'buy_tokens' },
                { text: '⬆️ Upgrade Plan', callback_data: 'upgrade_plan' }
            ]
        ];

        // Add admin commands for admin users
        if (user.is_admin) {
            keyboard.push([
                { text: '👑 Admin Panel', callback_data: 'admin_panel' },
                { text: '📡 System Monitor', callback_data: 'admin_monitor' }
            ]);
        }

        // Add account linking for Squad tier
        if (user.subscription_tier === 'squad' && !user.clerk_user_id) {
            keyboard.push([
                { text: '🔗 Link Web Account', callback_data: 'link_account' }
            ]);
        }

        await ctx.reply(startText, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });

    } catch (error) {
        console.error('[START] Command failed:', error);
        await ctx.reply('❌ Something went wrong. Please try again.');
    }
});

// AI Form Training Handler
async function handleTrainForm(ctx) {
    const user = await getOrCreateEnhancedUser(ctx);
    
    if (!CONFIG.AI_AUTOMATION_ENABLED) {
        return ctx.reply('🔧 AI automation is currently disabled. Please contact support.');
    }

    if (user.automation_credits <= 0) {
        return ctx.reply('❌ You don\'t have enough automation credits. Please buy more or upgrade your plan.', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💰 Buy Credits', callback_data: 'buy_tokens' }],
                    [{ text: '⬆️ Upgrade Plan', callback_data: 'upgrade_plan' }]
                ]
            }
        });
    }

    ctx.session.formState = FormState.AI_FORM_URL;
    
    await ctx.reply('🤖 *AI Form Training*\n\nPlease send me the URL of the form you want to train the AI to fill:\n\nExample: https://example.com/contact-form', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[
                { text: '❌ Cancel', callback_data: 'cancel_training' }
            ]]
        }
    });
}

// Handle form URL input for AI training
bot.on('text', async (ctx) => {
    if (ctx.session.formState === FormState.AI_FORM_URL) {
        const formUrl = ctx.message.text.trim();
        
        // Validate URL
        try {
            new URL(formUrl);
        } catch {
            return ctx.reply('❌ Please enter a valid URL starting with http:// or https://');
        }

        ctx.session.trainingData = { formUrl };
        ctx.session.formState = FormState.AI_PROFILE_SELECTION;

        // Get user's customer profiles
        const { data: profiles } = await db
            .from('customer_profiles')
            .select('*')
            .eq('user_id', ctx.session.user.id)
            .order('created_at', { ascending: false });

        if (profiles.length === 0) {
            return ctx.reply('❌ You don\'t have any customer profiles yet. Please create one first using /register or on the web dashboard.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '➕ Create Profile', callback_data: 'register_customer' }],
                        [{ text: '🌐 Open Web Dashboard', url: CONFIG.WEBHOOK_URL }]
                    ]
                }
            });
        }

        const profileButtons = profiles.slice(0, 8).map(profile => [{
            text: `${profile.first_name} ${profile.last_name}`,
            callback_data: `select_profile_${profile.id}`
        }]);

        profileButtons.push([{ text: '❌ Cancel', callback_data: 'cancel_training' }]);

        await ctx.reply(`🎯 *Form URL Received:* ${formUrl}\n\nSelect which customer profile to use for training:`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: profileButtons }
        });
    }
});

// Handle profile selection for AI training
bot.action(/^select_profile_(.+)$/, async (ctx) => {
    if (ctx.session.formState !== FormState.AI_PROFILE_SELECTION) return;

    const profileId = ctx.match[1];
    ctx.session.trainingData.profileId = profileId;
    ctx.session.formState = FormState.AI_MODEL_SELECTION;

    const modelButtons = [
        [{ text: '🚀 Groq (Fastest)', callback_data: 'model_groq' }],
        [{ text: '🧠 OpenRouter (Most Capable)', callback_data: 'model_openrouter' }],
        [{ text: '🏠 Ollama (Local/Private)', callback_data: 'model_ollama' }],
        [{ text: '🎯 Auto-Select Best', callback_data: 'model_auto' }],
        [{ text: '❌ Cancel', callback_data: 'cancel_training' }]
    ];

    await ctx.editMessageText('🤖 *Choose AI Model for Training:*\n\n• Groq: Fastest processing, great for simple forms\n• OpenRouter: Most capable, handles complex forms\n• Ollama: Local processing, maximum privacy\n• Auto-Select: System chooses best model', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: modelButtons }
    });
});

// Handle AI model selection
bot.action(/^model_(.+)$/, async (ctx) => {
    if (ctx.session.formState !== FormState.AI_MODEL_SELECTION) return;

    const modelType = ctx.match[1];
    ctx.session.trainingData.aiModel = modelType;
    ctx.session.formState = FormState.AI_TRAINING_CONFIRMATION;

    const { formUrl, profileId, aiModel } = ctx.session.trainingData;
    
    // Get profile name
    const { data: profile } = await db
        .from('customer_profiles')
        .select('first_name, last_name')
        .eq('id', profileId)
        .single();

    const confirmationText = `🎯 *Training Configuration:*

📝 **Form URL:** ${formUrl}
👤 **Profile:** ${profile.first_name} ${profile.last_name}
🤖 **AI Model:** ${aiModel.toUpperCase()}

🔥 **Training Process:**
1. AI will analyze the form structure
2. You'll fill the form naturally once
3. AI learns your patterns and data mapping
4. Future automations will be 99% accurate

💰 **Cost:** 1 automation credit

Ready to start training?`;

    await ctx.editMessageText(confirmationText, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🚀 Start Training', callback_data: 'confirm_training' },
                    { text: '❌ Cancel', callback_data: 'cancel_training' }
                ]
            ]
        }
    });
});

// Confirm training and start the process
bot.action('confirm_training', async (ctx) => {
    if (ctx.session.formState !== FormState.AI_TRAINING_CONFIRMATION) return;

    try {
        const user = await getOrCreateEnhancedUser(ctx);
        const { formUrl, profileId, aiModel } = ctx.session.trainingData;

        // Deduct automation credit
        await db
            .from('users')
            .update({ automation_credits: user.automation_credits - 1 })
            .eq('id', user.id);

        // Create training session via API
        const response = await axios.post(`${CONFIG.KPRCLI_API_URL}/api/automation/train`, {
            userId: user.id,
            formUrl,
            profileId,
            aiModel,
            source: 'telegram'
        });

        const { trainingSessionId, browserUrl } = response.data;

        await ctx.editMessageText(`🎯 *Training Started Successfully!*

🔗 **Training Session ID:** \`${trainingSessionId}\`

🌐 **Next Steps:**
1. Open this link: ${browserUrl}
2. Fill out the form naturally
3. Submit the form once
4. AI will learn from your actions

⏱ **Session expires in 30 minutes**

I'll notify you when training is complete!`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🌐 Open Training Browser', url: browserUrl }],
                    [{ text: '📊 Check Status', callback_data: `training_status_${trainingSessionId}` }]
                ]
            }
        });

        // Clear session state
        ctx.session.formState = FormState.NONE;
        ctx.session.trainingData = null;

    } catch (error) {
        console.error('[TRAINING] Failed to start training:', error);
        await ctx.editMessageText('❌ Failed to start training session. Please try again or contact support.');
    }
});

// My Automations Handler
async function handleMyAutomations(ctx) {
    try {
        const user = await getOrCreateEnhancedUser(ctx);

        // Get user's form patterns and recent jobs
        const [patternsResult, jobsResult] = await Promise.all([
            db.from('form_patterns')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(5),
            db.from('automation_jobs')
                .select(`
                    *,
                    form_patterns(name),
                    customer_profiles(first_name, last_name)
                `)
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(5)
        ]);

        const patterns = patternsResult.data || [];
        const jobs = jobsResult.data || [];

        let responseText = `🤖 *Your AI Automations*\n\n`;

        // Form Patterns
        if (patterns.length > 0) {
            responseText += `📋 **Trained Forms (${patterns.length}):**\n`;
            patterns.forEach((pattern, index) => {
                const successRate = pattern.success_rate || 0;
                const statusEmoji = pattern.is_active ? '✅' : '⏸';
                responseText += `${index + 1}. ${statusEmoji} ${pattern.name}\n   Success: ${successRate}% (${pattern.successful_executions}/${pattern.total_executions})\n`;
            });
            responseText += '\n';
        } else {
            responseText += '📋 **No trained forms yet**\nUse /train_form to get started!\n\n';
        }

        // Recent Jobs
        if (jobs.length > 0) {
            responseText += `⚡ **Recent Jobs (${jobs.length}):**\n`;
            jobs.forEach((job, index) => {
                const statusEmoji = 
                    job.status === 'completed' ? '✅' : 
                    job.status === 'running' ? '🔄' : 
                    job.status === 'failed' ? '❌' : '⏳';
                const customerName = job.customer_profiles ? 
                    `${job.customer_profiles.first_name} ${job.customer_profiles.last_name}` : 
                    'Unknown';
                responseText += `${index + 1}. ${statusEmoji} ${job.job_name || 'Automation'}\n   Customer: ${customerName}\n`;
            });
        } else {
            responseText += '⚡ **No automation jobs yet**\nStart your first automation!';
        }

        const keyboard = [
            [
                { text: '🤖 Train New Form', callback_data: 'train_form' },
                { text: '⚡ Start Automation', callback_data: 'start_automation' }
            ],
            [
                { text: '🔄 Refresh', callback_data: 'my_automations' },
                { text: '📊 Detailed Stats', callback_data: 'automation_stats' }
            ]
        ];

        await ctx.reply(responseText, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });

    } catch (error) {
        console.error('[AUTOMATIONS] Failed to get user automations:', error);
        await ctx.reply('❌ Failed to load your automations. Please try again.');
    }
}

// Admin Commands Implementation
async function handleAdminStatus(ctx) {
    const user = await getOrCreateEnhancedUser(ctx);
    if (!user.is_admin) {
        return ctx.reply('❌ Access denied. Admin privileges required.');
    }

    try {
        // Get system-wide statistics
        const response = await axios.get(`${CONFIG.KPRCLI_API_URL}/api/admin/system-status`);
        const systemStatus = response.data;

        const statusText = `👑 *Admin System Status*

🖥 **Infrastructure:**
• Total Users: ${systemStatus.totalUsers}
• Active Installations: ${systemStatus.activeInstallations}
• Running Jobs: ${systemStatus.runningJobs}
• System Health: ${systemStatus.systemHealth}

📊 **Performance:**
• Success Rate: ${systemStatus.overallSuccessRate}%
• Avg Response Time: ${systemStatus.avgResponseTime}ms
• Total Automations: ${systemStatus.totalAutomations}

🎯 **Recent Activity:**
• New Users (24h): ${systemStatus.newUsers24h}
• Jobs Completed (24h): ${systemStatus.jobsCompleted24h}
• Error Rate: ${systemStatus.errorRate}%

⚠️ **Alerts:**
${systemStatus.alerts.length > 0 ? 
    systemStatus.alerts.map(alert => `• ${alert}`).join('\n') : 
    '• No active alerts'}`;

        await ctx.reply(statusText, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🔄 Refresh', callback_data: 'admin_status' },
                        { text: '📊 Detailed Report', callback_data: 'admin_detailed_report' }
                    ],
                    [
                        { text: '📡 Monitor Users', callback_data: 'admin_monitor' },
                        { text: '📢 Send Broadcast', callback_data: 'admin_broadcast' }
                    ]
                ]
            }
        });

    } catch (error) {
        console.error('[ADMIN] Failed to get system status:', error);
        await ctx.reply('❌ Failed to retrieve system status.');
    }
}

async function handleAdminUpdate(ctx) {
    const user = await getOrCreateEnhancedUser(ctx);
    if (!user.is_admin) {
        return ctx.reply('❌ Access denied. Admin privileges required.');
    }

    ctx.session.formState = FormState.ADMIN_COMMAND;
    ctx.session.adminCommand = 'update';

    await ctx.reply(`👑 *Push System Update*

Available update types:

1️⃣ **Configuration Update** - Push new config settings
2️⃣ **Service Restart** - Restart services on user machines
3️⃣ **Emergency Stop** - Emergency shutdown of all services
4️⃣ **Feature Toggle** - Enable/disable features globally

Which type of update would you like to push?`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '⚙️ Config Update', callback_data: 'admin_update_config' },
                    { text: '🔄 Service Restart', callback_data: 'admin_update_restart' }
                ],
                [
                    { text: '🚨 Emergency Stop', callback_data: 'admin_update_emergency' },
                    { text: '🎛 Feature Toggle', callback_data: 'admin_update_feature' }
                ],
                [
                    { text: '❌ Cancel', callback_data: 'admin_cancel' }
                ]
            ]
        }
    });
}

// Callback handlers for admin actions
bot.action(/^admin_update_(.+)$/, async (ctx) => {
    const updateType = ctx.match[1];
    const user = await getOrCreateEnhancedUser(ctx);
    
    if (!user.is_admin) return;

    ctx.session.adminUpdateType = updateType;
    ctx.session.formState = FormState.ADMIN_CONFIRMATION;

    let confirmationText;
    let warningLevel = '⚠️';

    switch (updateType) {
        case 'config':
            confirmationText = `⚙️ **Configuration Update**\n\nThis will push new configuration settings to all user installations.\n\nProceed?`;
            break;
        case 'restart':
            confirmationText = `🔄 **Service Restart**\n\nThis will restart all KprCli services on user machines.\n\n⚠️ This may interrupt running automations.\n\nProceed?`;
            warningLevel = '🔶';
            break;
        case 'emergency':
            confirmationText = `🚨 **EMERGENCY STOP**\n\nThis will immediately shut down all KprCli services globally.\n\n‼️ This should only be used in critical situations.\n\nProceed?`;
            warningLevel = '🔴';
            break;
        case 'feature':
            confirmationText = `🎛 **Feature Toggle**\n\nThis will enable/disable features across all installations.\n\nProceed?`;
            break;
    }

    await ctx.editMessageText(`${warningLevel} **ADMIN ACTION CONFIRMATION**\n\n${confirmationText}`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Confirm', callback_data: 'admin_confirm_update' },
                    { text: '❌ Cancel', callback_data: 'admin_cancel' }
                ]
            ]
        }
    });
});

bot.action('admin_confirm_update', async (ctx) => {
    if (ctx.session.formState !== FormState.ADMIN_CONFIRMATION) return;

    const user = await getOrCreateEnhancedUser(ctx);
    if (!user.is_admin) return;

    const updateType = ctx.session.adminUpdateType;

    try {
        // Execute admin command via API
        const response = await axios.post(`${CONFIG.KPRCLI_API_URL}/api/admin/execute-command`, {
            command: `system_${updateType}`,
            adminId: user.id,
            adminUsername: user.telegram_username
        });

        const result = response.data;

        await ctx.editMessageText(`✅ **Command Executed Successfully**

Command: \`${updateType.toUpperCase()}\`
Affected Installations: ${result.affectedInstallations}
Success Rate: ${result.successRate}%
Execution Time: ${result.executionTime}ms

${result.details ? `**Details:**\n${result.details}` : ''}`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '📊 View Full Report', callback_data: 'admin_view_report' },
                    { text: '🏠 Admin Panel', callback_data: 'admin_panel' }
                ]]
            }
        });

        // Clear admin session
        ctx.session.formState = FormState.NONE;
        ctx.session.adminCommand = null;
        ctx.session.adminUpdateType = null;

    } catch (error) {
        console.error('[ADMIN] Command execution failed:', error);
        await ctx.editMessageText(`❌ **Command Failed**\n\nError: ${error.message}`);
    }
});

// Account linking for Clerk integration
bot.action('link_account', async (ctx) => {
    const user = await getOrCreateEnhancedUser(ctx);

    if (user.subscription_tier !== 'squad') {
        return ctx.reply('🔒 Account linking is only available for Squad tier subscribers.\n\nUpgrade to Squad to access full web integration!', {
            reply_markup: {
                inline_keyboard: [[
                    { text: '⬆️ Upgrade to Squad', callback_data: 'upgrade_squad' }
                ]]
            }
        });
    }

    if (user.clerk_user_id) {
        return ctx.reply('✅ Your Telegram account is already linked to your KprCli web account!');
    }

    try {
        // Generate linking token
        const response = await axios.post(`${CONFIG.KPRCLI_API_URL}/api/auth/generate-telegram-token`, {
            telegramId: user.telegram_id,
            telegramUsername: user.telegram_username
        });

        const { token, expiresIn } = response.data;

        await ctx.reply(`🔗 **Account Linking**

To link your Telegram account with your KprCli web account:

1️⃣ Go to your web dashboard: ${CONFIG.WEBHOOK_URL}
2️⃣ Navigate to Settings > Telegram Integration
3️⃣ Enter this linking code: \`${token}\`

⏱ Code expires in ${expiresIn}

Once linked, you'll have full access to all Squad tier features via Telegram!`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🌐 Open Dashboard', url: CONFIG.WEBHOOK_URL }],
                    [{ text: '🔄 Generate New Code', callback_data: 'link_account' }]
                ]
            }
        });

    } catch (error) {
        console.error('[LINK] Failed to generate linking token:', error);
        await ctx.reply('❌ Failed to generate linking code. Please try again.');
    }
});

// Error handling middleware
bot.catch((err, ctx) => {
    console.error('[BOT_ERROR]', err);
    ctx.reply('❌ An unexpected error occurred. Our team has been notified.');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[BOT] Received SIGTERM, shutting down gracefully');
    bot.stop('SIGTERM');
});

process.on('SIGINT', () => {
    console.log('[BOT] Received SIGINT, shutting down gracefully');
    bot.stop('SIGINT');
});

// Start the enhanced bot
if (process.env.NODE_ENV === 'production') {
    // Production: use webhooks
    bot.launch({
        webhook: {
            domain: CONFIG.WEBHOOK_URL,
            port: process.env.PORT || 3002
        }
    });
} else {
    // Development: use polling
    bot.launch();
}

console.log('[BOT] Enhanced KprCli Telegram bot started');
console.log('[CONFIG] AI Automation:', CONFIG.AI_AUTOMATION_ENABLED ? 'enabled' : 'disabled');
console.log('[CONFIG] Admin Control:', CONFIG.ADMIN_CONTROL_ENABLED ? 'enabled' : 'disabled');

module.exports = { bot, getOrCreateEnhancedUser };