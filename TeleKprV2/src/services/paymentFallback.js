const { createClient } = require('@supabase/supabase-js');
const { Telegram } = require('telegraf');
const axios = require('axios');

class PaymentFallbackService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );
        this.telegram = new Telegram(process.env.TELEGRAM_BOT_TOKEN);
        this.isRunning = false;
        this.checkInterval = 5 * 60 * 1000; // 5 minutes
        this.paymentTimeoutMinutes = 10; // Process payments older than 10 minutes
        this.oxaPayApiKey = process.env.OXAPAY_API_KEY;
    }

    async start() {
        if (this.isRunning) {
            console.log('⚠️ Payment fallback service already running');
            return;
        }

        this.isRunning = true;
        console.log('🛡️ Payment Fallback Service started - MONITORING ONLY MODE (automatic processing disabled)');
        
        // DISABLED: Run initial check
        // await this.checkStuckPayments();
        
        // DISABLED: Set up interval for automatic processing
        // this.intervalId = setInterval(async () => {
        //     await this.checkStuckPayments();
        // }, this.checkInterval);
        
        console.log('⚠️ AUTOMATIC PAYMENT PROCESSING DISABLED FOR SECURITY');
        console.log('📋 Use admin panel to manually review and process stuck payments');
    }

    async stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.isRunning = false;
        console.log('🛑 Payment Fallback Service stopped');
    }

    async checkStuckPayments() {
        try {
            const timeoutThreshold = new Date(Date.now() - this.paymentTimeoutMinutes * 60 * 1000).toISOString();
            
            // Get pending payments older than threshold
            const { data: stuckPayments, error } = await this.supabase
                .from('token_transactions')
                .select(`
                    *,
                    users!inner(telegram_id, telegram_username, token_balance)
                `)
                .eq('payment_status', 'pending')
                .eq('transaction_type', 'purchase')
                .lt('created_at', timeoutThreshold)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('❌ Error fetching stuck payments:', error);
                return;
            }

            if (!stuckPayments || stuckPayments.length === 0) {
                console.log('✅ No stuck payments found');
                return;
            }

            console.log(`🔍 Found ${stuckPayments.length} stuck payment(s), processing...`);

            for (const payment of stuckPayments) {
                await this.processStuckPayment(payment);
                // Add small delay between processing to avoid overwhelming systems
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

        } catch (error) {
            console.error('❌ Error in checkStuckPayments:', error);
        }
    }

    async processStuckPayment(payment) {
        try {
            console.log(`🔧 Processing stuck payment: ${payment.payment_id} for user ${payment.users.telegram_id}`);
            
            // Double-check this payment is still pending (avoid race conditions)
            const { data: currentPayment, error: checkError } = await this.supabase
                .from('token_transactions')
                .select('payment_status')
                .eq('id', payment.id)
                .single();

            if (checkError || !currentPayment) {
                console.log(`⚠️ Payment ${payment.payment_id} not found during recheck`);
                return;
            }

            if (currentPayment.payment_status !== 'pending') {
                console.log(`✅ Payment ${payment.payment_id} already processed (status: ${currentPayment.payment_status})`);
                return;
            }

            // SECURITY: Verify with OxaPay before processing
            const verificationResult = await this.verifyPaymentWithOxaPay(payment.payment_id);
            
            if (verificationResult.verified) {
                console.log(`✅ OxaPay confirms payment ${payment.payment_id} is paid`);
                await this.processVerifiedPayment(payment);
            } else {
                console.log(`❌ OxaPay verification failed for ${payment.payment_id}: ${verificationResult.reason}`);
                // Log for manual review
                await this.logPaymentForManualReview(payment, verificationResult.reason);
            }

        } catch (error) {
            console.error(`❌ Error processing stuck payment ${payment.payment_id}:`, error);
        }
    }

    async verifyPaymentWithOxaPay(paymentId) {
        try {
            if (!this.oxaPayApiKey) {
                return {
                    verified: false,
                    reason: 'OxaPay API key not configured'
                };
            }

            console.log(`🔍 Verifying payment ${paymentId} with OxaPay...`);
            
            const response = await axios.post('https://api.oxapay.com/merchants/inquiry', {
                trackId: paymentId
            }, {
                headers: {
                    'Authorization': `Bearer ${this.oxaPayApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            if (response.data.result === 100 && response.data.status === 'Paid') {
                return {
                    verified: true,
                    oxaPayData: response.data
                };
            } else if (response.data.result === 100) {
                return {
                    verified: false,
                    reason: `OxaPay status: ${response.data.status}`,
                    oxaPayData: response.data
                };
            } else {
                return {
                    verified: false,
                    reason: `OxaPay API error: ${response.data.message}`,
                    oxaPayData: response.data
                };
            }

        } catch (error) {
            console.error(`❌ OxaPay verification error for ${paymentId}:`, error.message);
            return {
                verified: false,
                reason: `API error: ${error.message}`
            };
        }
    }

    async processVerifiedPayment(payment) {
        try {
            // Update transaction status to completed
            const { error: updateError } = await this.supabase
                .from('token_transactions')
                .update({ 
                    payment_status: 'completed',
                    description: payment.description + ' (Verified & processed)'
                })
                .eq('id', payment.id);

            if (updateError) {
                throw updateError;
            }

            // Credit tokens to user
            const newBalance = payment.users.token_balance + payment.amount;
            const { error: balanceError } = await this.supabase
                .from('users')
                .update({ token_balance: newBalance })
                .eq('id', payment.user_id);

            if (balanceError) {
                throw balanceError;
            }

            console.log(`✅ Credited ${payment.amount} tokens to user ${payment.users.telegram_id} (Payment: ${payment.payment_id})`);

            // Send notification to user
            await this.sendVerifiedPaymentNotification(payment, newBalance);

            // Log successful processing
            console.log(`🎉 Successfully processed verified payment ${payment.payment_id}`);

        } catch (error) {
            console.error(`❌ Failed to process verified payment ${payment.payment_id}:`, error);
            throw error;
        }
    }

    async logPaymentForManualReview(payment, reason) {
        try {
            // Create a record for manual review
            const { error } = await this.supabase
                .from('payment_reviews')
                .insert({
                    payment_id: payment.payment_id,
                    user_id: payment.user_id,
                    amount: payment.amount,
                    transaction_id: payment.id,
                    reason: reason,
                    status: 'pending_review',
                    created_at: new Date().toISOString()
                });

            if (error && error.code !== '42P01') { // Ignore table doesn't exist error for now
                console.error('Error logging payment for review:', error);
            } else {
                console.log(`📋 Payment ${payment.payment_id} logged for manual review`);
            }
        } catch (error) {
            console.error('Error logging payment for review:', error);
        }
    }

    async sendVerifiedPaymentNotification(payment, newBalance) {
        try {
            const message = `🎉 **Payment Verified & Processed!**

💰 **${payment.amount} tokens** have been added to your account

📊 **New Balance:** ${newBalance} tokens

💳 **Payment ID:** ${payment.payment_id}

✅ Your payment has been verified with OxaPay and processed securely.

---
🤖 TeleKpr CRM System`;

            await this.telegram.sendMessage(payment.users.telegram_id, message, {
                parse_mode: 'Markdown'
            });

            console.log(`📲 Verified payment notification sent to user ${payment.users.telegram_id}`);

        } catch (notifyError) {
            console.error('❌ Failed to send verified payment notification:', notifyError);
            // Don't throw - notification failure shouldn't stop payment processing
        }
    }

    async getStatus() {
        const timeoutThreshold = new Date(Date.now() - this.paymentTimeoutMinutes * 60 * 1000).toISOString();
        
        const { data: stuckPayments } = await this.supabase
            .from('token_transactions')
            .select('id')
            .eq('payment_status', 'pending')
            .eq('transaction_type', 'purchase')
            .lt('created_at', timeoutThreshold);

        return {
            isRunning: this.isRunning,
            checkInterval: this.checkInterval,
            paymentTimeoutMinutes: this.paymentTimeoutMinutes,
            currentStuckPayments: stuckPayments ? stuckPayments.length : 0,
            securityMode: 'VERIFICATION_REQUIRED',
            automaticProcessing: false
        };
    }

    async getStuckPaymentsForReview() {
        const timeoutThreshold = new Date(Date.now() - this.paymentTimeoutMinutes * 60 * 1000).toISOString();
        
        const { data: stuckPayments, error } = await this.supabase
            .from('token_transactions')
            .select(`
                *,
                users!inner(telegram_id, telegram_username, full_name)
            `)
            .eq('payment_status', 'pending')
            .eq('transaction_type', 'purchase')
            .lt('created_at', timeoutThreshold)
            .order('created_at', { ascending: true });

        if (error) {
            throw error;
        }

        // Add verification status for each payment
        const paymentsWithVerification = await Promise.all(
            stuckPayments.map(async (payment) => {
                const verification = await this.verifyPaymentWithOxaPay(payment.payment_id);
                return {
                    ...payment,
                    verification_status: verification.verified ? 'verified' : 'unverified',
                    verification_reason: verification.reason || null,
                    age_minutes: Math.round((new Date() - new Date(payment.created_at)) / (1000 * 60))
                };
            })
        );

        return paymentsWithVerification;
    }

    async manuallyApprovePayment(paymentId, adminNote = '') {
        try {
            // Get the payment details
            const { data: payment, error: fetchError } = await this.supabase
                .from('token_transactions')
                .select(`
                    *,
                    users!inner(telegram_id, telegram_username, token_balance)
                `)
                .eq('payment_id', paymentId)
                .eq('payment_status', 'pending')
                .single();

            if (fetchError || !payment) {
                throw new Error(`Payment ${paymentId} not found or already processed`);
            }

            // Verify with OxaPay first
            const verification = await this.verifyPaymentWithOxaPay(paymentId);
            
            if (!verification.verified) {
                throw new Error(`OxaPay verification failed: ${verification.reason}`);
            }

            // Process the verified payment
            await this.processVerifiedPayment(payment);

            // Log the manual approval
            console.log(`✅ Payment ${paymentId} manually approved and processed`);
            console.log(`📝 Admin note: ${adminNote}`);

            return {
                success: true,
                message: `Payment ${paymentId} successfully processed after manual approval`
            };

        } catch (error) {
            console.error(`❌ Manual approval failed for ${paymentId}:`, error);
            throw error;
        }
    }
}

module.exports = PaymentFallbackService;