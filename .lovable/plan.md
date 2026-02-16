

## Plan: Auto-Parse Materials on Tab Load

### What Changes

Remove the manual "Parse All" button and parsed/not-parsed status indicators. Instead, automatically parse any unparsed materials silently in the background whenever the instructor opens the Materials tab.

### Changes to `src/components/instructor/LectureMaterialsUpload.tsx`

1. **Remove the "Parse All" button and related UI** (lines 329-342): Delete the button and the `parseAllMaterials` function (lines 215-242). Remove the `parsing` state variable and the `RefreshCw` icon import.

2. **Remove parsed status indicators** (line 355): Remove the `parsed_text ? ' Parsed' : ' Not parsed'` text from the material list items.

3. **Add a `useEffect` that auto-parses on load**: After the `materials` query resolves, run a `useEffect` that filters for unparsed materials (where `parsed_text` is falsy) and parses them in the background -- no toast, no spinner, just silent background work. Use a `useRef` flag to prevent re-running on every render.

4. **Keep the existing auto-parse on new upload** (lines 94-108): This stays as-is since new uploads already auto-parse.

### Technical Detail

The new `useEffect` will:
- Depend on `materials` data
- Use a `ref` to track which material IDs have already been queued for parsing (to avoid duplicate calls)
- Loop through unparsed materials, invoke `parse-lecture-material`, save the result to the DB, and invalidate the query cache
- Run silently with only `console.log` output -- no user-facing loading states

### Files Modified
- `src/components/instructor/LectureMaterialsUpload.tsx` -- remove Parse All button/status, add auto-parse useEffect
