## Why this is happening

The transcript is being captured correctly — the screenshot proves Deepgram heard: “Who wrote the Emancipation Proclamation?”

The drop happens after transcription, in the candidate promotion path:

1. The trigger detector requires at least 6 complete words before it accepts a captured question.
2. This question is only 5 words: “Who wrote the Emancipation Proclamation?”
3. The passive fallback also uses a 6-word minimum in the live recording flow.
4. In the slide presenter/live copilot UI, trigger-captured questions correctly bypass the narrow passive allow-list. But the `useLectureRecording` hook still routes trigger-captured questions back through `checkPassiveQuestion`, which re-applies stricter filters and can drop valid natural questions.

So the system hears the question, displays it as the last chunk, but never promotes it to “Question on Deck.”

## Plan

1. **Allow short, valid WH questions**
   - Lower the minimum complete question length from 6 to 5 in the live capture configuration.
   - Keep the global safety floor at 4 words, so filler like “Any questions?” still remains blocked by the rhetorical filters.

2. **Use the vetted candidate path in `useLectureRecording`**
   - Pull `acceptVettedCandidate` from `usePassiveQuestionDetection`.
   - Route trigger-captured questions to `acceptVettedCandidate(...)` instead of `checkPassiveQuestion(...)`, matching the newer `LectureTranscription` implementation.
   - This avoids re-dropping questions that the trigger capture hook already validated.

3. **Make the question-mark fallback immediate for obvious questions**
   - For chunks ending in `?`, send them through the vetted candidate path when they have a valid interrogative trigger and meet the 5-word threshold.
   - This makes “Who wrote the Emancipation Proclamation?” show up immediately instead of waiting on silence logic.

4. **Add regression coverage**
   - Add/update tests to prove “Who wrote the Emancipation Proclamation?” is accepted.
   - Include a guard that “Any questions?” / audience-check filler is still rejected.

## Files to change

- `src/hooks/useLectureRecording.ts`
- `src/hooks/usePassiveQuestionDetection.ts` or hook configuration only, depending on the smallest safe change
- `src/__tests__/useQuestionTriggerCapture.test.ts` and/or `src/__tests__/usePassiveQuestionDetection.test.ts`