# Deepgram WebSocket Proxy

A long-running WebSocket proxy server for Deepgram real-time transcription, designed to overcome Supabase Edge Function timeout limitations.

## Why This Exists

Supabase Edge Functions have a ~60 second timeout, which breaks persistent WebSocket connections needed for long lecture recordings. This proxy runs on Fly.io with no timeout limits.

## Architecture

```
Browser → Fly.io Proxy → Deepgram API
           (no timeout)   (real-time transcription)
```

## Deployment to Fly.io

### Prerequisites

1. Install Fly CLI: https://fly.io/docs/hands-on/install-flyctl/
2. Create Fly.io account: `fly auth signup` or `fly auth login`

### Deploy

```bash
cd deepgram-proxy

# First time setup
fly launch --name your-app-name

# Set your Deepgram API key
fly secrets set DEEPGRAM_API_KEY=your_deepgram_api_key_here

# Deploy
fly deploy
```

### Get Your Proxy URL

After deployment, your WebSocket URL will be:
```
wss://your-app-name.fly.dev
```

## Update Your Frontend

In `src/lib/deepgramStreaming.ts`, update the WebSocket URL:

```typescript
// Change from Supabase Edge Function:
// const wsUrl = `wss://${projectRef}.supabase.co/functions/v1/deepgram-streaming`;

// To Fly.io proxy:
const wsUrl = `wss://your-app-name.fly.dev`;
```

## Health Check

Test the proxy is running:
```bash
curl https://your-app-name.fly.dev/health
```

## Monitoring

View logs:
```bash
fly logs
```

## Scaling

For production with multiple concurrent lectures:
```bash
fly scale count 2  # Run 2 instances
fly scale memory 512  # Increase memory if needed
```

## Cost

Fly.io free tier includes:
- 3 shared-cpu-1x VMs with 256MB RAM
- 160GB outbound bandwidth

This is typically sufficient for development and small-scale production.
