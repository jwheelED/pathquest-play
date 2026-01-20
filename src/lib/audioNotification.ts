// Simple audio notification utility using Web Audio API
let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
};

/**
 * Play a simple notification sound using oscillator
 * Creates a pleasant two-tone notification sound
 */
export const playNotificationSound = async () => {
  try {
    const ctx = getAudioContext();
    
    // Resume context if suspended (required for autoplay policies)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Create a pleasant two-tone notification
    const playTone = (frequency: number, startTime: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      
      // Envelope for smooth sound
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playTone(800, now, 0.15); // First tone
    playTone(1000, now + 0.15, 0.15); // Second tone (higher pitch)
    
  } catch (error) {
    console.error('Error playing notification sound:', error);
  }
};
