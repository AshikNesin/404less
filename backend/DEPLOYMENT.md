# Production Deployment Guide

This guide covers deploying the 404less backend to production.

## Environment Setup

### 1. Create Production Environment File

Copy `.env.example` to `.env` and update for production:

```bash
cp infra/.env.example infra/.env
```

**Required changes for production:**

```bash
# Set production environment
ENV=production

# Set secure secret key (generate a strong random string)
SECRET_KEY=your-super-secret-random-string-here

# Disable debug mode
DEBUG=false

# Set production database URL
DATABASE_URL=postgresql+psycopg://username:password@your-db-host:5432/db_name

# Set specific CORS origins
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Database pool settings (optional, defaults are good)
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20
DB_POOL_TIMEOUT=30
DB_POOL_RECYCLE=3600
```

### 2. Security Checklist

- [ ] SECRET_KEY is set to a strong random value
- [ ] DEBUG is set to false
- [ ] Database uses production credentials (not dev/dev)
- [ ] CORS_ORIGINS is explicitly set for your domain
- [ ] Database is accessible from the deployment environment
- [ ] SSL/TLS is configured for your domain

## Docker Deployment

### Build Production Image

```bash
# Build the optimized production image
docker build -t tiny-backend:latest ./backend

# Or use the multi-stage build target
docker build -t tiny-backend:prod --target production ./backend
```

### Run with Docker

```bash
# Create and run container
docker run -d \
  --name tiny-backend \
  --env-file infra/.env \
  -p 9001:9001 \
  tiny-backend:latest
```

### Run with Docker Compose

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      target: production
    ports:
      - "9001:9001"
    env_file:
      - infra/.env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9001/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

Deploy:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Health Checks

The application provides several health endpoints:

- `/healthz` - Basic health check (for load balancers)
- `/health` - Detailed health with database status
- `/version` - Version information

### Health Check Response

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000000",
  "request_id": "req_12345",
  "environment": "production",
  "checks": {
    "database": {
      "status": "ok",
      "message": "Connected"
    }
  }
}
```

## Monitoring

### Request IDs

Every request gets a unique ID included in:
- Response headers (`X-Request-ID`)
- Log entries
- Health check responses

### Error Responses

All errors follow a consistent format:

```json
{
  "error": {
    "message": "Human-readable error message",
    "type": "ErrorType",
    "details": { ... }
  },
  "timestamp": "2024-01-01T12:00:00.000000",
  "path": "/todos"
}
```

### Rate Limiting

Production includes basic rate limiting:
- 100 requests per minute per IP
- 429 status code when exceeded
- `Retry-After` header included

## Scaling

### Horizontal Scaling

The application is stateless and can be scaled horizontally:

```bash
# Run multiple instances
docker-compose -f docker-compose.prod.yml up -d --scale backend=3
```

### Database Scaling

- Use connection pooling (configured by environment variables)
- Consider read replicas for high read traffic
- Monitor connection pool metrics

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check DATABASE_URL format
   - Verify network connectivity
   - Check database credentials

2. **CORS Errors**
   - Verify CORS_ORIGINS includes your domain
   - Check for protocol mismatch (http vs https)

3. **Rate Limiting**
   - Check if IP is being rate limited
   - Monitor X-RateLimit headers

### Logs

Application logs include:
- Request/response information
- Error details (without sensitive data)
- Database connection status
- Health check results

In production, logs are structured JSON for easier parsing.

## Security Considerations

- The application runs as a non-root user in Docker
- Secrets are loaded from environment variables only
- Error responses don't expose internal details in production
- Database connections use connection pooling
- Rate limiting prevents abuse

## Performance Optimization

- Use the optimized Dockerfile (multi-stage build)
- Enable connection pooling for database
- Monitor response times and error rates
- Consider CDN for static assets
- Use appropriate database indexing
