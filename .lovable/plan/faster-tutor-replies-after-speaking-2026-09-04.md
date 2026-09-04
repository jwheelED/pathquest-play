# Faster tutor replies after speaking

Right now, after you stop talking, four things happen strictly one after another before you hear anything back: your audio is uploaded and transcribed, the tutor is asked for a reply, the reply is saved to the database and the whole session is re-read, and only then is the spoken audio generated and fully downloaded. Every one of those waits stacks up, so a slow step anywhere makes the whole pause feel long. There is also nothing that ends the recording when you stop speaking — the clip only ends when you tap the mic again (or after 90 seconds).

## What will change

1. **Stop waiting on the save before speaking.** Once the tutor's reply arrives, start generating and playing the voice immediately, and save the board step and transcript in the background. This removes several database round-trips from the wait.
2. **Start playing audio as it arrives** instead of downloading the whole voice clip first.
3. **Make the tutor step itself faster.** Pin a specific fast model instead of the automatic "pick any model" routing, and cut the reply length budget down (replies are 1–2 sentences, so a large budget only invites slow, long generations). Reduce the repeat-on-bad-output attempts from 3 to 2 so a bad response fails fast instead of tripling the wait.
4. **Skip the transcription round-trip when possible.** The on-device live transcript already shows your words while you speak; when it captured something usable, send that straight to the tutor and skip the separate upload-and-transcribe step. Fall back to the existing transcription service when the browser has no live text (e.g. Firefox) or the text looks empty.
5. **Auto-end the clip on silence** (about 1.5 seconds of quiet) so the turn is sent the moment you finish, rather than waiting for a tap.
6. **Show where the time goes.** Add timing marks per stage (listen, tutor, voice) in the developer console so any remaining slowness can be pinned to one stage instead of guessed at.

## Technical notes

- `src/wb/pages/WbLiveSession.tsx` — `processVoiceTurn`: run `finalizeTurn` without awaiting it before the TTS call; move stage timing marks around each await; use `liveSpeech` final text as the primary transcript with `wb-transcribe` as the fallback path; add a silence-based auto-stop using a `WebAudio` analyser on the mic stream alongside the existing 90s cap.
- `supabase/functions/wb-tutor-turn/index.ts` — lower `maxTokens` from 1500 to ~350.
- `supabase/functions/_shared/llm.ts` — reduce the `llmJson` retry loop from 3 to 2 attempts; keep the existing lenient parsing.
- Model selection stays env-driven (`WB_LLM_MODEL`); the plan sets an explicit fast default instead of `openrouter/auto`.
- `src/wb/pages/WbLiveSession.tsx` audio playback: set `audio.src` to the object URL and call `play()` on `canplay` rather than after the full blob resolves; keep the existing tap-to-play fallback.
- No new AI provider, no Lovable AI Gateway usage, no schema changes.
