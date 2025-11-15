# Deployment Guide

This guide covers deploying all three components of 404less: the marketing website, client application, and API server.

## 🌐 Overview

The 404less platform consists of three independently deployable components:

1. **Website** (Marketing) - Static site, deploy to Netlify/Vercel/CDN
2. **Client** (App) - Static site with API integration, deploy to Netlify/Vercel/CDN
3. **Server** (API) - Docker container, deploy to Railway/Fly.io/AWS/GCP

## 🎯 Quick Deployment Summary

| Component | Type | Recommended Platform | Complexity |
|-----------|------|---------------------|------------|
| Website | Static | Netlify, Vercel | ⭐ Easy |
| Client | Static | Netlify, Vercel, CloudFront | ⭐⭐ Easy |
| Server | Docker | Railway, Fly.io, Render | ⭐⭐⭐ Medium |

## 📦 Website Deployment (Marketing Site)

The website is the simplest to deploy - it's a static site with no environment variables or API dependencies.

### Netlify Deployment

1. **Build the website**
   ```bash
   cd website
   pnpm install
   pnpm build
   ```

2. **Deploy to Netlify**

   **Option A: Netlify CLI**
   ```bash
   npm install -g netlify-cli
   netlify login
   netlify deploy --dir=dist --prod
   ```

   **Option B: Netlify UI**
   - Go to https://app.netlify.com
   - Drag and drop the `website/dist` folder
   - Done!

   **Option C: GitHub Integration**
   - Connect your GitHub repository to Netlify
   - Set build settings:
     - Base directory: `website`
     - Build command: `pnpm build`
     - Publish directory: `website/dist`

3. **Configure custom domain** (optional)
   - In Netlify dashboard, go to Domain Settings
   - Add your custom domain (e.g., `404less.com`)
   - Update DNS records as instructed

### Vercel Deployment

1. **Build the website**
   ```bash
   cd website
   pnpm install
   pnpm build
   ```

2. **Deploy to Vercel**

   **Option A: Vercel CLI**
   ```bash
   npm install -g vercel
   vercel login
   cd website
   vercel --prod
   ```

   **Option B: GitHub Integration**
   - Go to https://vercel.com
   - Import your repository
   - Set project settings:
     - Framework Preset: Vite
     - Root Directory: `website`
     - Build Command: `pnpm build`
     - Output Directory: `dist`

### Alternative: CloudFront + S3

For AWS users:

```bash
# Build
cd website
pnpm build

# Upload to S3
aws s3 sync dist/ s3://your-bucket-name --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

## 💻 Client Deployment (Authenticated App)

The client app requires an environment variable pointing to your API server.

### Environment Configuration

Create a `.env.production` file:

```bash
# client/.env.production
VITE_API_BASE_URL=https://api.404less.com
```

Or set via command line:

```bash
export VITE_API_BASE_URL=https://api.404less.com
```

### Netlify Deployment

1. **Build with production API URL**
   ```bash
   cd client
   pnpm install

   # Set API URL before building
   echo "VITE_API_BASE_URL=https://api.404less.com" > .env.production
   pnpm build
   ```

2. **Deploy to Netlify**

   **Option A: Netlify CLI**
   ```bash
   netlify deploy --dir=dist --prod
   ```

   **Option B: GitHub Integration**
   - Connect repository to Netlify
   - Set build settings:
     - Base directory: `client`
     - Build command: `pnpm build`
     - Publish directory: `client/dist`
   - Set environment variable:
     - Key: `VITE_API_BASE_URL`
     - Value: `https://api.404less.com`

3. **Configure redirects** (for SPA routing)

   Create `client/public/_redirects`:
   ```
   /*  /index.html  200
   ```

### Vercel Deployment

1. **Build with production API URL**
   ```bash
   cd client
   echo "VITE_API_BASE_URL=https://api.404less.com" > .env.production
   pnpm build
   ```

2. **Deploy to Vercel**

   **GitHub Integration**:
   - Import repository
   - Set root directory: `client`
   - Add environment variable: `VITE_API_BASE_URL=https://api.404less.com`
   - Deploy

3. **Configure rewrites** (handled automatically by Vercel for Vite)

### Alternative: CloudFront + S3

```bash
# Build with API URL
cd client
VITE_API_BASE_URL=https://api.404less.com pnpm build

# Upload to S3
aws s3 sync dist/ s3://your-client-bucket --delete

# Set up CloudFront distribution
# Configure error pages to return index.html for SPA routing
```

## 🖥️ Server Deployment (API)

The server is a Docker container that requires PostgreSQL.

### Prerequisites

- PostgreSQL database (managed service recommended)
- Docker registry access (optional, for container deployment)

### Environment Variables

The server requires these environment variables:

```bash
DATABASE_URL=postgresql+psycopg://user:password@host:5432/dbname
BACKEND_HOST=0.0.0.0
BACKEND_PORT=9001
CORS_ORIGINS=https://app.404less.com,https://404less.com
ENV=production
SECRET_KEY=your-secret-key-here
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-api-key
FROM_EMAIL=noreply@404less.com
```

### Railway Deployment

Railway is the easiest option for deploying the server.

1. **Prepare the server**
   ```bash
   cd server
   ```

2. **Create `railway.toml`** (if not exists)
   ```toml
   [build]
   builder = "dockerfile"
   dockerfilePath = "Dockerfile"

   [deploy]
   startCommand = "uvicorn app.main:app --host 0.0.0.0 --port $PORT"
   ```

3. **Deploy to Railway**

   **Option A: Railway CLI**
   ```bash
   npm install -g @railway/cli
   railway login
   railway init
   railway up
   ```

   **Option B: GitHub Integration**
   - Go to https://railway.app
   - Create new project from GitHub
   - Select your repository
   - Railway auto-detects Dockerfile
   - Add environment variables in Railway dashboard

4. **Add PostgreSQL database**
   - In Railway dashboard, click "New"
   - Select "Database" → "PostgreSQL"
   - Railway auto-generates `DATABASE_URL`
   - Link to your service

5. **Run migrations**
   ```bash
   railway run alembic upgrade head
   ```

6. **Get your API URL**
   - Railway provides a URL like `https://your-app.railway.app`
   - Use this as `VITE_API_BASE_URL` for client

### Fly.io Deployment

1. **Install Fly CLI**
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```

2. **Initialize Fly app**
   ```bash
   cd server
   fly launch
   ```

3. **Configure `fly.toml`**
   ```toml
   app = "404less-api"
   primary_region = "sjc"

   [build]

   [http_service]
     internal_port = 9001
     force_https = true
     auto_stop_machines = true
     auto_start_machines = true
     min_machines_running = 1

   [[vm]]
     cpu_kind = "shared"
     cpus = 1
     memory_mb = 1024
   ```

4. **Add PostgreSQL**
   ```bash
   fly postgres create
   fly postgres attach your-postgres-app
   ```

5. **Set secrets**
   ```bash
   fly secrets set SECRET_KEY=your-secret-key
   fly secrets set CORS_ORIGINS=https://app.404less.com
   fly secrets set SMTP_PASSWORD=your-smtp-password
   ```

6. **Deploy**
   ```bash
   fly deploy
   ```

7. **Run migrations**
   ```bash
   fly ssh console
   alembic upgrade head
   ```

### Render Deployment

1. **Create `render.yaml`** in server directory
   ```yaml
   services:
     - type: web
       name: 404less-api
       env: docker
       dockerfilePath: ./Dockerfile
       envVars:
         - key: DATABASE_URL
           fromDatabase:
             name: 404less-db
             property: connectionString
         - key: CORS_ORIGINS
           value: https://app.404less.com
         - key: ENV
           value: production

   databases:
     - name: 404less-db
       databaseName: app
       user: app
   ```

2. **Deploy via Render Dashboard**
   - Go to https://render.com
   - Connect GitHub repository
   - Render auto-detects `render.yaml`
   - Add environment variables
   - Deploy

### Docker + VPS (Manual Deployment)

For deployment to your own VPS:

1. **Build Docker image**
   ```bash
   cd server
   docker build -t 404less-api:latest .
   ```

2. **Push to registry** (optional)
   ```bash
   docker tag 404less-api:latest registry.example.com/404less-api:latest
   docker push registry.example.com/404less-api:latest
   ```

3. **Deploy to VPS**
   ```bash
   # On your VPS
   docker pull registry.example.com/404less-api:latest

   # Run with docker-compose
   cat > docker-compose.yml <<EOF
   version: '3.8'
   services:
     api:
       image: registry.example.com/404less-api:latest
       ports:
         - "9001:9001"
       environment:
         DATABASE_URL: postgresql+psycopg://user:password@db:5432/app
         CORS_ORIGINS: https://app.404less.com
         ENV: production
       depends_on:
         - db

     db:
       image: postgres:15
       environment:
         POSTGRES_DB: app
         POSTGRES_USER: user
         POSTGRES_PASSWORD: password
       volumes:
         - postgres_data:/var/lib/postgresql/data

   volumes:
     postgres_data:
   EOF

   docker-compose up -d
   ```

4. **Run migrations**
   ```bash
   docker-compose exec api alembic upgrade head
   ```

5. **Set up reverse proxy** (nginx)
   ```nginx
   server {
       listen 80;
       server_name api.404less.com;

       location / {
           proxy_pass http://localhost:9001;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

## 🔐 Security Checklist

Before deploying to production:

- [ ] Use HTTPS for all services
- [ ] Set strong `SECRET_KEY` for server
- [ ] Configure CORS_ORIGINS to only include your domains
- [ ] Use managed database with backups
- [ ] Set up monitoring and logging
- [ ] Enable rate limiting on API
- [ ] Use environment variables for all secrets
- [ ] Review and update security headers
- [ ] Set up automated database backups
- [ ] Configure SSL/TLS certificates

## 🔄 CI/CD Setup

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-website:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'
      - run: cd website && pnpm install
      - run: cd website && pnpm build
      - uses: netlify/actions/cli@master
        with:
          args: deploy --dir=website/dist --prod
        env:
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_WEBSITE_SITE_ID }}
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}

  deploy-client:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'
      - run: cd client && pnpm install
      - run: cd client && pnpm build
        env:
          VITE_API_BASE_URL: ${{ secrets.API_URL }}
      - uses: netlify/actions/cli@master
        with:
          args: deploy --dir=client/dist --prod
        env:
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_CLIENT_SITE_ID }}
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}

  deploy-server:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: docker/login-action@v2
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v4
        with:
          context: ./server
          push: true
          tags: ghcr.io/${{ github.repository }}/api:latest
      - name: Deploy to Railway
        run: |
          npm install -g @railway/cli
          railway link ${{ secrets.RAILWAY_PROJECT_ID }}
          railway up
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

## 📊 Monitoring and Logging

### Server Monitoring

1. **Application Logs**
   - Railway/Fly.io provide built-in log viewing
   - Use `fly logs` or Railway dashboard

2. **Error Tracking**
   - Set up Sentry for error tracking
   - Add Sentry DSN to environment variables

3. **Performance Monitoring**
   - Use built-in platform metrics
   - Set up custom health check endpoints

### Client Monitoring

1. **Analytics**
   - Add Google Analytics or Plausible
   - Track page views and user interactions

2. **Error Tracking**
   - Add Sentry for client-side errors
   - Monitor JavaScript errors

## 🚨 Troubleshooting Deployment Issues

### Build Failures

**Client/Website**:
```bash
# Check Node version
node --version  # Should be 18+

# Clear cache and rebuild
rm -rf node_modules pnpm-lock.yaml dist
pnpm install
pnpm build
```

**Server**:
```bash
# Check Python version
python --version  # Should be 3.11+

# Test Docker build locally
docker build -t test-api .
docker run -p 9001:9001 test-api
```

### Database Connection Issues

```bash
# Test database connection
psql $DATABASE_URL

# Check if migrations ran
docker exec -it <container> alembic current

# Run migrations manually
docker exec -it <container> alembic upgrade head
```

### CORS Errors

- Verify `CORS_ORIGINS` includes your client domain
- Check that protocol (http/https) matches
- Ensure no trailing slashes in URLs

## 📚 Related Documentation

- [Architecture Guide](./architecture.md) - System architecture
- [Development Guide](./development.md) - Local development
- [Monorepo Structure](./monorepo-structure.md) - Project structure
