

# Fix Pre-Recorded Lecture Video URL Processing

## Problems Identified

### 1. Infinite Processing Loop
The polling logic in `PreRecordedLectureUpload.tsx` (lines 272-331) polls the database every 3-5 seconds with `setTimeout(pollStatus, 3000)` but has **no maximum retry limit or timeout**. If the edge functions fail silently or the status gets stuck, the UI spins forever.

### 2. YouTube Transcription Fails with 429
The `transcribe-video` edge function scrapes YouTube pages to extract captions, but YouTube returns HTTP 429 (rate limited). When this happens, it falls back to a placeholder transcript `"[Transcript unavailable]"`, which then gets passed to `analyze-lecture-cognitive-load`. The AI can't generate meaningful questions from a placeholder, so the lecture either errors out or produces useless results.

### 3. Manual Duration Estimation for URLs Is Unnecessary
For file uploads, the browser auto-detects duration via the HTML5 `<video>` element. For URLs, users must manually drag a slider to estimate duration (lines 557-576). This is a poor UX -- the system should detect duration automatically from the transcription/video metadata, or at minimum from the edge function response.

### 4. Pause Point Editor Available Before Processing
The pause point editor (lines 444-473) is accessible before the video is processed. Users can manually add/edit pause points, but these are **client-side placeholders** that are completely ignored -- the AI generates its own pause points during analysis. This is confusing and misleading.

## Fix Plan

### File 1: `src/components/instructor/PreRecordedLectureUpload.tsx`

**A. Add polling timeout (max 2 minutes)**
- Add a retry counter to the `pollStatus` function
- After ~24 retries (2 minutes at 5-second intervals), set status to `error` with message "Processing timed out. Please try again."
- Show a "Retry" button when timeout occurs

**B. Remove manual duration slider for URL mode**
- Remove the "Est. duration" slider from the URL input section (lines 557-576)
- Instead, show a brief note: "Duration will be detected automatically during processing"
- After processing completes, read `duration_seconds` from the database record and use it

**C. Hide pause point editor before processing**
- Remove the advanced pause point editor section (lines 444-473) from the pre-upload form entirely
- The AI determines optimal pause points during analysis -- pre-configuring them is misleading
- Keep the "Customize question timing" toggle and frequency slider as they control how many questions the AI generates (this is valid pre-upload configuration)
- After status becomes `ready`, show the "Calibrate Questions" button (already exists at line 593) which opens the Question Studio for editing the AI-generated pause points

**D. Handle transcription failures gracefully**
- When polling detects `status === "analyzing"` but transcript is the placeholder text, show a warning: "Captions not available for this video. AI will generate general comprehension questions."
- Add a specific error message when YouTube transcription fails

### File 2: `supabase/functions/transcribe-video/index.ts`

**A. Fix YouTube transcript extraction**
- Add the `YOUTUBE_API_KEY` (already configured in secrets) as a fallback when page scraping gets rate-limited
- Use the YouTube Data API v3 captions endpoint as primary method instead of scraping
- Keep the page-scraping approach as a fallback

**B. Return duration in the response**
- The function already saves `duration_seconds` to the database, but the frontend doesn't use it
- Ensure `durationSeconds` is always populated (from Deepgram metadata for direct URLs, from YouTube API for YouTube videos)

### File 3: `supabase/functions/analyze-lecture-cognitive-load/index.ts`

**A. Handle placeholder transcripts**
- If the transcript is the placeholder text `"[Transcript unavailable...]"`, skip AI analysis
- Set the lecture status to `ready` with 0 questions and a note that questions couldn't be generated
- This prevents the function from wasting AI tokens on a useless prompt

## Technical Details

### Polling timeout implementation
```text
let pollAttempts = 0;
const MAX_POLL_ATTEMPTS = 24; // ~2 minutes

const pollStatus = async () => {
  pollAttempts++;
  if (pollAttempts > MAX_POLL_ATTEMPTS) {
    setStatus("error");
    setErrorMessage("Processing timed out. Please try again.");
    return;
  }
  // ... existing polling logic
};
```

### YouTube API fallback for transcription
Use the YouTube Data API v3 `captions.list` endpoint with the existing `YOUTUBE_API_KEY` secret to fetch caption track IDs, then download the caption content. This is more reliable than scraping the page HTML.

### Duration auto-detection flow
```text
1. User pastes URL and clicks "Add & Process"
2. transcribe-video runs, extracts duration from:
   - Deepgram metadata (for direct video URLs)
   - YouTube API (for YouTube URLs)
   - Vimeo oEmbed API (for Vimeo URLs)
3. Duration saved to lecture_videos.duration_seconds
4. Frontend reads it during polling and uses it for display
```

## Files to Modify
1. `src/components/instructor/PreRecordedLectureUpload.tsx` -- polling timeout, remove duration slider for URLs, hide pause point editor pre-processing
2. `supabase/functions/transcribe-video/index.ts` -- YouTube API fallback, duration extraction
3. `supabase/functions/analyze-lecture-cognitive-load/index.ts` -- handle placeholder transcripts gracefully

