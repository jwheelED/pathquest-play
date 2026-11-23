# Ungraded short answers shown as live themes

## What changes
When **short-answer auto-grade is off**, live short answers aren't graded. They show up on the instructor's side like a poll, grouped by AI into themes.

- **Students:** they type and submit as usual, then see only **"Answer received"**. No grade, no correct or incorrect, no points.
- **Instructor:** the question shows a **themes view** instead of a correct/incorrect view. You get 3–6 named themes, like "Mentions photosynthesis" or "Confuses mass and weight". Each theme shows a count, a bar and a few sample answers you can expand. Answers that don't fit a theme go under "Other".
- **Live refresh:** themes regroup automatically as answers arrive, about every 5 new answers or every 15 seconds, whichever comes first. Before the first grouping, the raw answers show.
- **Saved:** after the session, the same themes appear in Session Results and past sessions.
- **When auto-grade is on:** nothing changes from today.

## Decisions taken (tell me if any is wrong)
1. The setting is captured **when the question is sent**. Flipping the toggle mid-question doesn't change how that question's answers are handled.
2. This covers **short answer only**. Coding questions keep their current behavior.
3. Ungraded answers **don't affect accuracy, XP or the confidence charts**, and the confidence picker is hidden for them.
4. In a student's own history (Results tab), the answer shows as "Not graded, shared with instructor".
5. Themes are visible to the instructor only. Students never see them, and names in samples are hidden.

## Edge cases
- **Fewer than 3 answers:** list them without grouping.
- **AI grouping fails or is slow:** keep the last good themes, or the raw list, and retry on the next refresh. Answers are never lost.
- **Late answers after the session ends:** a final regroup runs once when you open results.

## Technical details
- `format-and-send-question`: read `profiles.auto_grade_short_answer` and stamp `question_content.ungraded = true` on short-answer questions when it is off.
- `submit-live-response/handler.ts`: if `ungraded`, skip the grader and store `is_correct = null`, `points = 0`, `ai_grade = null`. Return `{ ungraded: true }`. Add a test.
- New table `live_question_themes` (question_id unique, themes jsonb `[{label, count, response_ids, samples}]`, response_count, updated_at). Instructor-of-session read only; server writes. Add Realtime.
- New edge function `group-live-answers` (instructor JWT, verifies session ownership). It is single-flight: it skips if stored `response_count` equals the current count or an update ran less than 10 seconds ago. One AI call with strict JSON output, at most 200 answers, using the project's standard Gemini Flash model from `_shared/models.ts`. It is triggered from the instructor dashboard on new responses (debounced), never from student devices.
- UI: new `LiveAnswerThemes` component used in the live dashboard question card, `LiveSessionResults` and `PastLiveSessions`. Student `FeedbackCard` gets an "Answer received" branch when `ungraded`. Analytics exclude rows where `is_correct` is null.
