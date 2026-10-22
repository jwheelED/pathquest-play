# AGENTS.md

- AI model IDs (Gemini, Groq) and the default reasoning effort for edge functions live only in `supabase/functions/_shared/models.ts`; import from there instead of hard-coding model strings, so a model upgrade is a one-line change.
- Calls on thinking Gemini models send `reasoning_effort` (low by default for live-session latency) and no `max_tokens`, because thinking tokens count against the output cap and can truncate replies.
- Live question detection defaults to the pause-based AI scanner (`scan-transcript-questions` + `useLlmQuestionScanner`), which returns the question and answer data in one call; regex detection only surfaces candidates while AI scans are failing, so detection quality doesn't depend on brittle word rules.
- The question scanner calls Groq directly (JSON mode, short timeout) and falls back to the gateway's flash-lite model without reasoning, because scan latency decides how fast questions reach On Deck; a missing or failing Groq key must never stop detection.
