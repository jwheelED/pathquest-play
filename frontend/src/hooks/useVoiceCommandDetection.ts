import { useRef, useCallback } from 'react';

export type VoiceCommandType = 'send_question' | 'send_slide_question' | null;

interface VoiceCommandDetectionOptions {
  cooldownMs?: number;
  onCommandDetected?: (type: VoiceCommandType) => void;
}

// Voice command patterns
const SEND_QUESTION_PATTERNS = [
  /send\s+(the\s+|a\s+|this\s+)?question(\s+now)?/i,
  /question\s+now/i,
  /send\s+now/i,
];

const SEND_SLIDE_PATTERNS = [
  /send\s+(this\s+)?slide(\s+question)?(\s+now)?/i,
  /send\s+slide\s+question/i,
  /slide\s+question\s+now/i,
  /send\s+this\s+slide/i,
  /this\s+slide\s+question/i,
];

// Fuzzy matching helper - calculates similarity ratio
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  // Simple character match ratio
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  
  return matches / longer.length;
}

// Fuzzy phrase detection for common voice recognition errors
const FUZZY_SEND_QUESTION_PHRASES = [
  'send question',
  'send the question',
  'send a question',
  'question now',
  'send now',
];

const FUZZY_SEND_SLIDE_PHRASES = [
  'send slide',
  'send slide question',
  'send this slide',
  'slide question',
  'this slide question',
  'send the slide',
];

export function useVoiceCommandDetection(options: VoiceCommandDetectionOptions = {}) {
  const { cooldownMs = 5000, onCommandDetected } = options;
  
  const lastCommandTimeRef = useRef<number>(0);
  const lastCheckedIndexRef = useRef<number>(0);
  const lastDetectedCommandRef = useRef<string>('');
  
  const detectCommand = useCallback((text: string): VoiceCommandType => {
    if (!text || text.length < 5) return null;
    
    const normalizedText = text.toLowerCase().trim();
    
    // Check cooldown
    const now = Date.now();
    if (now - lastCommandTimeRef.current < cooldownMs) {
      return null;
    }
    
    // Check for "send slide" commands FIRST (more specific)
    for (const pattern of SEND_SLIDE_PATTERNS) {
      if (pattern.test(normalizedText)) {
        lastCommandTimeRef.current = now;
        return 'send_slide_question';
      }
    }
    
    // Fuzzy matching for slide commands
    for (const phrase of FUZZY_SEND_SLIDE_PHRASES) {
      if (normalizedText.includes(phrase) || calculateSimilarity(normalizedText, phrase) > 0.85) {
        lastCommandTimeRef.current = now;
        return 'send_slide_question';
      }
    }
    
    // Check for "send question" commands (less specific, check second)
    for (const pattern of SEND_QUESTION_PATTERNS) {
      if (pattern.test(normalizedText)) {
        lastCommandTimeRef.current = now;
        return 'send_question';
      }
    }
    
    // Fuzzy matching for question commands
    for (const phrase of FUZZY_SEND_QUESTION_PHRASES) {
      if (normalizedText.includes(phrase) || calculateSimilarity(normalizedText, phrase) > 0.85) {
        lastCommandTimeRef.current = now;
        return 'send_question';
      }
    }
    
    return null;
  }, [cooldownMs]);
  
  const checkTranscriptForCommand = useCallback((transcriptChunks: string[]): VoiceCommandType => {
    if (transcriptChunks.length === 0) return null;
    
    // Only check chunks we haven't processed yet
    const startIndex = lastCheckedIndexRef.current;
    if (startIndex >= transcriptChunks.length) return null;
    
    // Get only new chunks since last check
    const newChunks = transcriptChunks.slice(startIndex);
    const newText = newChunks.join(' ');
    
    // Update the last checked index
    lastCheckedIndexRef.current = transcriptChunks.length;
    
    // Skip if this text contains the same command phrase we just detected
    if (lastDetectedCommandRef.current && newText.toLowerCase().includes(lastDetectedCommandRef.current)) {
      return null;
    }
    
    const command = detectCommand(newText);
    
    if (command && onCommandDetected) {
      // Store a portion of the phrase that triggered the command to prevent re-detection
      lastDetectedCommandRef.current = newText.toLowerCase().substring(0, 50);
      onCommandDetected(command);
    }
    
    return command;
  }, [detectCommand, onCommandDetected]);
  
  const resetCooldown = useCallback(() => {
    lastCommandTimeRef.current = 0;
    lastCheckedIndexRef.current = 0;
    lastDetectedCommandRef.current = '';
  }, []);
  
  return {
    detectCommand,
    checkTranscriptForCommand,
    resetCooldown,
  };
}
