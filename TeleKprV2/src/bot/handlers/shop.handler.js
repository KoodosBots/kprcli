const { Markup } = require('telegraf');
const { db } = require('../../services/database');

// Customer registration state management
const customerRegistrationStates = new Map();

// Order password setting state management  
const orderPasswordStates = new Map();

async function handleShop(ctx) {
    try {
        const user = ctx.from;
        
        // Get user's UUID from Telegram ID
        const userRecord = await db.getUserByTelegramId(user.id);
        if (!userRecord) {
            await ctx.reply('❌ User not found. Please start the bot first with /start');
            return;
        }
        
        // Get user's customer profiles using UUID
        const customers = await db.getCustomerProfiles(userRecord.id);
        
        let message = `🛍️ **Shop Products**\n\n`;
        
        if (customers.length === 0) {
            message += `👋 Welcome! To place orders, we need to create a customer profile first.\n\n`;
            message += `📝 This will collect your shipping information for order fulfillment.`;
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('➕ Create Customer Profile', 'create_customer')],
                [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
            ]);
            
            await ctx.editMessageText(message, keyboard);
        } else {
            message += `👥 Your Customer Profiles:\n\n`;
            
            const buttons = [];
            customers.forEach((customer, index) => {
                message += `${index + 1}. **${customer.full_name}**\n`;
                message += `   📞 ${customer.phone_number || 'N/A'}\n`;
                message += `   📍 ${customer.city || 'N/A'}, ${customer.state || 'N/A'}\n\n`;
                
                buttons.push([Markup.button.callback(`🛒 Shop as ${customer.full_name}`, `shop_as:${customer.id}`)]);
            });
            
            buttons.push([Markup.button.callback('➕ Add New Profile', 'create_customer')]);
            buttons.push([Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]);
            
            const keyboard = Markup.inlineKeyboard(buttons);
            await ctx.editMessageText(message, keyboard);
        }
    } catch (error) {
        console.error('Shop error:', error);
        await ctx.reply('❌ Error loading shop. Please try again.');
    }
}

async function handleCreateCustomer(ctx) {
    try {
        const telegramId = ctx.from.id;
        
        // Get user's UUID from Telegram ID
        const userRecord = await db.getUserByTelegramId(telegramId);
        if (!userRecord) {
            await ctx.reply('❌ User not found. Please start the bot first with /start');
            return;
        }
        
        // Initialize registration state with both IDs for reference
        customerRegistrationStates.set(telegramId, {
            step: 'full_name',
            data: {},
            userUuid: userRecord.id // Store the UUID for database operations
        });
        
        const message = `📝 **Create Customer Profile**\n\n` +
            `Let's collect your shipping information for order fulfillment. This is a secure 9-step process.\n\n` +
            `**Step 1 of 8: Full Name** 👤\n` +
            `Please enter your full name (first and last name):\n\n` +
            `💡 *Example: John Smith*`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancel', 'cancel_registration')]
        ]);
        
        await ctx.editMessageText(message, keyboard);
    } catch (error) {
        console.error('Create customer error:', error);
        await ctx.reply('❌ Error starting registration. Please try again.');
    }
}

async function handleShopAs(ctx) {
    try {
        const customerId = ctx.match[1];
        const customer = await db.getCustomerProfile(customerId);
        
        if (!customer) {
            await ctx.answerCbQuery('❌ Customer profile not found');
            return;
        }
        
        // Get available products/packages (using database-compatible types)
        const packages = [
            { type: '250', name: '250 Sites Registration Package', price: 250, description: 'Complete registration service for 250 websites' }
        ];
        
        let message = `🛒 **Shopping as:** ${customer.full_name}\n\n`;
        message += `📦 **Available Packages:**\n\n`;
        
        const buttons = [];
        packages.forEach((pkg, index) => {
            message += `${index + 1}. **${pkg.name}**\n`;
            message += `   📝 ${pkg.description}\n`;
            message += `   💰 **${pkg.price} tokens**\n\n`;
            
            buttons.push([Markup.button.callback(`🛒 Order for ${pkg.price} tokens`, `order:${customerId}:${pkg.type}`)]);
        });
        
        buttons.push([Markup.button.callback('🔙 Back to Profiles', 'shop')]);
        
        const keyboard = Markup.inlineKeyboard(buttons);
        await ctx.editMessageText(message, keyboard);
        
    } catch (error) {
        console.error('Shop as error:', error);
        await ctx.reply('❌ Error loading products. Please try again.');
    }
}

async function handleOrder(ctx) {
    try {
        const [customerId, packageType] = ctx.match.slice(1);
        const telegramId = ctx.from.id;
        
        // Get user token balance and UUID
        const user = await db.getUserByTelegramId(telegramId);
        const customer = await db.getCustomerProfile(customerId);
        
        // Determine token cost and validate requirements
        let tokenCost;
        let productName;
        
        if (packageType === 'email_confirmation') {
            // Get email confirmation price from settings
            tokenCost = 350; // default
            try {
                const priceFromDb = await db.getSettings('email_confirmation_price');
                if (priceFromDb) {
                    tokenCost = parseInt(priceFromDb);
                }
            } catch (error) {
                console.log('Using default email confirmation price:', tokenCost);
            }
            productName = 'Email Confirmation Service';
        } else {
            tokenCost = parseInt(packageType);
            productName = `${packageType} Sites Registration`;
        }
        
        // Check token balance
        if (!user || user.token_balance < tokenCost) {
            await ctx.editMessageText(
                `❌ **Insufficient Tokens**\n\n` +
                `You need ${tokenCost} tokens but only have ${user?.token_balance || 0}.\n\n` +
                `💡 You can purchase more tokens to continue!`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('💳 Buy Tokens', 'buy_tokens')],
                    [Markup.button.callback('🔙 Back', `shop_as:${customerId}`)]
                ])
            );
            return;
        }
        
        // Show order confirmation dialog
        await showOrderConfirmation(ctx, user, customer, packageType, productName, tokenCost);
        
    } catch (error) {
        console.error('Order error:', error);
        await ctx.reply('❌ Error processing order. Please try again.');
    }
}

// Show order confirmation with email service add-on option
async function showOrderConfirmation(ctx, user, customer, packageType, productName, tokenCost) {
    try {
        // Get email confirmation price
        let emailConfirmationPrice = 350;
        try {
            const priceFromDb = await db.getSettings('email_confirmation_price');
            if (priceFromDb) {
                emailConfirmationPrice = parseInt(priceFromDb);
            }
        } catch (error) {
            console.log('Using default email confirmation price:', emailConfirmationPrice);
        }

        // Check if already ordering email confirmation service
        const isEmailOrder = packageType === 'email_confirmation';
        
        let message = `🛒 **Order Confirmation**\n\n`;
        message += `👤 **Customer:** ${customer.full_name}\n`;
        message += `📧 **Email:** ${customer.email || 'N/A'}\n`;
        message += `📞 **Phone:** ${customer.phone_number || 'N/A'}\n`;
        message += `📍 **Address:** ${customer.street_address || 'N/A'}, ${customer.city || 'N/A'}\n\n`;
        message += `🛍️ **Product:** ${productName}\n`;
        message += `💰 **Cost:** ${tokenCost} tokens\n\n`;
        
        const buttons = [];
        
        if (!isEmailOrder) {
            // Show email confirmation add-on option for non-email orders
            message += `➕ **Optional Add-on:**\n`;
            message += `📧 Email Confirmation Service (+${emailConfirmationPrice} tokens)\n\n`;
            
            // Check if customer has password for email service
            if (customer.password_encrypted) {
                message += `🔐 Password: Available for email service\n\n`;
                buttons.push([Markup.button.callback(`✅ Confirm Order (${tokenCost} tokens)`, `confirm_order:${customer.id}:${packageType}:false`)]);
                buttons.push([Markup.button.callback(`📧 Add Email Service (+${emailConfirmationPrice})`, `confirm_order:${customer.id}:${packageType}:true`)]);
            } else {
                message += `⚠️ Email service requires a password\n\n`;
                buttons.push([Markup.button.callback(`✅ Confirm Order (${tokenCost} tokens)`, `confirm_order:${customer.id}:${packageType}:false`)]);
                buttons.push([Markup.button.callback(`📧 Add Email Service (Set Password)`, `add_email_with_password:${customer.id}:${packageType}`)]);
            }
        } else {
            // For email service orders, just confirm
            if (!customer.password_encrypted) {
                message += `⚠️ **Password Required**\n`;
                message += `This service requires a password for your account.\n\n`;
                buttons.push([Markup.button.callback(`🔐 Set Password & Confirm`, `set_password_confirm:${customer.id}:${packageType}`)]);
            } else {
                message += `🔐 Password: Available ✅\n\n`;
                buttons.push([Markup.button.callback(`✅ Confirm Order (${tokenCost} tokens)`, `confirm_order:${customer.id}:${packageType}:false`)]);
            }
        }
        
        buttons.push([Markup.button.callback('❌ Cancel', `shop_as:${customer.id}`)]);
        
        const keyboard = Markup.inlineKeyboard(buttons);
        await ctx.editMessageText(message, keyboard);
        
    } catch (error) {
        console.error('Show order confirmation error:', error);
        await ctx.reply('❌ Error showing order confirmation. Please try again.');
    }
}

// Handle text input for customer registration
async function handleTextInput(ctx) {
    const userId = ctx.from.id;
    const state = customerRegistrationStates.get(userId);
    const orderState = orderPasswordStates.get(userId);
    
    // Handle order password input first
    if (orderState) {
        return await handleOrderPasswordInput(ctx);
    }
    
    if (!state) return; // Not in registration flow
    
    const input = ctx.message.text?.trim();
    
    // Validate input exists
    if (!input) {
        await ctx.reply('❌ Please enter a valid response. Type /start to restart if needed.');
        return;
    }
    
    try {
        switch (state.step) {
            case 'full_name':
                if (!input || input.length < 2) {
                    await ctx.reply('❌ Please enter a valid full name (at least 2 characters).');
                    return;
                }
                state.data.full_name = input;
                state.step = 'phone_number';
                
                await ctx.reply(
                    `✅ Name: ${input}\n\n` +
                    `**Step 2 of 8: Phone Number** 📞\n` +
                    `Please enter your phone number (with country code if international):\n\n` +
                    `💡 *Examples: +1-555-123-4567 or 555-123-4567*`,
                    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'cancel_registration')]])
                );
                break;
                
            case 'phone_number':
                if (!input || input.length < 10) {
                    await ctx.reply('❌ Please enter a valid phone number (at least 10 digits).');
                    return;
                }
                state.data.phone_number = input;
                state.step = 'email';
                
                await ctx.reply(
                    `✅ Phone: ${input}\n\n` +
                    `**Step 3 of 8: Email Address** 📧\n` +
                    `Please enter your email address:\n\n` +
                    `💡 *Example: john.smith@email.com*`,
                    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'cancel_registration')]])
                );
                break;
                
            case 'email':
                if (!input.includes('@') || !input.includes('.')) {
                    await ctx.reply('❌ Please enter a valid email address.');
                    return;
                }
                state.data.email = input;
                state.step = 'street_address';
                
                await ctx.reply(
                    `✅ Email: ${input}\n\n` +
                    `**Step 4 of 8: Street Address** 🏠\n` +
                    `Please enter your street address (house number and street name):\n\n` +
                    `💡 *Example: 123 Main Street*`,
                    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'cancel_registration')]])
                );
                break;
                
            case 'street_address':
                if (!input || input.length < 5) {
                    await ctx.reply('❌ Please enter a valid street address (at least 5 characters).');
                    return;
                }
                state.data.street_address = input;
                state.step = 'apt_suite';
                
                await ctx.reply(
                    `✅ Address: ${input}\n\n` +
                    `**Step 5 of 8: Apartment/Suite** 🏢\n` +
                    `Please enter your apartment or suite number (if any):\n\n` +
                    `💡 *Examples: Apt 4B, Suite 101, or type "none" if you don't have one*`,
                    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'cancel_registration')]])
                );
                break;
                
            case 'apt_suite':
                state.data.apt_suite = ['none', 'n/a', 'na', ''].includes(input.toLowerCase()) ? null : input;
                state.step = 'city';
                
                await ctx.reply(
                    `✅ Apt/Suite: ${state.data.apt_suite || 'None'}\n\n` +
                    `**Step 6 of 8: City** 🏙️\n` +
                    `Please enter your city name:\n\n` +
                    `💡 *Example: New York*`,
                    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'cancel_registration')]])
                );
                break;
                
            case 'city':
                if (!input || input.length < 2) {
                    await ctx.reply('❌ Please enter a valid city name.');
                    return;
                }
                state.data.city = input;
                state.step = 'state';
                
                await ctx.reply(
                    `✅ City: ${input}\n\n` +
                    `**Step 7 of 8: State/Province** 🗺️\n` +
                    `Please enter your state or province:\n\n` +
                    `💡 *Examples: California, CA, Ontario, etc.*`,
                    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'cancel_registration')]])
                );
                break;
                
            case 'state':
                if (!input || input.length < 2) {
                    await ctx.reply('❌ Please enter a valid state/province.');
                    return;
                }
                state.data.state = input;
                state.step = 'postal_code';
                
                await ctx.reply(
                    `✅ State: ${input}\n\n` +
                    `**Step 8 of 9: Postal/ZIP Code** 📮\n` +
                    `Please enter your postal or ZIP code:\n\n` +
                    `💡 *Examples: 12345, 90210, K1A 0A6*`,
                    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'cancel_registration')]])
                );
                break;
                
            case 'postal_code':
                if (!input || input.length < 3) {
                    await ctx.reply('❌ Please enter a valid postal/ZIP code.');
                    return;
                }
                state.data.postal_code = input;
                state.data.country = 'USA'; // Default country
                state.step = 'password';
                
                await ctx.reply(
                    `✅ Postal Code: ${input}\n\n` +
                    `**Step 9 of 9: Password (Optional)** 🔐\n` +
                    `Would you like to add a password for email confirmation services?\n\n` +
                    `💡 *This is optional and only needed if you plan to order email confirmation services*\n` +
                    `🔧 *You can create a simple temporary password if you want access to email services*`,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('🔐 Add Password', 'add_password')],
                        [Markup.button.callback('⏭️ Skip Password', 'skip_password')],
                        [Markup.button.callback('❌ Cancel', 'cancel_registration')]
                    ])
                );
                break;
                
            case 'password':
                if (!input || input.length < 6) {
                    await ctx.reply('❌ Please enter a password with at least 6 characters.');
                    return;
                }
                // Store password in plain text for admin viewing
                state.data.password_encrypted = input;
                
                // Continue to profile creation
                await completeCustomerRegistration(ctx, state, userId);
                return;
        }
        
        customerRegistrationStates.set(userId, state);
        
    } catch (error) {
        console.error('Registration input error:', error);
        customerRegistrationStates.delete(userId);
        await ctx.reply('❌ Registration failed. Please try again from the beginning.');
    }
}

async function handleCancelRegistration(ctx) {
    const userId = ctx.from.id;
    customerRegistrationStates.delete(userId);
    
    await ctx.editMessageText(
        '❌ Registration cancelled.\n\nYou can start again anytime from the shop menu.',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]])
    );
}

async function handleMyOrders(ctx) {
    try {
        const userId = ctx.from.id;
        const orders = await db.getUserOrders(userId, 10);
        
        if (orders.length === 0) {
            const message = `📦 **My Orders**\n\n` +
                `You haven't placed any orders yet.\n\n` +
                `🛍️ Ready to get started?`;
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🛍️ Shop Products', 'shop')],
                [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
            ]);
            
            await ctx.editMessageText(message, keyboard);
            return;
        }
        
        let message = `📦 **My Orders** (Last ${orders.length})\n\n`;
        
        const buttons = [];
        orders.forEach((order, index) => {
            const statusEmoji = {
                'pending': '⏳',
                'processing': '🔄', 
                'completed': '✅',
                'cancelled': '❌'
            }[order.status] || '📦';
            
            message += `${index + 1}. **Order #${order.id.slice(0, 8)}**\n`;
            message += `   ${statusEmoji} ${order.status.toUpperCase()}\n`;
            message += `   🛍️ ${order.product_name}\n`;
            message += `   👤 ${order.customer_profiles?.full_name || 'Unknown'}\n`;
            message += `   📅 ${new Date(order.created_at).toLocaleDateString()}\n\n`;
            
            buttons.push([Markup.button.callback(`📋 View #${order.id.slice(0, 8)}`, `view_order:${order.id}`)]);
        });
        
        buttons.push([Markup.button.callback('🛍️ Shop More', 'shop')]);
        buttons.push([Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]);
        
        const keyboard = Markup.inlineKeyboard(buttons);
        await ctx.editMessageText(message, keyboard);
        
    } catch (error) {
        console.error('My orders error:', error);
        await ctx.reply('❌ Error loading orders. Please try again.');
    }
}

async function handleViewOrder(ctx) {
    try {
        const orderId = ctx.match[1];
        const order = await db.getOrderById(orderId);
        
        if (!order) {
            await ctx.answerCbQuery('❌ Order not found');
            return;
        }
        
        const statusEmoji = {
            'pending': '⏳',
            'processing': '🔄',
            'completed': '✅', 
            'cancelled': '❌'
        }[order.status] || '📦';
        
        const message = `📋 **Order Details**\n\n` +
            `🆔 **Order ID:** #${order.id.slice(0, 8)}\n` +
            `${statusEmoji} **Status:** ${order.status.toUpperCase()}\n` +
            `🛍️ **Product:** ${order.product_name}\n` +
            `💰 **Cost:** ${order.token_cost} tokens\n` +
            `🔢 **Queue Position:** ${order.queue_position || 'N/A'}\n` +
            `📅 **Created:** ${new Date(order.created_at).toLocaleDateString()}\n\n` +
            `👤 **Customer Information:**\n` +
            `   **Name:** ${order.customer_profiles?.full_name || 'N/A'}\n` +
            `   **Phone:** ${order.customer_profiles?.phone_number || 'N/A'}\n` +
            `   **Email:** ${order.customer_profiles?.email || 'N/A'}\n` +
            `   **Address:** ${order.customer_profiles?.street_address || 'N/A'}\n` +
            `   **City:** ${order.customer_profiles?.city || 'N/A'}, ${order.customer_profiles?.state || 'N/A'}\n\n` +
            `${order.notes ? `📝 **Notes:** ${order.notes}\n\n` : ''}` +
            `${order.completed_at ? `✅ **Completed:** ${new Date(order.completed_at).toLocaleDateString()}\n` : ''}`;
        
        const buttons = [];
        
        // Only show rerun option for completed orders
        if (order.status === 'completed') {
            buttons.push([Markup.button.callback('🔄 Rerun Order', `rerun_order:${order.id}`)]);
        }
        
        buttons.push([Markup.button.callback('📦 All Orders', 'my_orders')]);
        buttons.push([Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]);
        
        const keyboard = Markup.inlineKeyboard(buttons);
        await ctx.editMessageText(message, keyboard);
        
    } catch (error) {
        console.error('View order error:', error);
        await ctx.reply('❌ Error loading order details. Please try again.');
    }
}

async function handleTokenHistory(ctx) {
    try {
        const userId = ctx.from.id;
        const user = await db.getUserByTelegramId(userId);
        
        const message = `💰 **Token History**\n\n` +
            `**Current Balance:** ${user?.token_balance || 0} tokens\n\n` +
            `📊 **Transaction History:**\n` +
            `This feature is coming soon! You'll be able to view:\n\n` +
            `• Token purchases\n` +
            `• Order spending\n` +
            `• Admin adjustments\n` +
            `• Refunds\n\n` +
            `💡 For now, check your current balance in "My Account"`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📋 My Account', 'account')],
            [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
        ]);
        
        await ctx.editMessageText(message, keyboard);
        
    } catch (error) {
        console.error('Token history error:', error);
        await ctx.reply('❌ Error loading token history. Please try again.');
    }
}

async function handleHelp(ctx) {
    try {
        const message = `ℹ️ **Help & Support**\n\n` +
            `🤖 **TeleKpr Bot Guide:**\n\n` +
            `📋 **My Account** - View your profile, tokens, and subscription\n` +
            `🛍️ **Shop Products** - Create customer profiles and place orders\n` +
            `🎫 **Subscriptions** - Manage your subscription plans\n` +
            `📦 **My Orders** - View your order history and status\n\n` +
            `💡 **How to Order:**\n` +
            `1. Go to "Shop Products"\n` +
            `2. Create a customer profile (with shipping info)\n` +
            `3. Select the customer and choose a package\n` +
            `4. Confirm your order\n\n` +
            `💰 **Simple Token System!**\n` +
            `Use tokens to purchase our services - no complicated pricing tiers.\n\n` +
            `❓ **Need Help?**\n` +
            `Contact our support team for assistance.`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🛍️ Start Shopping', 'shop')],
            [Markup.button.callback('🎫 View Subscriptions', 'subscription')],
            [Markup.button.callback('🔙 Back to Menu', 'back_to_menu')]
        ]);
        
        await ctx.editMessageText(message, keyboard);
        
    } catch (error) {
        console.error('Help error:', error);
        await ctx.reply('❌ Error loading help. Please try again.');
    }
}

// Helper function to complete customer registration
async function completeCustomerRegistration(ctx, state, userId) {
    try {
        // Create customer profile using the stored UUID
        const customer = await db.createCustomerProfile(state.userUuid, state.data);
        
        // Clear registration state
        customerRegistrationStates.delete(userId);
        
        const passwordInfo = state.data.password_encrypted ? `🔐 **Password:** Set (for email services)\n` : '';
        
        const summary = `✅ **Customer Profile Created Successfully!**\n\n` +
            `👤 **Name:** ${state.data.full_name}\n` +
            `📞 **Phone:** ${state.data.phone_number}\n` +
            `📧 **Email:** ${state.data.email}\n` +
            `📍 **Address:** ${state.data.street_address}\n` +
            `🏠 **Apt/Suite:** ${state.data.apt_suite || 'None'}\n` +
            `🏙️ **City:** ${state.data.city}\n` +
            `🗺️ **State:** ${state.data.state}\n` +
            `📮 **Postal:** ${state.data.postal_code}\n` +
            `🌍 **Country:** ${state.data.country}\n` +
            passwordInfo + `\n` +
            `🎉 Profile ID: ${customer.id.slice(0, 8)}...\n\n` +
            `🛍️ You can now start shopping!`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🛒 Start Shopping', `shop_as:${customer.id}`)],
            [Markup.button.callback('🛍️ Browse Shop', 'shop')],
            [Markup.button.callback('🔙 Main Menu', 'back_to_menu')]
        ]);
        
        await ctx.reply(summary, keyboard);
        
    } catch (dbError) {
        console.error('Database error creating customer profile:', dbError);
        customerRegistrationStates.delete(userId);
        await ctx.reply(
            '❌ **Registration Failed**\n\n' +
            'There was an error saving your profile to the database. This is usually a temporary issue.\n\n' +
            '💡 **Please try again** or contact support if the problem persists.',
            Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Try Again', 'create_customer')],
                [Markup.button.callback('🔙 Main Menu', 'back_to_menu')]
            ])
        );
    }
}

// Handle password buttons
async function handleAddPassword(ctx) {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const state = customerRegistrationStates.get(userId);
    
    if (!state) {
        await ctx.reply('❌ Registration session expired. Please start again.');
        return;
    }
    
    state.step = 'password';
    customerRegistrationStates.set(userId, state);
    
    await ctx.editMessageText(
        `🔐 **Step 9 of 9: Create Password**\n\n` +
        `Please enter a password (minimum 6 characters):\n\n` +
        `💡 *This password will be used for email confirmation services*\n\n` +
        `🔧 **Quick Option:** You can create a temporary password for now and update it later if needed.`,
        Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'cancel_registration')]])
    );
}

async function handleSkipPassword(ctx) {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const state = customerRegistrationStates.get(userId);
    
    if (!state) {
        await ctx.reply('❌ Registration session expired. Please start again.');
        return;
    }
    
    // Skip password and complete registration
    await completeCustomerRegistration(ctx, state, userId);
}

// Handle order confirmation
async function handleConfirmOrder(ctx) {
    try {
        const [customerId, packageType, includeEmail] = ctx.match.slice(1);
        const telegramId = ctx.from.id;
        const includeEmailService = includeEmail === 'true';
        
        // Get user and customer data
        const user = await db.getUserByTelegramId(telegramId);
        const customer = await db.getCustomerProfile(customerId);
        
        // Calculate costs
        let baseTokenCost = packageType === 'email_confirmation' ? 350 : parseInt(packageType);
        let emailServiceCost = 0;
        let totalCost = baseTokenCost;
        
        // Get base product details
        let baseProductName = packageType === 'email_confirmation' ? 'Email Confirmation Service' : `${packageType} Sites Registration`;
        
        if (includeEmailService && packageType !== 'email_confirmation') {
            // Get email confirmation price
            try {
                const priceFromDb = await db.getSettings('email_confirmation_price');
                emailServiceCost = priceFromDb ? parseInt(priceFromDb) : 350;
            } catch (error) {
                emailServiceCost = 350;
            }
            totalCost += emailServiceCost;
        }
        
        // Check token balance for total cost
        if (!user || user.token_balance < totalCost) {
            await ctx.editMessageText(
                `❌ **Insufficient Tokens**\n\n` +
                `You need ${totalCost} tokens but only have ${user?.token_balance || 0}.\n\n` +
                `💡 You can purchase more tokens to continue!`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('💳 Buy Tokens', 'buy_tokens')],
                    [Markup.button.callback('🔙 Back', `shop_as:${customerId}`)]
                ])
            );
            return;
        }
        
        // Create base order
        const baseOrder = await db.createOrder(
            user.id,
            customerId,
            packageType,
            baseProductName,
            baseTokenCost
        );
        
        let orderSummary = `✅ **Order Placed Successfully!**\n\n` +
            `📦 **Order ID:** #${baseOrder.id.slice(0, 8)}\n` +
            `👤 **Customer:** ${customer.full_name}\n` +
            `🛍️ **Product:** ${baseProductName}\n` +
            `💰 **Cost:** ${baseTokenCost} tokens\n`;
        
        // Create email service order if requested
        if (includeEmailService) {
            const emailOrder = await db.createOrder(
                user.id,
                customerId,
                'email_confirmation',
                'Email Confirmation Service',
                emailServiceCost
            );
            
            orderSummary += `\n📧 **Add-on Order ID:** #${emailOrder.id.slice(0, 8)}\n` +
                `🛍️ **Add-on:** Email Confirmation Service\n` +
                `💰 **Add-on Cost:** ${emailServiceCost} tokens\n\n` +
                `💸 **Total Cost:** ${totalCost} tokens\n`;
        } else {
            orderSummary += `\n📈 **Status:** ${baseOrder.status}\n` +
                `🔢 **Queue Position:** ${baseOrder.queue_position}\n`;
        }
        
        orderSummary += `\n📧 You will receive updates on your order status via Telegram notifications.`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📋 My Orders', 'my_orders')],
            [Markup.button.callback('🛍️ Shop More', 'shop')],
            [Markup.button.callback('🔙 Main Menu', 'back_to_menu')]
        ]);
        
        await ctx.editMessageText(orderSummary, keyboard);
        
    } catch (error) {
        console.error('Confirm order error:', error);
        await ctx.reply('❌ Error confirming order. Please try again.');
    }
}

// Handle adding email service with password setup
async function handleAddEmailWithPassword(ctx) {
    try {
        const [customerId, packageType] = ctx.match.slice(1);
        const telegramId = ctx.from.id;
        
        // Store order details for after password is set
        orderPasswordStates.set(telegramId, {
            customerId,
            packageType,
            step: 'password'
        });
        
        const message = `🔐 **Set Password for Email Service**\n\n` +
            `To add Email Confirmation Service, please enter a temporary password:\n\n` +
            `💡 *Minimum 6 characters*\n` +
            `🔧 *You can update this password later if needed*`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancel', `shop_as:${customerId}`)]
        ]);
        
        await ctx.editMessageText(message, keyboard);
        
    } catch (error) {
        console.error('Add email with password error:', error);
        await ctx.reply('❌ Error setting up email service. Please try again.');
    }
}

// Handle setting password and confirming email order
async function handleSetPasswordConfirm(ctx) {
    try {
        const [customerId, packageType] = ctx.match.slice(1);
        const telegramId = ctx.from.id;
        
        // Store order details for after password is set
        orderPasswordStates.set(telegramId, {
            customerId,
            packageType,
            step: 'password_for_email_order'
        });
        
        const message = `🔐 **Password Required**\n\n` +
            `Email Confirmation Service requires a password. Please enter a temporary password:\n\n` +
            `💡 *Minimum 6 characters*\n` +
            `🔧 *You can update this password later if needed*`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancel', `shop_as:${customerId}`)]
        ]);
        
        await ctx.editMessageText(message, keyboard);
        
    } catch (error) {
        console.error('Set password confirm error:', error);
        await ctx.reply('❌ Error setting up password. Please try again.');
    }
}

// Handle text input for order password setting
async function handleOrderPasswordInput(ctx) {
    const userId = ctx.from.id;
    const state = orderPasswordStates.get(userId);
    
    if (!state) return; // Not in password setting flow
    
    const input = ctx.message.text?.trim();
    
    // Validate password
    if (!input || input.length < 6) {
        await ctx.reply('❌ Please enter a password with at least 6 characters.');
        return;
    }
    
    try {
        // Update customer profile with password
        await db.updateCustomerProfile(state.customerId, {
            password_encrypted: input
        });
        
        // Clear password state
        orderPasswordStates.delete(userId);
        
        // Get updated customer data
        const customer = await db.getCustomerProfile(state.customerId);
        const user = await db.getUserByTelegramId(userId);
        
        if (state.step === 'password_for_email_order') {
            // Direct email service order
            await showOrderConfirmation(ctx, user, customer, state.packageType, 'Email Confirmation Service', 350);
        } else {
            // Email service as add-on - show confirmation with email option
            const productName = `${state.packageType} Sites Registration`;
            const tokenCost = parseInt(state.packageType);
            await showOrderConfirmation(ctx, user, customer, state.packageType, productName, tokenCost);
        }
        
    } catch (error) {
        console.error('Order password input error:', error);
        orderPasswordStates.delete(userId);
        await ctx.reply('❌ Error setting password. Please try again.');
    }
}

module.exports = {
    handleShop,
    handleCreateCustomer,
    handleShopAs,
    handleOrder,
    handleTextInput,
    handleCancelRegistration,
    handleMyOrders,
    handleViewOrder,
    handleTokenHistory,
    handleHelp,
    handleAddPassword,
    handleSkipPassword,
    handleConfirmOrder,
    handleAddEmailWithPassword,
    handleSetPasswordConfirm,
    handleOrderPasswordInput
};