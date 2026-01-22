/**
 * Transcript Sanitizer - Detects and filters Deepgram hallucination patterns
 * 
 * Common hallucinations include repetitive phrases, YouTube-style filler,
 * and nonsensical looping when processing math/technical speech.
 */

// Common Deepgram hallucination patterns to filter
const HALLUCINATION_PATTERNS = [
  /you'?re in the right place/gi,
  /i'?m saying that'?s a bad thing/gi,
  /thank you for watching/gi,
  /please subscribe/gi,
  /click the bell/gi,
  /don'?t forget to like/gi,
  /hit that subscribe/gi,
  /welcome back to/gi,
  /(.{5,30})\1{3,}/gi,  // Any phrase repeated 3+ times
];

/**
 * Check if a transcript appears to be a hallucination
 */
export function isHallucination(text: string): boolean {
  if (!text || text.length < 10) return false;
  
  const trimmed = text.trim().toLowerCase();
  
  // Check against known hallucination patterns
  for (const pattern of HALLUCINATION_PATTERNS) {
    pattern.lastIndex = 0; // Reset regex state
    if (pattern.test(trimmed)) {
      return true;
    }
  }
  
  // Check for excessive word repetition
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  if (words.length > 8) {
    const wordCount = new Map<string, number>();
    words.forEach(w => wordCount.set(w, (wordCount.get(w) || 0) + 1));
    
    // If any single word (longer than 3 chars) is more than 40% of the text, likely hallucination
    for (const [word, count] of wordCount) {
      if (word.length > 3 && count / words.length > 0.4) {
        console.warn(`🚫 Excessive repetition detected: "${word}" appears ${count}/${words.length} times`);
        return true;
      }
    }
    
    // Check unique word ratio - too few unique words suggests hallucination
    const uniqueRatio = wordCount.size / words.length;
    if (uniqueRatio < 0.25) {
      console.warn(`🚫 Low unique word ratio: ${(uniqueRatio * 100).toFixed(0)}%`);
      return true;
    }
  }
  
  return false;
}

/**
 * Sanitize a transcript by filtering out hallucinations
 * Returns empty string if hallucination detected, otherwise returns the original text
 */
export function sanitizeTranscript(text: string): string {
  if (!text) return '';
  
  if (isHallucination(text)) {
    console.warn('🚫 Hallucination detected and filtered:', text.substring(0, 60));
    return '';
  }
  
  return text;
}

/**
 * Check if transcript has low confidence (likely garbled/hallucinated)
 * Threshold: 0.7 (70% confidence)
 */
export function isLowConfidence(confidence: number): boolean {
  return confidence < 0.7;
}
