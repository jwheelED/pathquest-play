/**
 * Content Quality Analysis Utilities
 * Validates transcript quality for question generation
 */

export interface ContentQualityMetrics {
  wordCount: number;
  wordsPerMinute: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  hasQuestionWords: boolean;
  contentDensity: number; // 0-1 score
  isPause: boolean;
  isQualityContent: boolean;
}

// Common question words for detection
const QUESTION_WORDS = [
  'what', 'how', 'why', 'when', 'where', 'who', 'which', 'whose', 'whom',
  'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does', 'will'
];

// Filler words that indicate low content quality
const FILLER_WORDS = [
  'um', 'uh', 'like', 'you know', 'i mean', 'basically', 'literally',
  'actually', 'just', 'really', 'very', 'quite', 'sort of', 'kind of'
];

/**
 * Calculate words per minute based on transcript and duration
 */
export const calculateWordsPerMinute = (text: string, durationSeconds: number): number => {
  const wordCount = text.trim().split(/\s+/).length;
  const minutes = durationSeconds / 60;
  return minutes > 0 ? Math.round(wordCount / minutes) : 0;
};

/**
 * Calculate content density (quality metric)
 * Higher score = more substantive content
 */
export const calculateContentDensity = (text: string): number => {
  const words = text.toLowerCase().split(/\s+/);
  const totalWords = words.length;
  
  if (totalWords === 0) return 0;
  
  // Count filler words
  let fillerCount = 0;
  words.forEach(word => {
    if (FILLER_WORDS.some(filler => word.includes(filler))) {
      fillerCount++;
    }
  });
  
  // Count unique words (vocabulary richness)
  const uniqueWords = new Set(words).size;
  const uniquenessRatio = uniqueWords / totalWords;
  
  // Calculate density score (0-1)
  const fillerRatio = fillerCount / totalWords;
  const density = (1 - fillerRatio) * uniquenessRatio;
  
  return Math.min(1, Math.max(0, density));
};

/**
 * Detect if transcript segment is a pause (low content)
 */
export const isPauseDetected = (text: string, durationSeconds: number): boolean => {
  const wpm = calculateWordsPerMinute(text, durationSeconds);
  const density = calculateContentDensity(text);
  
  // Pause indicators (adjusted for teaching context):
  // - Very slow speech (< 50 WPM) - teachers pause for emphasis
  // - Low content density (< 0.3)
  // - Very short content (< 5 words)
  const wordCount = text.trim().split(/\s+/).length;
  
  return wpm < 50 || density < 0.3 || wordCount < 5;
};

/**
 * Check if text contains question words
 */
export const hasQuestionWords = (text: string): boolean => {
  const lowerText = text.toLowerCase();
  return QUESTION_WORDS.some(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(lowerText);
  });
};

/**
 * Count sentences in text
 */
export const countSentences = (text: string): number => {
  // Split by sentence endings
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  return sentences.length;
};

/**
 * Comprehensive content quality analysis
 */
export const analyzeContentQuality = (
  text: string,
  durationSeconds: number = 60
): ContentQualityMetrics => {
  const wordCount = text.trim().split(/\s+/).length;
  const sentenceCount = countSentences(text);
  const wpm = calculateWordsPerMinute(text, durationSeconds);
  const density = calculateContentDensity(text);
  const hasQuestions = hasQuestionWords(text);
  const pause = isPauseDetected(text, durationSeconds);
  
  const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : 0;
  
  // Quality criteria (adjusted for teaching context):
  // - Not a pause
  // - Density > 0.4 (substantive educational content)
  // - At least 25 words (allow slightly shorter teaching segments)
  // - WPM between 80-250 (teaching pace is slower for clarity)
  const isQuality = 
    !pause &&
    density > 0.4 &&
    wordCount >= 25 &&
    wpm >= 80 &&
    wpm <= 250;
  
  return {
    wordCount,
    wordsPerMinute: wpm,
    sentenceCount,
    avgWordsPerSentence,
    hasQuestionWords: hasQuestions,
    contentDensity: density,
    isPause: pause,
    isQualityContent: isQuality
  };
};

/**
 * Sliding window analysis for auto-question timing
 * Returns the best window index for question generation
 */
export const findBestQuestionWindow = (
  transcriptWindows: string[],
  windowDurationSeconds: number = 60
): number => {
  let bestWindowIndex = -1;
  let bestScore = 0;
  
  transcriptWindows.forEach((window, index) => {
    const metrics = analyzeContentQuality(window, windowDurationSeconds);
    
    // Score based on multiple factors (weighted for lecture context)
    const score =
      (metrics.isQualityContent ? 1.0 : 0) +
      (metrics.contentDensity * 0.5) +
      (metrics.hasQuestionWords ? 0.4 : 0) + // Higher weight - questions are key in lectures
      (metrics.wordCount > 50 ? 0.2 : 0);
    
    if (score > bestScore) {
      bestScore = score;
      bestWindowIndex = index;
    }
  });
  
  return bestWindowIndex;
};

/**
 * Detect topic changes in transcript (for smart auto-question timing)
 */
export const detectTopicChange = (
  previousSegment: string,
  currentSegment: string
): boolean => {
  // Simple topic change detection based on vocabulary overlap
  const getPrimaryWords = (text: string): Set<string> => {
    const words = text.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4) // Only substantial words
      .filter(w => !FILLER_WORDS.includes(w));
    return new Set(words);
  };
  
  const prevWords = getPrimaryWords(previousSegment);
  const currWords = getPrimaryWords(currentSegment);
  
  // Calculate overlap
  const intersection = new Set([...prevWords].filter(w => currWords.has(w)));
  const overlapRatio = prevWords.size > 0 
    ? intersection.size / prevWords.size 
    : 0;
  
  // Topic changed if overlap is low (< 30%)
  return overlapRatio < 0.3 && prevWords.size > 5;
};
