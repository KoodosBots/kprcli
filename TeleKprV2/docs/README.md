# 🚀 TeleKpr - Telegram Bot CRM System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)
[![Telegram Bot API](https://img.shields.io/badge/Telegram%20Bot%20API-Latest-blue)](https://core.telegram.org/bots/api)

> A comprehensive Telegram bot-based customer relationship management (CRM) system with integrated admin panel, real-time analytics, and automated order processing.

## ✨ Features

### 🤖 Telegram Bot
- **Multi-step Registration**: Conversational customer onboarding with data collection
- **Order Management**: Complete order lifecycle from creation to completion  
- **Payment Processing**: Integrated OxaPay cryptocurrency payment gateway
- **Token Economy**: Internal currency system for service purchases
- **Subscription System**: Premium subscriptions with discounted pricing
- **Real-time Notifications**: Instant order status updates via Telegram

### 🎛️ Admin Panel
- **Modern Dashboard**: Clean, responsive web interface with dark/light themes
- **Real-time Analytics**: Interactive charts with business intelligence metrics
- **Order Management**: Visual order tracking and status updates
- **Customer Database**: Complete customer profile management with CSV export
- **User Management**: Token balance control and admin privilege assignment
- **Broadcast Messaging**: Mass notifications with test mode safety controls

### 🗄️ Database & Backend
- **Supabase Integration**: Cloud PostgreSQL with real-time subscriptions
- **Comprehensive Schema**: Users, orders, customers, transactions, and subscriptions
- **Security Features**: Row Level Security (RLS) and input validation
- **Process Management**: PM2 configuration for production deployment

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js, Telegraf (Telegram Bot Framework)
- **Database**: Supabase (PostgreSQL), Real-time subscriptions
- **Frontend**: HTML5, CSS3, JavaScript (ES6+), Chart.js
- **Payments**: OxaPay API integration
- **Deployment**: PM2, Docker support, Nginx configuration
- **Monitoring**: Winston logging, error tracking

## 🚀 Quick Start

### Prerequisites

- Node.js 16.0.0 or higher
- npm or yarn package manager
- Supabase account (free tier available)
- Telegram Bot Token from [@BotFather](https://t.me/BotFather)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/KoodosBots/TeleKpr.git
   cd TeleKpr
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration (see Configuration section)
   ```

4. **Database setup**
   - Create a [Supabase](https://supabase.com) project
   - Copy your project URL and service key to `.env`
   - Run the SQL scripts in Supabase SQL Editor:
     ```sql
     -- Copy and paste the contents of database-setup.sql (if available)
     -- Or refer to CLAUDE.md for complete schema
     ```

5. **Start the application**
   ```bash
   # Development mode
   npm run dev
   
   # Or start services individually
   node bot.js              # Telegram bot (port 3000)
   node simple-admin.js     # Admin panel (port 8080)
   ```

### Access Points

- **Admin Panel**: http://localhost:8080
- **Default Credentials**: admin / admin123 (change in `.env`)
- **Bot**: Start chatting with your Telegram bot

## ⚙️ Configuration

### Required Environment Variables

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
BOT_USERNAME=your_bot_username

# Supabase Database
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_key_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Server Configuration
PORT=3000
ADMIN_PORT=8080
NODE_ENV=development

# Admin Panel
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_this_secure_password

# Payment Processing (Optional)
OXAPAY_API_KEY=your_oxapay_api_key_here
OXAPAY_MERCHANT=your_oxapay_merchant_id_here
```

### Telegram Bot Setup

1. **Create Bot**:
   - Message [@BotFather](https://t.me/BotFather) on Telegram
   - Send `/newbot` command
   - Choose a name and username for your bot
   - Copy the provided token to `TELEGRAM_BOT_TOKEN` in `.env`

2. **Configure Bot**:
   - Set bot description and about text
   - Upload profile picture (optional)
   - Configure privacy settings

### Supabase Setup

1. **Create Project**:
   - Sign up at [supabase.com](https://supabase.com)
   - Create a new project
   - Choose a strong database password

2. **Get Credentials**:
   - Go to Settings → API
   - Copy Project URL → `SUPABASE_URL`
   - Copy Service Key → `SUPABASE_SERVICE_KEY`
   - Copy Anon Key → `SUPABASE_ANON_KEY`

3. **Database Schema**:
   - Use Supabase SQL Editor
   - Create the required tables (refer to CLAUDE.md for complete schema)

## 🏗️ System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Telegram Bot  │    │  Admin Panel    │    │   Supabase DB   │
│   (Port 3000)   │◄──►│   (Port 8080)   │◄──►│   (Cloud)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  User Interface │    │   Admin UI      │    │  Data Storage   │
│  - Registration │    │   - Analytics   │    │  - Users        │
│  - Orders       │    │   - Orders      │    │  - Orders       │
│  - Payments     │    │   - Customers   │    │  - Transactions │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📊 Core Features

### Order Management Workflow
1. **Customer Registration**: Multi-step form collection via Telegram
2. **Service Selection**: Choose from configurable service packages
3. **Order Processing**: Real-time order tracking and status updates
4. **Payment Integration**: Token-based economy with crypto payment support
5. **Completion Notification**: Automated customer notifications

### Admin Panel Capabilities
- **Real-time Dashboard**: Live metrics and system health monitoring
- **Customer Management**: Complete profile editing and data export
- **Order Oversight**: Visual status management and progress tracking
- **Analytics**: Revenue, completion rates, user growth metrics
- **System Configuration**: Service packages, pricing, and feature toggles

## 🔒 Security Features

- **Input Validation**: Comprehensive data sanitization and validation
- **Environment Variables**: Secure credential management
- **Admin Authentication**: Configurable admin panel credentials
- **Database Security**: Supabase Row Level Security (RLS) policies
- **Rate Limiting**: API request throttling and abuse prevention
- **Error Handling**: Secure error responses without information leakage

## 🚀 Deployment

### Development
```bash
npm run dev
```

### Production with PM2
```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.js --env production

# Monitor
pm2 monit

# Auto-start on reboot
pm2 startup
pm2 save
```

### Docker Deployment
```bash
docker build -t telekpr .
docker run -d --env-file .env -p 3000:3000 -p 8080:8080 telekpr
```

## 📝 API Documentation

### Admin Panel Endpoints

- `POST /api/admin/login` - Admin authentication
- `GET /api/admin/stats` - Dashboard statistics
- `GET /api/admin/orders` - Order management
- `PUT /api/admin/orders/:id/status` - Update order status
- `GET /api/admin/customers` - Customer management
- `POST /api/admin/broadcast` - Send notifications

### Telegram Bot Commands

- `/start` - Initialize bot and show main menu
- `/register` - Begin customer registration
- `/order` - Create new order
- `/orders` - View order history
- `/tokens` - Check token balance
- `/help` - Display help information

## 🤝 Contributing

We welcome contributions! Please see our [contributing guidelines](CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Code Standards

- Use ES6+ JavaScript features
- Follow existing code style
- Add comprehensive error handling
- Include inline documentation
- Test all new features

## 📋 Roadmap

- [ ] Multi-language support
- [ ] Additional payment gateways (Stripe, PayPal)
- [ ] Mobile app integration
- [ ] Advanced analytics dashboard
- [ ] Automated testing suite
- [ ] API rate limiting
- [ ] Advanced user roles and permissions

## 🐛 Troubleshooting

### Common Issues

**Bot not responding:**
- Verify `TELEGRAM_BOT_TOKEN` in `.env`
- Check internet connectivity
- Restart bot process

**Admin panel login fails:**
- Check `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env`
- Clear browser cache
- Verify admin server is running on port 8080

**Database connection errors:**
- Verify Supabase credentials in `.env`
- Check Supabase project status
- Ensure database schema is properly set up

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Documentation**: See [CLAUDE.md](CLAUDE.md) for comprehensive technical documentation
- **Issues**: [GitHub Issues](https://github.com/KoodosBots/TeleKpr/issues)
- **Telegram Bot API**: [Official Documentation](https://core.telegram.org/bots/api)
- **Supabase**: [Documentation](https://supabase.com/docs)

## 🙏 Acknowledgments

- Built with [Telegraf](https://telegraf.js.org/) - Modern Telegram Bot Framework
- Database powered by [Supabase](https://supabase.com/) - Open Source Firebase Alternative
- Payment processing via [OxaPay](https://oxapay.com/) - Cryptocurrency Payment Gateway

---

**⭐ Star this repository if you find it useful!**

For support and questions, please open an issue or contact the maintainers.