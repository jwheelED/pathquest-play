

# Plan: PPTX Conversion Progress & Gating

## Problem
When a PPTX file is uploaded with "Preserve animations" enabled, the bottom bar in the Slide Presenter just shows a spinning "Converting for extraction..." with no indication of how long it will take or how far along it is.

## Solution: Stage-Based Progress Bar + Optional Gating

### Approach
Since CloudConvert doesn't provide granular percentage progress, we'll implement **stage-based progress tracking**. The edge function will update a `pdf_conversion_progress` field in the database as it moves through each stage, and the PptxViewer will poll and display this as an estimated progress bar.

### Conversion Stages & Estimated Progress

| Stage | Progress | Description |
|-------|----------|-------------|
| pending | 0% | Queued for conversion |
| downloading | 10% | Downloading PPTX from storage |
| uploading_to_converter | 30% | Uploading to CloudConvert |
| converting | 50% | CloudConvert processing (longest step) |
| downloading_pdf | 75% | Downloading converted PDF |
| uploading_pdf | 90% | Uploading PDF to Supabase storage |
| completed | 100% | Done |
| failed | -- | Error state |

### Files to Modify

**1. Edge Function: `supabase/functions/convert-pptx-background/index.ts`**
- Add database updates at each stage to set both `pdf_conversion_status` (existing field) and a descriptive status message
- Use the existing `pdf_conversion_status` field with more granular values (e.g., `processing:downloading`, `processing:converting`, `processing:uploading_pdf`)
- This avoids needing a schema migration for a new column

**2. PptxViewer: `src/components/instructor/slides/PptxViewer.tsx`**
- Replace the static "Converting for extraction..." text with a progress bar and stage label
- The existing 5-second polling already fetches `pdf_conversion_status` -- parse the sub-stage from it
- Map each sub-stage to a percentage and display using the existing `Progress` UI component
- Show estimated time remaining based on typical conversion durations

### Visual Design (Bottom Bar)

Before (current):
```
[spinner] Converting for extraction...
```

After:
```
[progress bar 50%] Converting... (uploading to converter)
```

When complete:
```
[checkmark] Extraction ready | [slide selector controls]
```

### Gating Option
The plan does NOT block the instructor from opening the PPTX while converting, since the PowerPoint itself loads fine via Office Online -- only the slide extraction feature depends on the PDF. Blocking would unnecessarily delay the instructor from starting their lecture. Instead, the progress bar provides clear feedback about when extraction will be available.

## Technical Details

### Edge Function Changes
Update `pdf_conversion_status` at each stage using sub-status format:

```typescript
// Stage: downloading PPTX
await supabase.from('lecture_materials')
  .update({ pdf_conversion_status: 'processing:downloading' })
  .eq('id', materialId);

// Stage: uploading to CloudConvert  
await supabase.from('lecture_materials')
  .update({ pdf_conversion_status: 'processing:uploading_to_converter' })
  .eq('id', materialId);

// Stage: converting
await supabase.from('lecture_materials')
  .update({ pdf_conversion_status: 'processing:converting' })
  .eq('id', materialId);

// Stage: downloading PDF
await supabase.from('lecture_materials')
  .update({ pdf_conversion_status: 'processing:downloading_pdf' })
  .eq('id', materialId);

// Stage: uploading PDF to storage
await supabase.from('lecture_materials')
  .update({ pdf_conversion_status: 'processing:uploading_pdf' })
  .eq('id', materialId);
```

### PptxViewer Progress Mapping

```typescript
const getConversionProgress = (status: string | null): { percent: number; label: string } => {
  if (!status) return { percent: 0, label: '' };
  if (status === 'pending') return { percent: 5, label: 'Queued...' };
  if (status === 'processing') return { percent: 15, label: 'Starting...' };
  if (status === 'processing:downloading') return { percent: 15, label: 'Downloading file...' };
  if (status === 'processing:uploading_to_converter') return { percent: 30, label: 'Preparing conversion...' };
  if (status === 'processing:converting') return { percent: 50, label: 'Converting slides...' };
  if (status === 'processing:downloading_pdf') return { percent: 75, label: 'Finalizing...' };
  if (status === 'processing:uploading_pdf') return { percent: 90, label: 'Almost done...' };
  if (status === 'completed') return { percent: 100, label: 'Ready' };
  return { percent: 0, label: 'Error' };
};
```

### No Schema Migration Needed
The existing `pdf_conversion_status` text column already supports arbitrary string values. The sub-stage format (`processing:stage_name`) is backward-compatible -- the PptxViewer's existing check `status === 'pending' || status === 'processing'` will still match via `status?.startsWith('processing')`.

### Polling Adjustment
Reduce polling interval from 5 seconds to 3 seconds during active conversion for more responsive progress updates.

