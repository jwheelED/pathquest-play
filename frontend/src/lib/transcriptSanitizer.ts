/**
 * Transcript Sanitizer - Detects and filters Deepgram hallucination patterns
 * 
 * Common hallucinations include repetitive phrases, YouTube-style filler,
 * and nonsensical looping when processing math/technical speech.
 * 
 * Enhanced with aggressive filtering for math content where Deepgram
 * tends to produce more hallucinations.
 */

// Common Deepgram hallucination patterns to filter
const HALLUCINATION_PATTERNS = [
  // YouTube/social media filler
  /you'?re in the right place/gi,
  /i'?m saying that'?s a bad thing/gi,
  /thank you for watching/gi,
  /please subscribe/gi,
  /click the bell/gi,
  /don'?t forget to like/gi,
  /hit that subscribe/gi,
  /welcome back to/gi,
  /thanks for watching/gi,
  /leave a comment/gi,
  
  // Generic phrase loops (any phrase repeated 3+ times)
  /(.{5,30})\1{3,}/gi,
  
  // Math-specific hallucination patterns
  /\bx\s+x\s+x/gi,
  /\bone\s+one\s+one/gi,
  /\btwo\s+two\s+two/gi,
  /\bthree\s+three\s+three/gi,
  /\bplus\s+plus\s+plus/gi,
  /\bminus\s+minus\s+minus/gi,
  /\btimes\s+times\s+times/gi,
  /\bequals\s+equals\s+equals/gi,
  /\bdivided\s+divided\s+divided/gi,
  
  // Observed real hallucinations
  /\bmuck\s+(of\s+the\s+muck\s*)+/gi,
  /\bveve\s*,?\s*veve/gi,
  /\bbig\s+fan\s+of\s+the\s*$/gi,
  /\bof\s+that\s*\?\s*$/gi,
  
  // Filler sound loops
  /\b(uh|um|ah|eh)\s+\1\s+\1/gi,
  
  // Nonsensical number sequences
  /(\b\d+\s+){5,}/gi,  // 5+ numbers in a row
];

// Patterns that indicate incomplete/cut-off speech
const FRAGMENT_PATTERNS = [
  /^(of|the|a|an|and|or|but|to|in|for|with|on|at)\s*$/gi,  // Just articles/prepositions
  /\s(of|the|a|an|and)\s*$/gi,  // Ending with articles
];

/**
 * Check if a transcript appears to be a hallucination
 */
export function isHallucination(text: string): boolean {
  if (!text || text.length < 5) return false;
  
  const trimmed = text.trim().toLowerCase();
  
  // Very short transcripts that are just filler words
  if (trimmed.length < 10) {
    const fillerOnly = /^(um|uh|ah|eh|hmm|mhm|okay|ok|so|and|the|a)\s*$/i;
    if (fillerOnly.test(trimmed)) {
      return true;
    }
  }
  
  // Check against known hallucination patterns
  for (const pattern of HALLUCINATION_PATTERNS) {
    pattern.lastIndex = 0; // Reset regex state
    if (pattern.test(trimmed)) {
      console.warn(`🚫 Hallucination pattern matched: "${trimmed.substring(0, 40)}..."`);
      return true;
    }
  }
  
  // Check for fragment patterns
  for (const pattern of FRAGMENT_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(trimmed)) {
      console.warn(`🚫 Fragment detected: "${trimmed}"`);
      return true;
    }
  }
  
  // Check for excessive word repetition
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  if (words.length >= 6) {
    const wordCount = new Map<string, number>();
    words.forEach(w => wordCount.set(w, (wordCount.get(w) || 0) + 1));
    
    // If any word (longer than 2 chars) appears 3+ times, likely hallucination
    for (const [word, count] of wordCount) {
      if (word.length > 2 && count >= 3) {
        console.warn(`🚫 Word "${word}" repeated ${count}x in: "${trimmed.substring(0, 40)}..."`);
        return true;
      }
    }
    
    // Check unique word ratio - stricter threshold (40% unique)
    const uniqueRatio = wordCount.size / words.length;
    if (uniqueRatio < 0.4) {
      console.warn(`🚫 Low unique word ratio (${(uniqueRatio * 100).toFixed(0)}%): "${trimmed.substring(0, 40)}..."`);
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
  
  const trimmed = text.trim();
  if (!trimmed) return '';
  
  if (isHallucination(trimmed)) {
    return '';
  }
  
  return trimmed;
}

/**
 * Check if transcript has low confidence (likely garbled/hallucinated)
 * Threshold: 0.75 (75% confidence) - stricter for math content
 */
export function isLowConfidence(confidence: number): boolean {
  return confidence < 0.75;
}

/**
 * Filter words array based on per-word confidence
 * Returns only words with confidence >= threshold
 */
export function filterLowConfidenceWords(
  words: Array<{ word: string; confidence: number; punctuated_word?: string }>,
  threshold: number = 0.6
): string {
  const confidentWords = words.filter(w => w.confidence >= threshold);
  
  // If less than 50% of words are confident, reject entire transcript
  if (words.length > 0 && confidentWords.length / words.length < 0.5) {
    console.warn(`🚫 Too many low-confidence words (${confidentWords.length}/${words.length})`);
    return '';
  }
  
  return confidentWords.map(w => w.punctuated_word || w.word).join(' ');
}
