/**
 * Telegram Notification Service
 * Sends notifications to users about device authorizations and automation jobs
 */

import { KprCliUser } from './auth-bridge-supabase';

export interface DeviceAuthNotification {
  type: 'device_authorized' | 'device_auth_request';
  userCode: string;
  deviceInfo?: string;
  authorizedAt?: Date;
}

export interface AutomationJobNotification {
  type: 'job_started' | 'job_completed' | 'job_failed';
  jobId: string;
  jobType: string;
  status: string;
  message?: string;
}

export class TelegramNotifications {
  private static readonly BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  
  /**
   * Send device authorization notification
   */
  static async sendDeviceAuthNotification(
    user: KprCliUser,
    notification: DeviceAuthNotification
  ): Promise<boolean> {
    if (!user.telegram_id) {
      console.log('[TELEGRAM] User has no Telegram ID, skipping notification');
      return false;
    }

    let message = '';
    
    switch (notification.type) {
      case 'device_auth_request':
        message = `🔐 Device Authorization Request\n\n` +
          `A new device is requesting access to your KprCli account.\n\n` +
          `User Code: \`${notification.userCode}\`\n` +
          `Device: ${notification.deviceInfo || 'Unknown'}\n\n` +
          `To authorize this device, visit: https://your-domain.com/device?user_code=${notification.userCode}\n\n` +
          `If this wasn't you, please ignore this message.`;
        break;
        
      case 'device_authorized':
        message = `✅ Device Authorized Successfully\n\n` +
          `Your device with code \`${notification.userCode}\` has been authorized!\n\n` +
          `Device: ${notification.deviceInfo || 'Unknown'}\n` +
          `Authorized at: ${notification.authorizedAt?.toLocaleString() || 'Just now'}\n\n` +
          `You can now use KprCli commands from this device.`;
        break;
    }

    return await this.sendMessage(user.telegram_id, message);
  }

  /**
   * Send automation job notification
   */
  static async sendAutomationJobNotification(
    user: KprCliUser,
    notification: AutomationJobNotification
  ): Promise<boolean> {
    if (!user.telegram_id) {
      console.log('[TELEGRAM] User has no Telegram ID, skipping notification');
      return false;
    }

    let message = '';
    let emoji = '';
    
    switch (notification.type) {
      case 'job_started':
        emoji = '🚀';
        message = `${emoji} Automation Job Started\n\n` +
          `Job ID: \`${notification.jobId}\`\n` +
          `Type: ${notification.jobType}\n` +
          `Status: ${notification.status}\n\n` +
          `Your automation job is now running. You'll be notified when it completes.`;
        break;
        
      case 'job_completed':
        emoji = '✅';
        message = `${emoji} Automation Job Completed\n\n` +
          `Job ID: \`${notification.jobId}\`\n` +
          `Type: ${notification.jobType}\n` +
          `Status: ${notification.status}\n\n` +
          `${notification.message || 'Your automation job has completed successfully!'}`;
        break;
        
      case 'job_failed':
        emoji = '❌';
        message = `${emoji} Automation Job Failed\n\n` +
          `Job ID: \`${notification.jobId}\`\n` +
          `Type: ${notification.jobType}\n` +
          `Status: ${notification.status}\n\n` +
          `Error: ${notification.message || 'Unknown error occurred'}\n\n` +
          `Please check your job configuration and try again.`;
        break;
    }

    return await this.sendMessage(user.telegram_id, message);
  }

  /**
   * Send welcome message when user links their Telegram account
   */
  static async sendWelcomeMessage(user: KprCliUser): Promise<boolean> {
    if (!user.telegram_id) return false;

    const message = `🎉 Welcome to KprCli!\n\n` +
      `Your Telegram account has been successfully linked to:\n\n` +
      `📧 Email: ${user.email}\n` +
      `🎯 Subscription: ${user.subscription_tier}\n` +
      `💰 Token Balance: ${user.token_balance}\n\n` +
      `You'll now receive notifications about:\n` +
      `• Device authorization requests\n` +
      `• Automation job updates\n` +
      `• Account changes\n\n` +
      `Use /status to check your account anytime!`;

    return await this.sendMessage(user.telegram_id, message);
  }

  /**
   * Send account status update
   */
  static async sendAccountUpdate(
    user: KprCliUser, 
    changes: { 
      field: string; 
      oldValue: any; 
      newValue: any; 
    }[]
  ): Promise<boolean> {
    if (!user.telegram_id || changes.length === 0) return false;

    let message = `📊 Account Update\n\n`;
    
    changes.forEach(change => {
      const fieldName = change.field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      message += `${fieldName}: ${change.oldValue} → ${change.newValue}\n`;
    });

    message += `\nUse /status to see your full account details.`;

    return await this.sendMessage(user.telegram_id, message);
  }

  /**
   * Send raw message to user's Telegram chat
   */
  private static async sendMessage(telegramId: string, text: string): Promise<boolean> {
    if (!this.BOT_TOKEN) {
      console.error('[TELEGRAM] Bot token not configured');
      return false;
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${this.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: telegramId,
          text: text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        console.error('[TELEGRAM] Failed to send message:', result);
        return false;
      }

      console.log('[TELEGRAM] Message sent successfully to', telegramId);
      return true;
      
    } catch (error) {
      console.error('[TELEGRAM] Error sending message:', error);
      return false;
    }
  }

  /**
   * Test if bot token is valid
   */
  static async testBotConnection(): Promise<boolean> {
    if (!this.BOT_TOKEN) {
      console.error('[TELEGRAM] Bot token not configured');
      return false;
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${this.BOT_TOKEN}/getMe`);
      const result = await response.json();
      
      if (response.ok && result.ok) {
        console.log('[TELEGRAM] Bot connection test successful:', result.result.username);
        return true;
      } else {
        console.error('[TELEGRAM] Bot connection test failed:', result);
        return false;
      }
    } catch (error) {
      console.error('[TELEGRAM] Bot connection test error:', error);
      return false;
    }
  }
}