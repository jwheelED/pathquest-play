

# Make Question Difficulty Actually Work Everywhere

## Problem
The difficulty setting (Easy/Medium/Hard) only works for slide-extracted questions. The two most-used question paths -- auto-generated interval questions and voice command questions -- completely ignore the difficulty preference.

## What Changes

### 1. Update `generate-interval-question` edge function
- Accept `difficulty_preference` from the request body (already passed as `format_preference` pattern)
- Add difficulty-specific prompt instructions identical to the ones already working in `extract-slide-question`:
  - **Easy**: "basic recall, simple definitions, straightforward facts"
  - **Medium**: "understanding and application of concepts"
  - **Hard**: "analysis, synthesis, evaluation, connecting multiple concepts"
- Inject the difficulty instruction into the system prompt alongside existing format instructions

### 2. Update `extract-voice-command-question` edge function
- Fetch `question_difficulty_preference` from the instructor's profile (alongside the existing `question_format_preference` fetch)
- Add difficulty instructions to the system prompt so extracted questions are phrased at the appropriate complexity level

### 3. Update the frontend caller for interval questions
- Find where `generate-interval-question` is invoked and pass the instructor's `question_difficulty_preference` from their profile in the request body

### 4. Fix the build error (bonus)
- The `parse-lecture-material` function has a broken `npm:jszip` import that needs to be changed to use the `esm.sh` CDN pattern used by all other edge functions

## Technical Details

### Edge function prompt addition (reusing existing pattern from `extract-slide-question`)
The following difficulty instructions will be injected into the AI system prompt for both interval and voice functions:

```text
easy: "Generate an EASY question: focus on basic recall, simple definitions, or straightforward facts. The answer should be directly stated in the lecture content."
medium: "Generate a MEDIUM difficulty question: require understanding and application of concepts. Students should need to think about the content, not just recall it."
hard: "Generate a HARD question: require analysis, synthesis, or evaluation. Students should connect multiple concepts or apply knowledge to new situations."
```

### Files to modify
1. `supabase/functions/generate-interval-question/index.ts` -- add difficulty parameter and prompt logic
2. `supabase/functions/extract-voice-command-question/index.ts` -- fetch difficulty from profile and add to prompt
3. Frontend component that calls `generate-interval-question` (likely in `AutoQuestionDashboard` or `LectureTranscription`) -- pass `difficulty_preference` in the request
4. `supabase/functions/parse-lecture-material/index.ts` -- fix jszip import

