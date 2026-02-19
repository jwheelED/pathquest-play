# CLAUDE.md - Edvana Project Memory

## Tech Stack
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions in Deno/TypeScript)
- **AI:** OpenAI & Google Gemini via Lovable AI Gateway
- **Transcription:** Deepgram (real-time speech-to-text)
- **Build/Run:** `bun install && bun run dev` (Port 8080)

## Architecture & Logic
- **Server State:** Use TanStack Query for all Supabase queries/mutations.
- **AI Logic:** Heavy processing/LLM calls MUST be in `supabase/functions`.
- **Styling:** Use Tailwind utility classes. Follow the established shadcn/ui theme.
- **A11y:** All components must pass basic screen-reader checks (use `src/components/accessibility`).

## Project Structure
- `src/pages/`: Route-level views.
- `src/components/`: Split by role (instructor, student, admin, mobile).
- `src/components/ui/`: shadcn/ui primitives. **READ ONLY.**
- `src/integrations/supabase/`: Client and auto-generated types.
- `supabase/functions/`: Deno Edge Functions for AI and backend logic.

## Critical Rules
- **DO NOT EDIT:** `src/integrations/supabase/types.ts`, `supabase/migrations/`, `package-lock.json`.
- **Type Safety:** No `any` keyword. Use strict null checks.
- **Supabase Client:** Use `import { supabase } from "@/integrations/supabase/client"`.
- **Testing:** Run `bun test` (if applicable) before proposing a PR.
- **Environment:** Use Bun for all package management and script execution.