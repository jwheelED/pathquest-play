

# Fix YouTube Video Question Generation

## Root Cause (confirmed from database)

Every YouTube video in the database has the transcript `"[Transcript unavailable - video will play without AI-generated questions]"` and `question_count: 0`. This means **both** transcript extraction methods are failing:

1. **YouTube Data API v3 captions.list** -- This API can list caption track IDs, but downloading third-party video captions requires **OAuth authentication**, not just an API key. The current code tries to use the `timedtext` endpoint as a workaround, but this endpoint is unreliable and frequently blocked.

2. **Page scraping fallback** -- YouTube returns HTTP 429 (rate limited) or blocks the request from Deno edge function IPs.

Since no transcript is extracted, `analyze-lecture-cognitive-load` correctly skips AI analysis and sets `question_count: 0`. The video plays fine but with zero pause points/questions.

## Solution: Use Deepgram to transcribe YouTube audio

The system already has Deepgram configured and working (file uploads produce transcripts successfully). The fix is to route YouTube videos through a proxy that extracts the audio stream URL, then send that to Deepgram for transcription.

However, Deepgram cannot directly access YouTube URLs. The practical approach is to use a **YouTube audio extraction service** via the existing `RAPIDAPI_KEY` secret, or alternatively, use a lightweight proxy approach.

### Recommended approach: Use an open YouTube transcript API

There are free/reliable YouTube transcript extraction services that don't require OAuth. We will use the `youtube-transcript` npm package pattern -- making direct requests to YouTube's internal `get_transcript` endpoint which is more reliable than both the Data API and page scraping.

## Changes

### File 1: `supabase/functions/transcribe-video/index.ts`

**Replace the `fetchYouTubeTranscriptViaAPI` function** with a more reliable approach that uses YouTube's internal transcript API (the same one used by the youtube-transcript npm package):

- Fetch the YouTube video page to get the `innertubeApiKey` and video details
- Use the `youtubei/v1/get_transcript` endpoint to fetch transcript data directly
- This endpoint is the same one YouTube's own UI uses and is significantly more reliable than the captions API or timedtext endpoint
- Keep the existing `fetchYouTubeDuration` function (uses Data API for duration, which works fine with just an API key)

**Fallback chain:**
1. YouTube innertube `get_transcript` endpoint (primary -- most reliable)
2. YouTube Data API v3 timedtext (existing, kept as fallback)
3. Page scraping (existing, kept as last resort)

**If ALL transcript methods fail**, instead of setting `question_count: 0` and giving up:
- Set status to `ready` with a user-friendly message
- Allow the video to still be played, but show a clear indicator that no questions could be generated
- Suggest the instructor upload a transcript file manually (future enhancement)

### File 2: `supabase/functions/analyze-lecture-cognitive-load/index.ts`

**Already handles placeholder transcripts correctly** (skips AI analysis, sets status to `ready` with 0 questions). No changes needed here.

### File 3: `src/components/instructor/PreRecordedLectureUpload.tsx`

**No structural changes needed**, but add a clearer message when a video finishes processing with 0 questions, explaining that captions weren't available and suggesting the instructor try a different video or upload a file instead.

### File 4: Fix the build error

The current build is failing with `dist: Cannot open: No such file or directory`. This is likely caused by a TypeScript compilation error introduced in the previous edits. Will investigate and fix any type errors preventing the build.

## Technical Details

### YouTube innertube transcript endpoint

```text
POST https://www.youtube.com/youtubei/v1/get_transcript
Body: {
  "context": { "client": { "clientName": "WEB", "clientVersion": "2.0" } },
  "params": <base64-encoded protobuf with video ID>
}
```

This is the same internal API that YouTube's own frontend uses to show transcripts. It:
- Does not require authentication or API keys
- Is not subject to the same rate limiting as page scraping
- Works for any video that has captions enabled (auto-generated or manual)
- Returns timestamped segments directly

### Params encoding

The `params` field is a base64-encoded protobuf message containing the video ID. The encoding follows a known pattern used by the youtube-transcript library.

## Files to Modify
1. `supabase/functions/transcribe-video/index.ts` -- Replace unreliable transcript methods with innertube API
2. `src/components/instructor/PreRecordedLectureUpload.tsx` -- Better messaging for 0-question results
3. Any files causing the current build error

