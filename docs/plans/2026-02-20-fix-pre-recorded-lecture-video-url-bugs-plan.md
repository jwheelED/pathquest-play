---
title: "Fix Pre-Recorded Lecture Video URL Support & Missing Edge Functions"
type: fix
status: completed
date: 2026-02-20
---

# Fix Pre-Recorded Lecture Video URL Support & Missing Edge Functions

## Overview

The pre-recorded lecture feature is broken when using video URLs. The root cause is that **two critical edge functions don't exist** (`transcribe-video` and `analyze-lecture-cognitive-load`), and the student-facing video URL resolution has a bug. Additionally, YouTube/Vimeo URLs won't play because the player only uses a `<video>` tag.

## Problem Statement

When an instructor pastes a video URL and clicks "Add & Process Lecture":
1. The lecture record is created successfully in `lecture_videos`
2. `supabase.functions.invoke("transcribe-video")` is called — **but this edge function doesn't exist**
3. Supabase returns a non-2xx status → error: "Transcription failed: Edge Function returned a non-2xx status code"

### Bugs Identified (5 total)

| # | Bug | File | Line | Severity |
|---|-----|------|------|----------|
| 1 | **`transcribe-video` edge function doesn't exist** | `PreRecordedLectureUpload.tsx` | 258 | **Critical** — blocks all lecture processing |
| 2 | **`analyze-lecture-cognitive-load` edge function doesn't exist** | `PreRecordedLectureUpload.tsx` | 284, `LectureVideoManager.tsx` 166 | **Critical** — blocks question generation |
| 3 | **Student view doesn't resolve external video URLs** | `InteractiveLecture.tsx` | 157-172 | **High** — students can't watch URL-based lectures |
| 4 | **Player uses `<video>` tag for YouTube/Vimeo** | `InteractiveLecturePlayer.tsx` | 767 | **High** — YouTube/Vimeo URLs won't render |
| 5 | **3 more edge functions missing** (remediation flow) | `InteractiveLecturePlayer.tsx` | 548, 562; `PreRecordedLectureGrades.tsx` 197 | **Medium** — remediation & grade summaries broken |

### Bug Details

**Bug 1 & 2: Missing Edge Functions (Root Cause)**
The frontend calls two edge functions that were never created:
- `transcribe-video` — should extract audio from video URL, send to Deepgram for transcription, save transcript to `lecture_videos.transcript`, update status to `analyzing`
- `analyze-lecture-cognitive-load` — should analyze transcript with AI, generate pause points with questions, save to `lecture_pause_points`, update status to `ready`

**Bug 3: Student Video URL Resolution**
`InteractiveLecture.tsx:157-172` always calls `supabase.storage.createSignedUrl()` even for external URLs (where `video_path` is `external-{timestamp}`). Compare with the instructor preview (`InstructorLecturePreview.tsx:100-110`) which correctly checks:
```typescript
if (lectureData.video_path && !lectureData.video_path.startsWith('external-')) {
  // get signed URL from storage
} else if (lectureData.video_url) {
  setVideoUrl(lectureData.video_url);
}
```

**Bug 4: No YouTube/Vimeo Embed Support**
`InteractiveLecturePlayer.tsx:767` renders `<video src={videoUrl}>` for all URLs. YouTube/Vimeo URLs need an `<iframe>` embed instead.

**Bug 5: Additional Missing Edge Functions**
These don't block the core flow but break secondary features:
- `detect-misconception` — called when student answers incorrectly
- `generate-remediation` — generates personalized review content
- `generate-lecture-grades-summary` — AI summary of class performance

## Proposed Solution

### Phase 1: Create Missing Edge Functions (Critical)

#### 1a. `transcribe-video` Edge Function
Create `supabase/functions/transcribe-video/index.ts`:
- Accept `{ lectureVideoId, videoPath }`
- For external URLs: fetch the `video_url` from the `lecture_videos` record
- For uploaded files: get a signed URL from Supabase storage
- **Transcription approach**: Use Deepgram's API (already configured — `DEEPGRAM_API_KEY` exists in env) with their URL-based transcription endpoint
- For YouTube/Vimeo URLs: Use RapidAPI or a service to extract direct audio URL, OR use Deepgram's URL transcription if the URL is a direct media link
- Save transcript to `lecture_videos.transcript`
- Update status from `processing` → `analyzing`
- Follow existing edge function patterns (CORS headers, auth, Lovable API gateway)

**Key decision**: For YouTube URLs, Deepgram can't transcribe them directly. Options:
1. Use YouTube transcript API (RapidAPI) to fetch existing captions — simplest
2. Download audio server-side and send to Deepgram — more complex
3. For YouTube/Vimeo, skip transcription and use a different AI approach

**Recommended**: Option 1 for YouTube (captions are usually available), Option 2 as fallback, direct Deepgram URL transcription for MP4/WebM links.

#### 1b. `analyze-lecture-cognitive-load` Edge Function
Create `supabase/functions/analyze-lecture-cognitive-load/index.ts`:
- Accept `{ lectureVideoId, transcript, smartMode?, questionCount?, professorType, examStyle? }`
- Use AI (via Lovable AI Gateway, like existing functions) to:
  - Analyze transcript for key concepts and cognitive load peaks
  - Generate pause points with questions at optimal timestamps
  - Create both MCQ and short-answer questions
- Save results to `lecture_pause_points` table
- Update `lecture_videos.status` → `ready`
- Update `lecture_videos.question_count` and `lecture_videos.duration_seconds`

### Phase 2: Fix Student Video URL Resolution

In `InteractiveLecture.tsx`, replace the video URL resolution logic (lines 157-172) to match the pattern from `InstructorLecturePreview.tsx`:

```typescript
// Get video URL - handle external URLs vs uploaded files
if (lectureData.video_path && !lectureData.video_path.startsWith('external-')) {
  const { data: signedUrl, error: urlError } = await supabase.storage
    .from('lecture-videos')
    .createSignedUrl(lectureData.video_path, 3600);
  if (!urlError && signedUrl) {
    setVideoUrl(signedUrl.signedUrl);
  }
} else if (lectureData.video_url) {
  setVideoUrl(lectureData.video_url);
}
```

Also add `video_url` to the `LectureVideo` interface.

### Phase 3: Add YouTube/Vimeo Embed Support

In `InteractiveLecturePlayer.tsx`, detect YouTube/Vimeo URLs and render an `<iframe>` instead of `<video>`:

```typescript
const getVideoType = (url: string): 'youtube' | 'vimeo' | 'direct' => {
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  if (/vimeo\.com/.test(url)) return 'vimeo';
  return 'direct';
};

const getEmbedUrl = (url: string, type: 'youtube' | 'vimeo'): string => {
  if (type === 'youtube') {
    const match = url.match(/(?:v=|youtu\.be\/)([^&?]+)/);
    return match ? `https://www.youtube.com/embed/${match[1]}?enablejsapi=1` : url;
  }
  if (type === 'vimeo') {
    const match = url.match(/vimeo\.com\/(\d+)/);
    return match ? `https://player.vimeo.com/video/${match[1]}` : url;
  }
  return url;
};
```

**Important limitation**: YouTube/Vimeo iframes have limited `timeupdate` control. For the pause-point system to work:
- Direct video URLs: full pause-point integration with `<video>` tag (existing behavior)
- YouTube/Vimeo: embed with manual timestamp-based pause points using the YouTube IFrame API / Vimeo Player SDK

### Phase 4: Create Remaining Edge Functions (Medium Priority)

Create stub implementations for:
- `detect-misconception` — AI analyzes incorrect answer to identify the student's misconception
- `generate-remediation` — generates explanation and follow-up question based on misconception
- `generate-lecture-grades-summary` — summarizes class performance for instructor dashboard

These follow the same pattern as `auto-grade-short-answer` (auth, CORS, Lovable AI Gateway).

## Acceptance Criteria

### Critical (Must Fix)
- [x] Pasting a direct video URL (MP4/WebM) and processing completes without errors
- [x] `transcribe-video` edge function exists and successfully transcribes video content
- [x] `analyze-lecture-cognitive-load` edge function exists and generates pause points
- [x] Lecture status progresses: `processing` → `analyzing` → `ready`
- [x] Students can watch URL-based lectures (external URL resolution works)

### High Priority
- [x] YouTube URLs render as embedded players
- [x] Vimeo URLs render as embedded players
- [x] Pause points still trigger at correct timestamps for direct video URLs
- [x] YouTube/Vimeo lectures display with a reasonable pause-point experience

### Medium Priority
- [x] `detect-misconception` edge function works for incorrect answers
- [x] `generate-remediation` edge function provides review content
- [x] `generate-lecture-grades-summary` generates instructor summaries
- [x] Error states are handled gracefully (no silent failures)

## Technical Considerations

- **Deepgram API**: Already configured (`DEEPGRAM_API_KEY` in env). Supports URL-based transcription for direct video links.
- **YouTube transcription**: YouTube doesn't expose raw audio. Need RapidAPI YouTube Transcript endpoint or similar to fetch captions.
- **AI Gateway**: Existing functions use `https://ai.gateway.lovable.dev/v1/chat/completions` with `LOVABLE_API_KEY`.
- **Edge function pattern**: All functions follow the same structure — CORS headers, auth check, Supabase client creation, input validation, AI call, response.
- **YouTube IFrame API**: For pause-point integration with YouTube embeds, we'd need the YouTube IFrame Player API to control playback programmatically.

## Files to Create/Modify

### New Files
- `supabase/functions/transcribe-video/index.ts` — Core transcription function
- `supabase/functions/analyze-lecture-cognitive-load/index.ts` — AI question generation
- `supabase/functions/detect-misconception/index.ts` — Misconception analysis
- `supabase/functions/generate-remediation/index.ts` — Remediation content
- `supabase/functions/generate-lecture-grades-summary/index.ts` — Grade summaries

### Modified Files
- `src/pages/InteractiveLecture.tsx` — Fix external URL resolution (lines 157-172), add `video_url` to interface
- `src/components/student/InteractiveLecturePlayer.tsx` — Add YouTube/Vimeo embed detection and rendering
- `src/pages/InstructorLecturePreview.tsx` — Add `video_url` to `LectureVideo` interface (consistency)

## Dependencies & Risks

- **DEEPGRAM_API_KEY** must be set in Supabase Edge Function secrets
- **LOVABLE_API_KEY** must be set (already used by other functions)
- **YouTube transcription** may require a RapidAPI key or alternative approach if captions aren't available
- **YouTube IFrame API** integration adds complexity to the player — may scope this as a follow-up
- **Rate limits** on Deepgram/AI gateway could cause failures on long lectures

## References

- Existing edge function pattern: `supabase/functions/auto-grade-short-answer/index.ts`
- Instructor preview URL handling: `src/pages/InstructorLecturePreview.tsx:100-110`
- Health check with Deepgram key: `supabase/functions/health-check/index.ts:53`
- Deepgram streaming lib: `src/lib/deepgramStreaming.ts`
