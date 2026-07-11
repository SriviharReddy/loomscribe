# Hosting LoomScribe on Oracle Cloud Infrastructure (OCI) Always Free VM

This guide provides step-by-step instructions to deploy LoomScribe on an Oracle Cloud Infrastructure (OCI) Compute Instance with **1 vCPU and 500MB RAM**.

Because 500MB RAM is extremely constrained for Node.js, this guide includes critical optimization steps (such as configuring **swap space** and limiting **Node.js V8 heap space**) to prevent the Linux Out-Of-Memory (OOM) killer from terminating your server.

---

## Step 1: OCI Network Configuration (VCN Ingress Rules)
Before deploying, you must configure OCI's Virtual Cloud Network (VCN) to allow incoming traffic to your server.

1. In the OCI Console, navigate to **Compute** > **Instances** and click on your instance.
2. Under **Instance details**, click on the link for your **Virtual cloud network**.
3. Under **Resources**, click on **Security Lists** and then click the default security list (e.g., `Default Security List for vcn-...`).
4. Click **Add Ingress Rules** and add the following:
   * **Source Type**: `CIDR`
   * **Source CIDR**: `0.0.0.0/0`
   * **IP Protocol**: `TCP`
   * **Destination Port Range**: `3000` (or `80,443` if using Nginx as a reverse proxy)
   * **Description**: `LoomScribe HTTP Access`
5. Click **Add Ingress Rules**.

---

## Step 2: Configure System Swap Space (Critical for 500MB RAM)
Node.js and `npm install` can easily exceed 500MB of RAM during startup or dependency installation. Creating a swap file is **mandatory** to prevent crashes.

1. SSH into your OCI instance.
2. Run the following commands to create a **2GB swap file**:
   ```bash
   # Allocate a 2GB file for swap
   sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
   
   # Set the correct permissions
   sudo chmod 600 /swapfile
   
   # Setup the swap area
   sudo mkswap /swapfile
   
   # Enable the swap file
   sudo swapon /swapfile
   ```
3. Make the swap file persistent across reboots by appending it to `/etc/fstab`:
   ```bash
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```
4. (Optional but recommended) Lower the kernel's swap tendency to keep more data in RAM:
   ```bash
   echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
   sudo sysctl -p
   ```
5. Verify swap is active:
   ```bash
   free -h
   ```

---

## Step 3: Install Node.js
Deploying LoomScribe requires Node.js (version 20.x is recommended).

On Ubuntu/Debian:
```bash
# Update package list
sudo apt update && sudo apt upgrade -y

# Install Node.js using NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Verify your Node.js and NPM installation:
```bash
node -v
npm -v
```

---

## Step 4: Clone LoomScribe and Configure Env
1. Clone your LoomScribe repository to the server:
   ```bash
   git clone <your-repo-url> loomscribe
   cd loomscribe
   ```
2. Install the lightweight dependencies:
   ```bash
   npm install --production
   ```
   > [!NOTE]
   > The `--production` flag ensures devDependencies are omitted, saving disk space and memory during installation.
3. Configure your environment variables by copying `.env.example`:
   ```bash
   cp .env.example .env
   ```
4. Edit the `.env` file using `nano` to set your ports or API keys:
   ```bash
   nano .env
   ```
   * Ensure `PORT=3000`.
   * Add your `DEEPSEEK_API_KEY` (if utilizing a server-side shared key).

---

## Step 5: Configure OS Firewall (OCI Specifics)
By default, OCI Linux images come with pre-configured internal firewalls (`iptables` or `firewalld`) that block all ports except `22` (SSH). You must explicitly open your app port.

### If your VM uses `iptables` (Default on Oracle Linux / Ubuntu OCI):
First, ensure `iptables-persistent` is installed so rules survive reboots:
```bash
sudo apt install iptables-persistent -y
```
Then insert a rule allowing port 3000 traffic:
```bash
sudo iptables -I INPUT 6 -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save
```

### If your VM uses `ufw` (Ubuntu Alternative):
```bash
sudo ufw allow 3000/tcp
sudo ufw reload
```

---

## Step 6: Deploy with Memory Constraints and PM2
To ensure LoomScribe runs in the background and stays within the 500MB boundary, we use the PM2 process manager and pass memory-limiting V8 flags to the Node process.

1. Install PM2 globally:
   ```bash
   sudo npm install -g pm2
   ```
2. Start LoomScribe. We configure the V8 engine to limit garbage collection limits (`--max-old-space-size=256`) and instruct PM2 to auto-restart the application if it leaks or exceeds memory boundaries:
   > [!NOTE]
   > The entry point is `server.js` by default. If your project differs, check the `"main"` field in `package.json` (e.g., it might be `index.js` or `src/index.js`).
   ```bash
   pm2 start server.js --name "loomscribe" --node-args="--max-old-space-size=256" --max-memory-restart 350M
   ```
3. Set PM2 to automatically start LoomScribe on system reboots:
   ```bash
   pm2 startup
   ```
   *Copy and execute the output command provided by PM2 to complete setup.*
4. Save the current process list:
   ```bash
   pm2 save
   ```

---

## Step 7: Domain and DNS Configuration (Free & Paid Options)
To map a domain to your instance, you need to point it to your VM's public IP address. 

First, **Find your OCI Public IP Address:**
* Go to the OCI Console, navigate to **Compute** > **Instances**, and click your instance name.
* Locate the **Primary VNIC** section and copy the **Public IP Address** (e.g., `129.153.x.x`).

Choose one of the options below to configure your domain:

### Option A: Free Domain using DuckDNS (Recommended & 100% Free)
[DuckDNS](https://www.duckdns.org/) is a free public Dynamic DNS service that provides free subdomains under `*.duckdns.org`.

1. Go to [duckdns.org](https://www.duckdns.org/) and log in (via GitHub, Google, etc.).
2. In the **Domains** section, enter your preferred subdomain name (e.g., `myloomscribe`) and click **add domain**.
3. Once added, locate your subdomain in the list and paste your OCI VM's **Public IP Address** into the `ip` input field.
4. Click **update ip**.
5. Your domain is now `myloomscribe.duckdns.org`!

### Option B: Paid Custom Domain (Namecheap, Cloudflare, etc.)
If you purchased a custom domain, configure it in your registrar's DNS Management panel:
1. Create an **A Record**:
   * **Type**: `A`
   * **Host / Name**: `@` (for root, e.g., `yourdomain.com`) or a subdomain prefix (e.g., `loom`).
   * **Value / IPv4 Address**: Your OCI instance's public IP.
2. (Optional) Create a **CNAME Record** for `www` traffic:
   * **Type**: `CNAME`
   * **Host / Name**: `www`
   * **Value / Target**: `@`

### Verify DNS Propagation:
Wait 2–5 minutes. Run the following command from your local machine to verify the domain points to your OCI VM:
```bash
nslookup yourdomain.duckdns.org
# OR
ping yourdomain.duckdns.org
```

---

## Step 8: (Recommended) Nginx Reverse Proxy & SSL Setup
Exposing port 3000 directly to the internet is not recommended for production. Instead, run LoomScribe behind Nginx (ports 80/443) and secure it with a free SSL certificate from Let's Encrypt.

1. **Install Nginx and Certbot:**
   ```bash
   sudo apt update
   sudo apt install nginx certbot python3-certbot-nginx -y
   ```
2. **Open ports `80` (HTTP) and `443` (HTTPS) in your firewall and OCI VCN Ingress Rules:**
   > [!IMPORTANT]
   > Go back to **Step 1** and add two more OCI VCN Ingress Rules: one for port `80` and one for port `443` (Source CIDR `0.0.0.0/0`, Protocol `TCP`). Without this, traffic will be blocked at the OCI network level regardless of your VM firewall settings.

   Then open the ports on the VM itself:
   ```bash
   # If using iptables (Standard OCI Ubuntu/Oracle Linux)
   sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save

   # If using ufw (Ubuntu alternative)
   sudo ufw allow 'Nginx Full'
   sudo ufw reload
   ```
3. **Create an Nginx configuration file (`/etc/nginx/sites-available/loomscribe`):**
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com; # Replace with your domain name (e.g. myloomscribe.duckdns.org)

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
4. **Enable the configuration and restart Nginx:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/loomscribe /etc/nginx/sites-enabled/
   sudo systemctl restart nginx
   ```
5. **Obtain SSL Certificate:**
   ```bash
   sudo certbot --nginx -d yourdomain.com
   ```
   *Replace `yourdomain.com` with your domain (e.g. `myloomscribe.duckdns.org`).*

6. **Verify SSL auto-renewal:** Let's Encrypt certificates expire every 90 days. Certbot installs a systemd timer that auto-renews them. Test it with a dry run:
   ```bash
   sudo certbot renew --dry-run
   ```

---

## Step 9: Final Verification
Confirm everything is working end-to-end:

```bash
# Check PM2 process is running
pm2 status

# Confirm the app is responding locally
curl http://localhost:3000

# Confirm Nginx is proxying correctly (replace with your domain)
curl http://yourdomain.com

# Confirm HTTPS is working
curl https://yourdomain.com
```

Expected results:
- `pm2 status` shows `loomscribe` with status **online**.
- All `curl` commands return an HTTP 200 response (or your app's HTML/JSON).
- `pm2 logs loomscribe` shows no critical errors.
