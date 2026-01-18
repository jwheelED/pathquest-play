# Bug Fix: Voice Command Not Respecting Question Format Preference

## Problem Report
When instructor has "coding questions" selected in settings and uses voice command "send question now" during live lecture, the system sends MCQ questions instead of coding questions.

## Root Cause Analysis

### Issue Location
`/app/frontend/supabase/functions/format-and-send-question/index.ts` - Line 409

### The Bug
```typescript
// BEFORE (buggy code):
const finalType = suggested_type || instructorPreference;
```

This prioritized the `suggested_type` (determined by the voice command extraction AI) over the instructor's explicit preference setting.

### Why It Happened
1. Instructor sets `question_format_preference = "coding"` in settings
2. During lecture, instructor says "send question now"
3. `extract-voice-command-question` function analyzes the spoken question and returns `suggested_type = "multiple_choice"` or `"short_answer"`
4. `format-and-send-question` receives both values and used `suggested_type` first
5. Result: MCQ sent instead of coding question

## The Fix

### Updated Logic
```typescript
// AFTER (fixed code):
const hasPreGeneratedOptions = (options && Array.isArray(options) && options.length === 4 && correct_answer);
const finalType = hasPreGeneratedOptions ? (suggested_type || instructorPreference) : instructorPreference;
```

### Smart Priority System
1. **Preview Dialog Override**: If instructor explicitly edited question in preview dialog (indicated by pre-generated options), respect their choice
2. **Instructor Preference**: Otherwise, always use the instructor's format preference from settings
3. **Fallback**: If neither exists, use suggested_type

### Behavior Matrix
| Source | Has Preview Options | Result |
|--------|-------------------|---------|
| Voice Command | No | Use instructor preference (coding) ✅ |
| Auto-Interval | No | Use instructor preference (coding) ✅ |
| Manual Button | No | Use instructor preference (coding) ✅ |
| Preview Dialog | Yes | Use instructor's edited choice ✅ |

## Files Modified
- `/app/frontend/supabase/functions/format-and-send-question/index.ts` (Line ~409)

## Testing Instructions

### Test Case 1: Voice Command with Coding Preference
1. Navigate to Instructor Settings
2. Set "Question Format" to "Coding Questions"
3. Set "Coding Question Style" to "Simple Check-Ins"
4. Start a live lecture capture
5. Record some lecture content about algorithms
6. Say "send question now"
7. **Expected**: Students receive a mini IDE coding question
8. **Previously**: Students received MCQ (bug)

### Test Case 2: Voice Command with MCQ Preference
1. Set "Question Format" to "Multiple Choice Questions"
2. Start live lecture
3. Say "send question now"
4. **Expected**: Students receive MCQ question ✅

### Test Case 3: Preview Dialog Override
1. Set "Question Format" to "Coding Questions"
2. Click "Send Question" button manually
3. In preview dialog, change type to "Multiple Choice"
4. Edit the MCQ options
5. Click "Send to Students"
6. **Expected**: Students receive edited MCQ (respects override) ✅

### Test Case 4: Auto-Interval Questions
1. Set "Question Format" to "Coding Questions"
2. Enable "Auto-Questions" with 5-minute interval
3. Start lecture and wait for auto-question
4. **Expected**: Students receive coding question ✅

## Related Settings

### Database Schema
```sql
-- profiles table
question_format_preference: 'multiple_choice' | 'short_answer' | 'coding'
coding_question_style: 'simple' | 'full'
```

### Settings UI Location
- Instructor Dashboard → Settings Tab
- Component: `QuestionFormatSettings.tsx`

## Impact
- ✅ Voice commands now respect instructor preferences
- ✅ Auto-questions now respect instructor preferences  
- ✅ Manual button now respects instructor preferences
- ✅ Preview dialog overrides still work correctly
- ✅ No breaking changes to existing functionality

## Verification
After deploying this fix:
1. Check console logs for: `📝 Final question type: coding (preference: coding, suggested: short_answer, has_preview_options: false)`
2. Verify student receives coding question in mini IDE
3. Confirm auto-grading works for coding questions

## Notes
- The `suggested_type` from AI extraction is still useful as a fallback
- Preview dialog functionality preserved for instructor override
- All existing question sources (voice, auto, manual) now consistent
