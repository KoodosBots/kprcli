# SSL Certificates Directory

This directory is for SSL certificates when deploying with HTTPS.

## For Development (HTTP Only)
The nginx configuration works fine with HTTP on port 80. SSL certificates are optional.

## For Production (HTTPS)
Place your SSL certificates here:

- `kprcli.crt` - SSL certificate file
- `kprcli.key` - SSL private key file

### Getting SSL Certificates

#### Option 1: Let's Encrypt (Free)
```bash
# Install certbot
sudo apt-get install certbot

# Generate certificate for your domain
sudo certbot certonly --standalone -d yourdomain.com

# Copy certificates to this directory
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./kprcli.crt
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./kprcli.key
```

#### Option 2: Self-signed Certificate (Development)
```bash
# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout kprcli.key \
    -out kprcli.crt \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
```

#### Option 3: Commercial Certificate
Purchase from a Certificate Authority and place the files here.

## File Permissions
Ensure proper permissions:
```bash
chmod 600 kprcli.key  # Private key should be readable by nginx only
chmod 644 kprcli.crt  # Certificate can be world-readable
```