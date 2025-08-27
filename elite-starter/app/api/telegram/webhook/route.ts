import { NextRequest, NextResponse } from 'next/server';
import { KprCliAuthBridge } from '@/lib/auth-bridge-supabase';
import { DeviceAuthStorage } from '@/lib/redis';

interface TelegramWebhookUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
      language_code?: string;
    };
    chat: {
      id: number;
      first_name: string;
      username?: string;
      type: string;
    };
    date: number;
    text?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const update: TelegramWebhookUpdate = await request.json();
    
    if (!update.message?.text) {
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text!; // Safe because we checked above
    const telegramUserId = message.from.id.toString();
    const telegramUsername = message.from.username;

    // Handle /start command
    if (text === '/start') {
      await sendTelegramMessage(chatId, 
        `Welcome to KprCli! 🚀\n\n` +
        `Available commands:\n` +
        `/link <token> - Link your KprCli account\n` +
        `/status - Check your account status\n` +
        `/help - Show help information`
      );
      return NextResponse.json({ ok: true });
    }

    // Handle /help command
    if (text === '/help') {
      await sendTelegramMessage(chatId,
        `KprCli Telegram Bot Help 📚\n\n` +
        `Commands:\n` +
        `/start - Start the bot\n` +
        `/link <token> - Link your account with a token from the web app\n` +
        `/status - Check your current account status\n` +
        `/help - Show this help message\n\n` +
        `To get a linking token, visit your KprCli dashboard and generate a Telegram linking token.`
      );
      return NextResponse.json({ ok: true });
    }

    // Handle /link <token> command
    if (text.startsWith('/link ')) {
      const token = text.substring(6).trim();
      
      if (!token) {
        await sendTelegramMessage(chatId, 
          `Please provide a linking token.\n` +
          `Usage: /link <your-token>\n\n` +
          `Get your linking token from the KprCli web dashboard.`
        );
        return NextResponse.json({ ok: true });
      }

      try {
        // Verify the linking token
        const clerkUserId = await KprCliAuthBridge.verifyTelegramLinkingToken(token);
        
        if (!clerkUserId) {
          await sendTelegramMessage(chatId, 
            `❌ Invalid or expired linking token.\n\n` +
            `Please generate a new token from your KprCli dashboard and try again.`
          );
          return NextResponse.json({ ok: true });
        }

        // Link the Telegram account
        const linkedUser = await KprCliAuthBridge.linkTelegramAccount(
          clerkUserId, 
          telegramUserId, 
          telegramUsername
        );

        if (linkedUser) {
          await sendTelegramMessage(chatId, 
            `✅ Successfully linked your KprCli account!\n\n` +
            `Account: ${linkedUser.email}\n` +
            `Subscription: ${linkedUser.subscription_tier}\n` +
            `Status: ${linkedUser.subscription_status}\n\n` +
            `You'll now receive notifications about your automation jobs and device authorizations.`
          );
        } else {
          await sendTelegramMessage(chatId, 
            `❌ Failed to link your account. Please try again or contact support.`
          );
        }

      } catch (error) {
        console.error('[TELEGRAM] Failed to link account:', error);
        await sendTelegramMessage(chatId, 
          `❌ Error linking your account. Please try again later.`
        );
      }

      return NextResponse.json({ ok: true });
    }

    // Handle /status command  
    if (text === '/status') {
      try {
        // Find user by Telegram ID
        const user = await KprCliAuthBridge.getKprCliUserByTelegramId(telegramUserId);
        
        if (!user) {
          await sendTelegramMessage(chatId, 
            `❌ No linked KprCli account found.\n\n` +
            `Use /link <token> to link your account first.`
          );
          return NextResponse.json({ ok: true });
        }

        await sendTelegramMessage(chatId, 
          `📊 Your KprCli Status\n\n` +
          `Email: ${user.email}\n` +
          `Subscription: ${user.subscription_tier}\n` +
          `Status: ${user.subscription_status}\n` +
          `Token Balance: ${user.token_balance}\n` +
          `Automation Credits: ${user.automation_credits}\n\n` +
          `Last updated: ${new Date(user.updated_at).toLocaleString()}`
        );

      } catch (error) {
        console.error('[TELEGRAM] Failed to get user status:', error);
        await sendTelegramMessage(chatId, 
          `❌ Error retrieving your status. Please try again later.`
        );
      }

      return NextResponse.json({ ok: true });
    }

    // Handle unknown commands
    if (text.startsWith('/')) {
      await sendTelegramMessage(chatId, 
        `❓ Unknown command: ${text}\n\n` +
        `Type /help to see available commands.`
      );
    }

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('[TELEGRAM] Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function sendTelegramMessage(chatId: number, text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    console.error('[TELEGRAM] Bot token not configured');
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[TELEGRAM] Failed to send message:', error);
    }
    
  } catch (error) {
    console.error('[TELEGRAM] Error sending message:', error);
  }
}