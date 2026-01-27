

# Fix: Compress Slide Images to Prevent "Failed to Fetch" Errors

## Problem Identified

The "failed to send a request to the Edge Function" error is **NOT caused by Supabase maintenance**. The root cause is:

1. **Slide images are too large** - The `SlideViewer` component exports full-resolution PNG images using `canvas.toDataURL('image/png')` with no compression
2. **Base64 encoding inflates size further** - A 2MB image becomes ~2.67MB as base64
3. **Request body exceeds limits** - Supabase Edge Functions have HTTP body limits, and browsers will fail to send oversized requests
4. **Network error occurs** - The browser shows "Failed to fetch" before the request even reaches the edge function

Evidence from the logs:
- The edge function logs show "booted" and "shutdown" but **never show any request processing** - meaning the request never arrived
- The network request shows `Error: Failed to fetch` status
- The request body contained an extremely large base64 string (truncated in logs)

## Solution

Modify the `getSlideImage()` function in `SlideViewer.tsx` to:
1. **Use JPEG format** instead of PNG (typically 5-10x smaller for slides)
2. **Apply compression** with quality setting (0.7-0.8 provides good balance)
3. **Resize if necessary** to cap maximum dimensions at 1920px

---

## Implementation Details

### File: `src/components/instructor/slides/SlideViewer.tsx`

#### Change 1: Update `getSlideImage()` method (lines 64-86)

**Current code:**
```typescript
getSlideImage: (selection?: SelectionRect) => {
  const canvas = canvasRef.current;
  if (!canvas) return null;
  
  const sel = selection || activeSelection;
  if (sel && sel.width > 10 && sel.height > 10) {
    // Create a temp canvas with just the selected region
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sel.width;
    tempCanvas.height = sel.height;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(
      canvas,
      sel.x, sel.y, sel.width, sel.height,
      0, 0, sel.width, sel.height
    );
    return tempCanvas.toDataURL('image/png');  // ❌ Large PNG
  }
  
  return canvas.toDataURL('image/png');  // ❌ Large PNG
},
```

**Fixed code:**
```typescript
getSlideImage: (selection?: SelectionRect) => {
  const canvas = canvasRef.current;
  if (!canvas) return null;
  
  const sel = selection || activeSelection;
  let sourceCanvas = canvas;
  
  // If there's a selection, crop to that region first
  if (sel && sel.width > 10 && sel.height > 10) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sel.width;
    tempCanvas.height = sel.height;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(
      canvas,
      sel.x, sel.y, sel.width, sel.height,
      0, 0, sel.width, sel.height
    );
    sourceCanvas = tempCanvas;
  }
  
  // Resize if too large (max 1920px on longest side)
  const MAX_DIMENSION = 1920;
  let finalCanvas = sourceCanvas;
  
  if (sourceCanvas.width > MAX_DIMENSION || sourceCanvas.height > MAX_DIMENSION) {
    const scale = Math.min(
      MAX_DIMENSION / sourceCanvas.width,
      MAX_DIMENSION / sourceCanvas.height
    );
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = Math.round(sourceCanvas.width * scale);
    resizedCanvas.height = Math.round(sourceCanvas.height * scale);
    const ctx = resizedCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(sourceCanvas, 0, 0, resizedCanvas.width, resizedCanvas.height);
      finalCanvas = resizedCanvas;
    }
  }
  
  // Export as compressed JPEG (0.75 quality = good balance of size/quality)
  // This typically reduces file size by 80-90% compared to PNG
  return finalCanvas.toDataURL('image/jpeg', 0.75);
},
```

---

## Expected Results

| Metric | Before (PNG) | After (JPEG 0.75) |
|--------|-------------|-------------------|
| Typical slide image size | 5-15 MB | 200-500 KB |
| Base64 string length | 7-20 million chars | 300-700K chars |
| Request success rate | Fails for most slides | Works reliably |
| Image quality | Lossless | Excellent (barely noticeable) |

## Why This Fix Works

1. **JPEG is much smaller than PNG** for photographic/complex content like slides with gradients, images, and text
2. **0.75 quality is sufficient** for OCR - the AI can still read text and analyze charts perfectly
3. **Resizing to 1920px max** ensures even 4K displays don't produce oversized images
4. **No edge function changes needed** - the function already accepts any image format (it just looks at the data URL prefix)

## Files to Modify

| File | Change |
|------|--------|
| `src/components/instructor/slides/SlideViewer.tsx` | Update `getSlideImage()` to use JPEG compression and optional resizing |

