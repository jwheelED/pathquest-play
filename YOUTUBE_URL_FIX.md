# YouTube URL Upload Fix

## Issues Fixed

### Bug 1: Incorrect Environment Variable Name in `get-youtube-transcript`
**File:** `supabase/functions/get-youtube-transcript/index.ts`

**Problem:** Line 3 had a hardcoded API key used as the environment variable name:
```typescript
// WRONG:
const YOUTUBE_API_KEY = Deno.env.get("AIzaSyBVAUlc5S8BbmZ4FaOsPem3CCMs7Hkzxnc");

// FIXED:
const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY");
```

### Bug 2: Poor Error Handling in `transcribe-video`
**File:** `supabase/functions/transcribe-video/index.ts`

**Problem:** When internal edge function calls failed, errors weren't being caught or logged properly.

**Fix:** Added try-catch blocks and detailed logging for both `get-youtube-transcript` and `extract-youtube-audio` calls.

### Bug 3: Missing Error Details in `extract-youtube-audio`
**File:** `supabase/functions/extract-youtube-audio/index.ts`

**Problem:** Generic error messages made debugging difficult.

**Fix:** Added specific error messages for:
- Missing API keys (RAPIDAPI_KEY, CLOUDINARY_*)
- RapidAPI authentication failures (401/403)
- Rate limiting (429)
- Video availability issues (private/unavailable)
- Cloudinary upload failures

## Required Supabase Secrets

Make sure these are set in your Supabase Dashboard → Settings → Edge Functions → Secrets:

| Secret Name | Description | Required |
|------------|-------------|----------|
| `DEEPGRAM_API_KEY` | For audio transcription | Yes |
| `RAPIDAPI_KEY` | For YouTube audio extraction (fallback) | Yes (for videos without captions) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account name | Yes (for videos without captions) |
| `CLOUDINARY_API_KEY` | Cloudinary API key | Yes (for videos without captions) |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | Yes (for videos without captions) |
| `YOUTUBE_API_KEY` | For better caption detection (optional) | No |

## How to Deploy the Fixed Functions

### Option 1: Using Supabase CLI (Recommended)

1. Install Supabase CLI if not already installed:
```bash
npm install -g supabase
```

2. Login to Supabase:
```bash
supabase login
```

3. Link to your project:
```bash
cd /app/frontend
supabase link --project-ref otsmjgrhyteyvpufkwdh
```

4. Deploy the updated functions:
```bash
supabase functions deploy get-youtube-transcript
supabase functions deploy extract-youtube-audio
supabase functions deploy transcribe-video
```

### Option 2: Manual Deployment via Dashboard

1. Go to Supabase Dashboard → Edge Functions
2. Find each function (`get-youtube-transcript`, `extract-youtube-audio`, `transcribe-video`)
3. Click on the function
4. Copy the updated code from the local files and paste it
5. Click "Deploy"

## Testing After Deployment

1. Go to your app's Pre-Recorded Lecture upload
2. Select "Video URL" tab
3. Paste a YouTube URL (try one with captions first, like a TED talk)
4. Click "Upload & Process Lecture"
5. Check the Supabase Edge Function logs for detailed error messages if it fails

## YouTube Processing Flow

```
YouTube URL entered
       ↓
1. Try caption extraction (free, instant)
   - Uses get-youtube-transcript function
   - Works for videos with captions enabled
       ↓ (if captions unavailable)
2. Fallback to audio extraction
   - Uses extract-youtube-audio function
   - Requires RAPIDAPI_KEY + Cloudinary
   - Downloads audio → Uploads to Cloudinary → Transcribes with Deepgram
       ↓
3. Analyze cognitive load & generate questions
       ↓
4. Ready for students!
```

## Common Issues

### "RAPIDAPI_KEY not configured"
Add your RapidAPI key to Supabase secrets. Get one from https://rapidapi.com/ytjar/api/youtube-mp36

### "Cloudinary credentials not configured"
Add all three Cloudinary secrets. Get them from https://cloudinary.com/console

### "Caption downloads disabled"
Some YouTube videos have captions disabled by the owner. The system will automatically try the audio extraction fallback.

### "Video is private or unavailable"
Only public YouTube videos can be processed. Make sure the video is publicly accessible.
