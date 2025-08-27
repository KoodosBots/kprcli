# ⚠️ OxaPay Configuration Required

## Issue
Token purchases (including custom amounts) are failing because OxaPay payment processing environment variables are not configured.

## Required Environment Variables

Add the following to your `.env` file:

```env
# OxaPay Configuration
OXAPAY_MERCHANT=your_oxapay_merchant_id_here
OXAPAY_API_KEY=your_oxapay_api_key_here

# Webhook URL (your domain where the bot is hosted)
WEBHOOK_URL=https://your-domain.com
```

## Steps to Fix

1. **Get OxaPay Credentials**
   - Sign up at [OxaPay.com](https://oxapay.com)
   - Navigate to API Settings
   - Copy your Merchant ID and API Key

2. **Update Environment Variables**
   ```bash
   nano /root/TeleKpr/.env
   ```
   
   Add:
   ```env
   OXAPAY_MERCHANT=your_actual_merchant_id
   OXAPAY_API_KEY=your_actual_api_key
   WEBHOOK_URL=https://your-actual-domain.com
   ```

3. **Restart the Bot**
   ```bash
   pm2 restart telekpr-bot --update-env
   ```

## What's Fixed

✅ **Better Error Messages**: Users now see "Payment processing is not configured" instead of generic errors
✅ **Environment Check**: Bot checks for required variables before attempting payment
✅ **Logging**: Added console logging for debugging payment issues

## Testing

After adding the environment variables:
1. Try buying tokens with a preset package
2. Try buying tokens with a custom amount
3. Both should now create payment links successfully

## Note
Without these environment variables, all payment functionality will show a clear error message asking users to contact the administrator.