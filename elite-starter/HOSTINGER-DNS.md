# Hostinger DNS Configuration for app.kprcli.com

## Step 1: Get Your VPS IP Address

SSH into your VPS and run:
```bash
curl ifconfig.me
```
Note this IP address (e.g., `185.185.185.185`)

## Step 2: Configure DNS in hPanel

### Method A: If kprcli.com is registered with Hostinger

1. Log in to hPanel
2. Go to **Domains** → **kprcli.com** → **DNS / Nameservers**
3. Click **DNS Zone**
4. Add/Edit these records:

```
Type    Name    Value               TTL
A       app     YOUR_VPS_IP         14400
A       www.app YOUR_VPS_IP         14400
```

Example:
```
Type    Name    Value               TTL
A       app     185.185.185.185     14400
A       www.app 185.185.185.185     14400
```

### Method B: If using Cloudflare (Recommended for CDN & Security)

1. **In Cloudflare:**
   - Add site: kprcli.com
   - Copy nameservers provided

2. **In Hostinger hPanel:**
   - Go to **Domains** → **kprcli.com** 
   - Click **DNS / Nameservers**
   - Select **Change nameservers**
   - Enter Cloudflare nameservers:
     ```
     tia.ns.cloudflare.com
     todd.ns.cloudflare.com
     ```

3. **Back in Cloudflare:**
   - Go to **DNS** → **Records**
   - Add these records:

```
Type    Name    Content             Proxy Status
A       app     YOUR_VPS_IP         Proxied ☁️
A       www.app YOUR_VPS_IP         Proxied ☁️
```

### Method C: If domain is elsewhere (GoDaddy, Namecheap, etc.)

Add these DNS records at your domain registrar:

```
Type    Host    Points to           TTL
A       app     YOUR_VPS_IP         3600
A       www.app YOUR_VPS_IP         3600
```

## Step 3: Verify DNS Propagation

After adding DNS records, check propagation:

1. **Using command line:**
```bash
nslookup app.kprcli.com
# or
dig app.kprcli.com
```

2. **Using online tools:**
- https://dnschecker.org/#A/app.kprcli.com
- https://whatsmydns.net/#A/app.kprcli.com

DNS propagation typically takes 5-30 minutes but can take up to 48 hours.

## Step 4: Test Your Setup

Once DNS propagates:

```bash
# Test HTTP redirect
curl -I http://app.kprcli.com

# Test HTTPS
curl -I https://app.kprcli.com

# Test API health
curl https://app.kprcli.com/api/health
```

## Hostinger-Specific Settings

### For Hostinger VPS:

1. **Firewall Configuration in hPanel:**
   - Go to **VPS** → **Settings** → **Firewall**
   - Ensure these ports are open:
     - 22 (SSH)
     - 80 (HTTP)
     - 443 (HTTPS)

2. **IPv6 Configuration (Optional):**
   If your VPS has IPv6:
   ```
   Type    Name    Value                   TTL
   AAAA    app     YOUR_IPV6_ADDRESS       14400
   ```

### For Hostinger Cloud Hosting:

If using Hostinger's Cloud/Business hosting instead of VPS:

1. Go to **Hosting** → **Manage** → **Domains**
2. Click **Add Domain**
3. Add: `app.kprcli.com`
4. Set as primary if needed

## Troubleshooting

### DNS Not Resolving

1. **Check nameservers:**
```bash
dig NS kprcli.com
```

2. **Clear DNS cache:**
- Windows: `ipconfig /flushdns`
- Mac: `sudo dscacheutil -flushcache`
- Linux: `sudo systemd-resolve --flush-caches`

### SSL Certificate Issues

If Let's Encrypt fails:

1. **Verify DNS is working:**
```bash
host app.kprcli.com
```

2. **Check Nginx configuration:**
```bash
nginx -t
```

3. **Manually obtain certificate:**
```bash
certbot certonly --nginx -d app.kprcli.com
```

### Connection Timeout

1. **Check VPS firewall:**
```bash
ufw status
```

2. **Check Hostinger firewall in hPanel**

3. **Verify Nginx is running:**
```bash
systemctl status nginx
```

## Advanced Configuration

### Multiple Subdomains

For additional services:

```
Type    Name        Value           TTL
A       api         YOUR_VPS_IP     14400  # api.kprcli.com
A       admin       YOUR_VPS_IP     14400  # admin.kprcli.com
A       get         YOUR_VPS_IP     14400  # get.kprcli.com
```

### Mail Configuration

For email on the domain:

```
Type    Name    Value                       Priority    TTL
MX      @       mail.kprcli.com            10          14400
A       mail    YOUR_MAIL_SERVER_IP        -           14400
TXT     @       "v=spf1 ip4:YOUR_VPS_IP ~all"  -       14400
```

### CAA Records (Security)

To restrict certificate issuers:

```
Type    Name    Value                           TTL
CAA     @       0 issue "letsencrypt.org"       14400
CAA     @       0 issuewild "letsencrypt.org"   14400
```

## Quick Setup Commands

Run these on your VPS after DNS is configured:

```bash
# Test DNS resolution
host app.kprcli.com

# Get SSL certificate
certbot --nginx -d app.kprcli.com -d www.app.kprcli.com

# Restart services
pm2 restart all
systemctl reload nginx

# Check status
pm2 status
curl https://app.kprcli.com/api/health
```

## Support Resources

- **Hostinger DNS Guide:** https://support.hostinger.com/en/articles/1696779
- **Hostinger VPS Guide:** https://support.hostinger.com/en/articles/4543520
- **Cloudflare Setup:** https://developers.cloudflare.com/dns/zone-setups/full-setup/
- **Let's Encrypt:** https://letsencrypt.org/docs/