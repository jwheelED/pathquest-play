

# Add YouTube URL Support to Pre-Recorded Lectures

## Overview

Enable instructors to paste a YouTube URL as an alternative to uploading a video file. The YouTube URL path will reuse the existing `transcribe-video` (which already handles YouTube transcript extraction) and `analyze-lecture-cognitive-load` edge functions, so question generation works identically.

This also fixes 4 existing build errors in `transcribe-video` and `upload-to-cloudinary`.

## What Changes

### 1. Fix Build Errors (prerequisite)

**`supabase/functions/transcribe-video/index.ts` (line 194)**
- The `captions` variable can be `undefined` but `fetchCaptionTracksData` requires `Record<string, unknown>`. Add a null guard before the call.

**`supabase/functions/upload-to-cloudinary/index.ts` (lines 17, 22, 111)**
- Deno's strict typing requires explicit `ArrayBuffer` casts for `crypto.subtle` APIs. Fix by casting `Uint8Array` to `ArrayBuffer` where needed using `.buffer as ArrayBuffer`.

### 2. Add YouTube URL Input to Upload UI

**`src/components/instructor/PreRecordedLectureUpload.tsx`**

- Change `UploadMode` type from `"file"` to `"file" | "url"`
- Add a toggle/tab to switch between "Upload File" and "Paste YouTube URL"
- Add a URL input field (shown when mode is `"url"`)
- Add `videoUrl` state to hold the pasted URL
- Validate the URL using the existing `isValidVideoUrl` helper
- When in URL mode, estimate duration at 600s (default) since we can't detect it client-side; the backend will fetch the real duration via YouTube Data API

### 3. Add URL Upload Handler

**`src/components/instructor/PreRecordedLectureUpload.tsx`**

Add a `handleUrlUpload` function that:
1. Validates the YouTube URL
2. Creates a `lecture_videos` record with `video_path: "external-{timestamp}"` and `video_url: <the URL>`
3. Calls `transcribe-video` edge function with `{ lectureVideoId, videoPath: "external-..." }` -- the existing edge function already detects external paths and fetches the `video_url` from the DB to extract YouTube transcripts
4. Polls for transcript completion, then triggers `analyze-lecture-cognitive-load` -- identical to the file upload flow
5. The existing polling logic is reused as-is

Update the main submit button to call `handleUrlUpload` when in URL mode.

### 4. Update Submit Button State

Adjust the disabled logic so the button is enabled when either:
- A file is selected (file mode), OR
- A valid URL is entered (URL mode)

Update button text to say "Add & Process Lecture" in URL mode.

## Technical Details

```text
+------------------+       +-------------------+       +---------------------------+
| Upload UI        |       | transcribe-video  |       | analyze-lecture-cognitive  |
| (file OR url)    | ----> | (already handles  | ----> | -load (unchanged)         |
|                  |       |  YouTube URLs)    |       |                           |
+------------------+       +-------------------+       +---------------------------+
```

- The `transcribe-video` edge function already checks if `video_path` starts with `external-`, then reads `video_url` from the DB and extracts YouTube captions via Innertube API with fallbacks. No changes needed there (besides the type fix).
- The `analyze-lecture-cognitive-load` function is unchanged -- it receives transcript text and generates pause-point questions regardless of video source.
- YouTube duration is already fetched by `transcribe-video` via the YouTube Data API and saved to `duration_seconds`.

## Files Modified

| File | Change |
|------|--------|
| `src/components/instructor/PreRecordedLectureUpload.tsx` | Add URL mode toggle, URL input, URL upload handler |
| `supabase/functions/transcribe-video/index.ts` | Fix TS2345: null guard on `captions` before calling `fetchCaptionTracksData` |
| `supabase/functions/upload-to-cloudinary/index.ts` | Fix TS2345/TS2769: cast `Uint8Array` buffers to `ArrayBuffer` for crypto APIs |

