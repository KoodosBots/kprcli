# Product Requirements Document (PRD)
# TeleKpr CRM System v2.0

**Document Version:** 1.0  
**Date:** August 27, 2025  
**Product Name:** TeleKpr - Telegram Bot CRM System  
**Product Version:** 2.0

---

## 1. Executive Summary

### 1.1 Product Vision
TeleKpr is a comprehensive customer relationship management (CRM) system built on the Telegram platform that revolutionizes how businesses manage customer onboarding, order processing, and service delivery through conversational AI and automated workflows.

### 1.2 Objectives
- **Streamline Customer Onboarding**: Reduce friction in customer registration through conversational forms
- **Automate Order Management**: Handle complete order lifecycle from creation to fulfillment
- **Enable Cryptocurrency Payments**: Integrate modern payment methods via OxaPay
- **Provide Real-time Analytics**: Deliver business intelligence through comprehensive dashboards
- **Ensure Scalability**: Support growth from hundreds to thousands of customers

### 1.3 Target Market
- **Primary**: Small to medium businesses requiring customer management systems
- **Secondary**: Service providers needing order tracking and fulfillment systems
- **Tertiary**: Digital agencies managing multiple client accounts

### 1.4 Key Value Propositions
- **Zero Installation Barrier**: Customers interact through familiar Telegram interface
- **Complete Business Suite**: Integrated CRM, order management, and payment processing
- **Real-time Operations**: Instant notifications and status updates
- **Token Economy**: Flexible internal currency system for services
- **Multi-tier Pricing**: Subscription models with volume discounts

---

## 2. Product Overview

### 2.1 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     TeleKpr CRM System                       │
├───────────────────────────┬─────────────────────────────────┤
│    Frontend Layer         │        Backend Layer            │
├───────────────────────────┼─────────────────────────────────┤
│ • Telegram Bot Interface  │ • Node.js/Express Server        │
│ • Admin Web Dashboard     │ • Telegraf Bot Framework        │
│ • Real-time Charts        │ • WebSocket Connections         │
│ • Responsive UI           │ • RESTful API Endpoints         │
├───────────────────────────┴─────────────────────────────────┤
│                      Data Layer                              │
├───────────────────────────────────────────────────────────────┤
│ • Supabase (PostgreSQL)                                      │
│ • Real-time Subscriptions                                    │
│ • Row Level Security (RLS)                                   │
├───────────────────────────────────────────────────────────────┤
│                   External Services                          │
├───────────────────────────────────────────────────────────────┤
│ • Telegram Bot API        │ • OxaPay Payment Gateway        │
│ • PM2 Process Manager     │ • Winston Logging Service       │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 Core Components

#### 2.2.1 Telegram Bot (Port 3002)
- **Technology**: Node.js, Telegraf Framework
- **Functions**: User interaction, order processing, payment handling
- **Sessions**: Managed through Telegraf session middleware
- **Commands**: /start, /register, /order, /tokens, /help, etc.

#### 2.2.2 Admin Panel (Port 8082)
- **Technology**: Express.js, HTML5, Chart.js
- **Functions**: Dashboard analytics, order management, user administration
- **Authentication**: Environment-based credentials
- **Real-time**: WebSocket updates for live data

#### 2.2.3 Database System
- **Provider**: Supabase (PostgreSQL)
- **Tables**: users, customer_profiles, orders, token_transactions, subscriptions
- **Security**: Row Level Security, prepared statements
- **Backup**: Automated daily backups

### 2.3 Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Node.js v16+ | Server environment |
| Bot Framework | Telegraf 4.14 | Telegram bot development |
| Web Server | Express 4.18 | HTTP server and API |
| Database | Supabase/PostgreSQL | Data persistence |
| Payment | OxaPay API | Cryptocurrency payments |
| Logging | Winston | Structured logging |
| Process | PM2 | Process management |
| Frontend | HTML5/CSS3/JS | Admin interface |
| Charts | Chart.js | Data visualization |

---

## 3. Functional Requirements

### 3.1 User Management

#### 3.1.1 Registration Flow
**Priority**: P0 (Critical)
**Actor**: End User

**Requirements**:
- Multi-step conversational form collecting:
  - Personal Information (first, middle, last name)
  - Contact Details (phone, email)
  - Demographics (gender, date of birth)
  - Address (street, apartment, city, state, postal code)
  - Social Media (Telegram, Instagram usernames)
  - Password (optional or generated)
- State selection through interactive buttons (all 50 US states + DC)
- Data validation at each step
- Ability to skip optional fields
- Progress saving between sessions

#### 3.1.2 User Authentication
**Priority**: P0 (Critical)

**Requirements**:
- Automatic user creation on first interaction
- Telegram ID as primary identifier
- Session persistence across bot restarts
- Admin privilege management
- Token balance tracking per user

### 3.2 Order Management System

#### 3.2.1 Package Selection
**Priority**: P0 (Critical)

**Package Types**:
```
- 100 sites: 100 tokens (regular) / 60 tokens (subscriber)
- 250 sites: 250 tokens (regular) / 150 tokens (subscriber)
- 550 sites: 550 tokens (regular) / 350 tokens (subscriber)
- 650 sites: 650 tokens (regular) / 450 tokens (subscriber)
- 850 sites: 850 tokens (regular) / 650 tokens (subscriber)
- 1000 sites: 1000 tokens (regular) / 750 tokens (subscriber)
- 1200 sites: 1000 tokens (regular) / 750 tokens (subscriber)
- 1350 sites: 1350 tokens (regular) / 1150 tokens (subscriber)
- 1500 sites: 1550 tokens (regular) / 1250 tokens (subscriber)
```

#### 3.2.2 Order Workflow
**Priority**: P0 (Critical)

**Status Flow**:
```
pending → processing → assigned → completed
                ↓
            cancelled
```

**Requirements**:
- Customer profile selection
- Package selection with pricing display
- Email confirmation add-on (optional)
- Order confirmation with details
- Insufficient balance handling
- Queue position assignment
- Operator assignment capability
- Order notes and tracking
- Rerun functionality for completed orders

#### 3.2.3 Order Tracking
**Priority**: P1 (High)

**Requirements**:
- Real-time status updates
- Queue position visibility
- Order history with filtering
- Export to CSV functionality
- Telegram notifications on status change

### 3.3 Payment System

#### 3.3.1 Token Economy
**Priority**: P0 (Critical)

**Requirements**:
- Internal token currency system
- Token purchase options (predefined and custom amounts)
- Balance tracking per user
- Transaction history logging
- Admin-controlled balance adjustments

#### 3.3.2 OxaPay Integration
**Priority**: P0 (Critical)

**Requirements**:
- Cryptocurrency payment processing
- Payment link generation
- Webhook handling for confirmations
- Payment status tracking
- Fallback payment monitoring
- Transaction reconciliation

#### 3.3.3 Subscription System
**Priority**: P1 (High)

**Subscription Tiers**:
- Basic: No subscription (regular pricing)
- Premium: Monthly subscription with:
  - 25-40% discount on all packages
  - Priority order processing
  - Exclusive features

### 3.4 Admin Panel Features

#### 3.4.1 Dashboard Analytics
**Priority**: P0 (Critical)

**Metrics**:
- Total users, orders, customers
- Revenue tracking (total, monthly, completed)
- Order status distribution
- Completion rate
- Average order value
- Active subscribers
- System health indicators

**Visualizations**:
- Revenue trends chart (line graph)
- Order status distribution (doughnut chart)
- User growth analytics (multi-line chart)
- Package popularity analysis (bar chart)

#### 3.4.2 Order Management
**Priority**: P0 (Critical)

**Features**:
- Excel-style data tables
- Status update modals
- Bulk operations
- Search and filtering
- Three-dots action menus
- Order assignment to operators

#### 3.4.3 User Administration
**Priority**: P0 (Critical)

**Features**:
- User listing with details
- Token balance management
- Admin privilege control
- Customer profile editing
- Account suspension/activation
- Activity logs

#### 3.4.4 Broadcast Messaging
**Priority**: P1 (High)

**Features**:
- Mass notification system
- Test mode (admin-only)
- Message preview
- Delivery tracking
- Rate limiting (10 msg/sec)
- Character counter (3900 max)

### 3.5 Notification System

#### 3.5.1 Order Notifications
**Priority**: P0 (Critical)

**Triggers**:
- Order confirmation
- Status changes
- Payment confirmation
- Insufficient balance alerts

#### 3.5.2 System Notifications
**Priority**: P1 (High)

**Types**:
- Welcome messages
- Feature announcements
- Maintenance notices
- Token balance updates

---

## 4. Non-Functional Requirements

### 4.1 Performance Requirements

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| API Response Time | < 200ms | < 500ms |
| Bot Response Time | < 1s | < 3s |
| Dashboard Load Time | < 2s | < 5s |
| Concurrent Users | 1000+ | 500 minimum |
| Message Processing | 100/sec | 50/sec minimum |
| Database Queries | < 100ms | < 300ms |

### 4.2 Security Requirements

#### 4.2.1 Authentication & Authorization
- Environment-based admin credentials
- Telegram ID verification
- Session management
- Role-based access control (User, Admin, Operator)

#### 4.2.2 Data Protection
- Input sanitization (XSS prevention)
- SQL injection prevention (prepared statements)
- HTTPS enforcement for admin panel
- Environment variable protection
- Sensitive data encryption

#### 4.2.3 API Security
- Rate limiting on endpoints
- CORS configuration
- Request size limits (10MB)
- Error message sanitization

### 4.3 Scalability Requirements

- **Horizontal Scaling**: Support for multiple bot instances
- **Database Pooling**: Connection pool management
- **Caching Strategy**: Redis implementation ready
- **CDN Support**: Static asset delivery
- **Load Balancing**: PM2 cluster mode support

### 4.4 Reliability Requirements

- **Uptime Target**: 99.9% availability
- **Recovery Time**: < 5 minutes for critical failures
- **Data Durability**: Daily automated backups
- **Error Handling**: Comprehensive error logging
- **Monitoring**: Real-time health checks

### 4.5 Usability Requirements

- **Response Time**: All bot commands respond within 3 seconds
- **Mobile Responsive**: Admin panel works on all devices
- **Accessibility**: WCAG 2.1 Level AA compliance
- **Internationalization**: Support for multiple languages (future)
- **Help System**: Comprehensive /help command

---

## 5. User Personas and Use Cases

### 5.1 User Personas

#### Persona 1: Customer (End User)
**Name**: Sarah Miller  
**Role**: Small Business Owner  
**Goals**:
- Quick registration process
- Easy order placement
- Track order status
- Manage token balance

**Pain Points**:
- Complex registration forms
- Unclear pricing
- Lack of transparency in order status

#### Persona 2: Administrator
**Name**: John Davis  
**Role**: System Administrator  
**Goals**:
- Monitor system health
- Manage user accounts
- Track revenue and metrics
- Handle customer issues

**Pain Points**:
- Manual data export
- Limited analytics
- Difficult bulk operations

#### Persona 3: Operator
**Name**: Emily Chen  
**Role**: Order Fulfillment Specialist  
**Goals**:
- Process assigned orders
- Update order status
- Communicate with customers
- Meet processing targets

### 5.2 Key Use Cases

#### UC-001: Customer Registration
```
Actor: Customer
Precondition: User has Telegram account
Flow:
1. User starts bot with /start
2. User selects "Register New Customer"
3. Bot guides through multi-step form
4. User provides required information
5. System validates and saves profile
6. User receives confirmation
Postcondition: Customer profile created
```

#### UC-002: Place Order
```
Actor: Customer
Precondition: User has registered profile and sufficient tokens
Flow:
1. User selects "Place Order"
2. User chooses customer profile
3. User selects package type
4. User confirms order details
5. System deducts tokens
6. Order enters processing queue
7. User receives confirmation
Postcondition: Order created and queued
```

#### UC-003: Admin Dashboard Review
```
Actor: Administrator
Precondition: Admin logged into panel
Flow:
1. Admin accesses dashboard
2. System displays real-time metrics
3. Admin reviews charts and KPIs
4. Admin exports data if needed
5. Admin takes action on alerts
Postcondition: Admin informed of system status
```

---

## 6. Data Model

### 6.1 Entity Relationship Diagram

```
┌─────────────┐     ┌──────────────────┐     ┌────────────┐
│    Users    │────<│ Customer_Profiles│>────│   Orders   │
└─────────────┘     └──────────────────┘     └────────────┘
       │                                            │
       │                                            │
       ▼                                            ▼
┌─────────────────┐                    ┌──────────────────┐
│Token_Transactions│                    │  Order_History   │
└─────────────────┘                    └──────────────────┘
       │
       ▼
┌─────────────┐
│Subscriptions│
└─────────────┘
```

### 6.2 Core Entities

#### Users Table
- id (UUID, PK)
- telegram_id (BIGINT, UNIQUE)
- telegram_username (TEXT)
- full_name (TEXT)
- token_balance (INTEGER)
- is_admin (BOOLEAN)
- is_operator (BOOLEAN)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

#### Customer_Profiles Table
- id (UUID, PK)
- user_id (UUID, FK → users)
- first_name (TEXT)
- middle_name (TEXT)
- last_name (TEXT)
- email (TEXT)
- phone (TEXT)
- gender (TEXT)
- date_of_birth (DATE)
- street_address (TEXT)
- apt_suite (TEXT)
- city (TEXT)
- state (TEXT)
- postal_code (TEXT)
- country (TEXT, DEFAULT 'USA')
- telegram_username (TEXT)
- instagram_username (TEXT)
- password_encrypted (TEXT)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

#### Orders Table
- id (UUID, PK)
- user_id (UUID, FK → users)
- customer_profile_id (UUID, FK → customer_profiles)
- operator_id (UUID, FK → users)
- package_type (TEXT)
- product_name (TEXT)
- token_cost (INTEGER)
- status (TEXT)
- queue_position (INTEGER)
- notes (TEXT)
- assigned_at (TIMESTAMP)
- completed_at (TIMESTAMP)
- is_priority (BOOLEAN)
- is_rerun (BOOLEAN)
- sites_count (INTEGER)
- subscriber_discount_applied (BOOLEAN)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

#### Token_Transactions Table
- id (UUID, PK)
- user_id (UUID, FK → users)
- transaction_type (TEXT)
- amount (INTEGER)
- balance_after (INTEGER)
- payment_method (TEXT)
- payment_id (TEXT)
- payment_status (TEXT)
- description (TEXT)
- created_at (TIMESTAMP)

#### Subscriptions Table
- id (UUID, PK)
- user_id (UUID, FK → users)
- type (TEXT)
- status (TEXT)
- expires_at (TIMESTAMP)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

---

## 7. Integration Requirements

### 7.1 Telegram Bot API

**Endpoints Used**:
- getMe - Bot verification
- getUpdates - Polling mode
- sendMessage - Text messages
- editMessageText - Message updates
- answerCallbackQuery - Button responses
- sendDocument - File sending

**Configuration**:
- Bot Token: Environment variable
- Polling mode with 50s timeout
- IPv4 forced for connection stability

### 7.2 OxaPay Payment Gateway

**Integration Points**:
- Create payment link API
- Payment status webhook
- Transaction verification
- Currency conversion

**Configuration**:
- API Key: Environment variable
- Merchant ID: Environment variable
- Webhook URL: Configured endpoint
- Supported currencies: Cryptocurrency

### 7.3 Supabase Backend

**Services**:
- PostgreSQL database
- Real-time subscriptions
- Row Level Security
- Authentication (future)

**Configuration**:
- Project URL: Environment variable
- Service Key: Environment variable
- Anon Key: Environment variable

### 7.4 External Services

**PM2 Process Manager**:
- Process monitoring
- Auto-restart on failure
- Log management
- Cluster mode support

**Winston Logging**:
- Structured logging
- Log rotation
- Error tracking
- Multiple log levels

---

## 8. Business Logic and Rules

### 8.1 Pricing Model

#### Base Pricing Structure
| Package | Regular Price | Subscriber Price | Discount |
|---------|--------------|------------------|----------|
| 100 sites | 100 tokens | 60 tokens | 40% |
| 250 sites | 250 tokens | 150 tokens | 40% |
| 550 sites | 550 tokens | 350 tokens | 36% |
| 650 sites | 650 tokens | 450 tokens | 31% |
| 850 sites | 850 tokens | 650 tokens | 24% |
| 1000 sites | 1000 tokens | 750 tokens | 25% |
| 1200 sites | 1000 tokens | 750 tokens | 25% |
| 1350 sites | 1350 tokens | 1150 tokens | 15% |
| 1500 sites | 1550 tokens | 1250 tokens | 19% |

#### Email Confirmation Add-on
- Regular users: 50 tokens
- Subscribers: 30 tokens (40% discount)

### 8.2 Order Processing Rules

1. **Queue Management**:
   - FIFO processing for regular orders
   - Priority queue for subscribers
   - Manual queue position adjustment allowed

2. **Status Transitions**:
   - pending → processing (automatic or manual)
   - processing → assigned (operator assignment)
   - assigned → completed (fulfillment confirmation)
   - Any status → cancelled (admin action)

3. **Token Management**:
   - Tokens deducted on order creation
   - Refund on order cancellation
   - No refund on completion
   - Admin can adjust balances

### 8.3 Subscription Benefits

**Premium Subscription**:
- Duration: 30 days
- Benefits:
  - 15-40% discount on all packages
  - Priority processing
  - Email confirmation discount
  - Exclusive features (future)

### 8.4 Notification Rules

**Automatic Notifications**:
- Order confirmation (immediate)
- Status changes (immediate)
- Token balance low (< 50 tokens)
- Subscription expiring (3 days before)

**Admin-Triggered**:
- Broadcast messages
- Individual notifications
- Test notifications

---

## 9. Success Metrics and KPIs

### 9.1 Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Monthly Active Users | 500+ | Unique telegram_ids per month |
| Order Completion Rate | > 95% | Completed/Total orders |
| Average Order Value | $50+ | Total revenue/Total orders |
| Customer Retention | > 80% | Repeat customers/Total |
| Subscription Rate | > 30% | Active subs/Total users |
| Revenue Growth | 20% MoM | Month-over-month increase |

### 9.2 Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| System Uptime | 99.9% | Monitoring service |
| API Response Time | < 200ms | Average response time |
| Error Rate | < 0.1% | Errors/Total requests |
| Database Performance | < 100ms | Query execution time |
| Bot Response Time | < 1s | Message to response |

### 9.3 User Engagement Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Registration Completion | > 70% | Completed/Started |
| Daily Active Users | > 100 | Unique daily interactions |
| Feature Adoption | > 50% | Feature users/Total |
| Support Tickets | < 5% | Tickets/Active users |
| User Satisfaction | > 4.5/5 | Survey responses |

---

## 10. Technical Specifications

### 10.1 API Endpoints

#### Admin Panel APIs

**Authentication**:
```
POST /api/admin/login
Body: { username, password }
Response: { success, token }
```

**Dashboard**:
```
GET /api/admin/stats
Response: { totalUsers, totalOrders, totalRevenue, ... }

GET /api/admin/analytics/trends
Response: { dailyData, weeklyData, monthlyData }

GET /api/admin/analytics/performance
Response: { completionRate, avgProcessingTime, ... }
```

**Order Management**:
```
GET /api/admin/orders
PUT /api/admin/orders/:id/status
DELETE /api/admin/orders/:id
POST /api/admin/orders/:id/assign
```

**User Management**:
```
GET /api/admin/users
PUT /api/admin/users/:id/tokens
POST /api/admin/users/:id/promote
DELETE /api/admin/users/:id
```

**Customer Management**:
```
GET /api/admin/customers
PUT /api/admin/customers/:id
DELETE /api/admin/customers/:id
GET /api/admin/customers/export
```

**Broadcast**:
```
POST /api/admin/broadcast
Body: { title, message, emoji, testMode }
Response: { success, sent, failed, successRate }
```

### 10.2 Security Implementation

**Input Validation**:
- Joi schema validation
- Type checking
- Length limits
- Format validation

**Authentication Flow**:
```
1. User provides credentials
2. Server validates against environment variables
3. Generate session token
4. Include token in subsequent requests
5. Validate token on each API call
```

**Data Protection**:
- bcrypt for password hashing
- Environment variables for secrets
- HTTPS enforcement (production)
- SQL injection prevention
- XSS protection

### 10.3 Deployment Architecture

**Production Setup**:
```
┌─────────────────┐
│   Nginx Proxy   │
│   (Port 80/443) │
└────────┬────────┘
         │
    ┌────▼────┐
    │   SSL   │
    │  Cert   │
    └────┬────┘
         │
┌────────▼────────────────────┐
│      PM2 Process Manager    │
├──────────────┬──────────────┤
│  Bot Process │ Admin Process│
│  (Port 3002) │ (Port 8082)  │
└──────────────┴──────────────┘
         │
┌────────▼────────┐
│    Supabase     │
│   PostgreSQL    │
└─────────────────┘
```

**PM2 Configuration**:
```javascript
{
  apps: [
    {
      name: 'telekpr-v2-bot',
      script: './bot.js',
      instances: 1,
      max_memory_restart: '1G',
      env: { PORT: 3002 }
    },
    {
      name: 'telekpr-v2-admin',
      script: './simple-admin.js',
      instances: 1,
      max_memory_restart: '500M',
      env: { PORT: 8082 }
    }
  ]
}
```

### 10.4 Monitoring and Logging

**Log Structure**:
```
logs/
├── bot-YYYY-MM-DD.log      # Bot daily logs
├── admin-combined.log       # Admin combined logs
├── admin-error.log          # Admin errors only
├── combined.log             # System combined
└── error.log               # System errors
```

**Monitoring Points**:
- Process health (PM2)
- Memory usage
- CPU utilization
- API response times
- Error rates
- Database performance
- Payment success rate

---

## 11. Future Enhancements

### 11.1 Phase 2 Features (3-6 months)
- Multi-language support
- Advanced analytics dashboard
- Custom reporting builder
- Automated testing suite
- API rate limiting
- Webhook management UI

### 11.2 Phase 3 Features (6-12 months)
- Mobile application
- Additional payment gateways
- AI-powered chat support
- Predictive analytics
- Custom workflow builder
- White-label solution

### 11.3 Technical Debt
- Migrate to TypeScript
- Implement Redis caching
- Add comprehensive unit tests
- Optimize database queries
- Implement CI/CD pipeline
- Add API documentation (Swagger)

---

## 12. Appendices

### 12.1 Glossary

| Term | Definition |
|------|------------|
| Token | Internal currency unit for purchasing services |
| Package | Predefined service offering with set pricing |
| Subscriber | User with active premium subscription |
| Operator | Staff member who processes orders |
| Queue Position | Order's place in processing line |

### 12.2 References
- Telegram Bot API Documentation
- Supabase Documentation
- OxaPay API Reference
- PM2 Documentation
- Node.js Best Practices

### 12.3 Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-08-27 | System | Initial PRD creation |

---

**END OF DOCUMENT**

*This PRD is a living document and should be updated as the product evolves and requirements change.*