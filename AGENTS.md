# AGENTS.md

- Gemini model IDs and the default reasoning effort for edge functions live only in `supabase/functions/_shared/models.ts`; import from there instead of hard-coding model strings, so a model upgrade is a one-line change.
- Calls on thinking Gemini models send `reasoning_effort` (low by default for live-session latency) and no `max_tokens`, because thinking tokens count against the output cap and can truncate replies.
