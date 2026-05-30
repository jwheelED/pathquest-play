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

/**
 * Edvana "Mastery Chime" — a soft, glassy 3-note arpeggio used when a
 * participant answers correctly. Tier scales gain + adds a sparkle.
 */
export const playMasteryChime = async (tier: 'soft' | 'lift' | 'soar' = 'soft') => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();

    const master = ctx.createGain();
    const peak = tier === 'soar' ? 0.22 : tier === 'lift' ? 0.16 : 0.11;
    master.gain.value = peak;
    master.connect(ctx.destination);

    // Subtle low-pass for softness
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4200;
    lp.Q.value = 0.6;
    lp.connect(master);

    // Edvana chord: E5 (659.25), B5 (987.77), E6 (1318.51) — emerald-toned 5ths
    const notes = [659.25, 987.77, 1318.51];
    const now = ctx.currentTime;

    notes.forEach((freq, i) => {
      const start = now + i * 0.075;
      const dur = 0.9;

      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      og.gain.setValueAtTime(0, start);
      og.gain.linearRampToValueAtTime(0.9, start + 0.02);
      og.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(og);
      og.connect(lp);
      osc.start(start);
      osc.stop(start + dur + 0.05);

      // Soft sine overtone for shimmer
      const ot = ctx.createOscillator();
      const otg = ctx.createGain();
      ot.type = 'sine';
      ot.frequency.value = freq * 2;
      otg.gain.setValueAtTime(0, start);
      otg.gain.linearRampToValueAtTime(0.2, start + 0.03);
      otg.gain.exponentialRampToValueAtTime(0.001, start + dur * 0.7);
      ot.connect(otg);
      otg.connect(lp);
      ot.start(start);
      ot.stop(start + dur);
    });

    // Sparkle for higher tiers
    if (tier !== 'soft') {
      const sparkleStart = now + 0.28;
      const s = ctx.createOscillator();
      const sg = ctx.createGain();
      s.type = 'triangle';
      s.frequency.setValueAtTime(2637, sparkleStart); // E7
      s.frequency.exponentialRampToValueAtTime(3520, sparkleStart + 0.35);
      sg.gain.setValueAtTime(0, sparkleStart);
      sg.gain.linearRampToValueAtTime(tier === 'soar' ? 0.18 : 0.1, sparkleStart + 0.04);
      sg.gain.exponentialRampToValueAtTime(0.001, sparkleStart + 0.6);
      s.connect(sg);
      sg.connect(lp);
      s.start(sparkleStart);
      s.stop(sparkleStart + 0.65);
    }
  } catch (e) {
    console.error('Mastery chime error:', e);
  }
};

/**
 * Edvana "Reflect Tone" — a low, kind two-note descent used when a
 * participant answers incorrectly. Never harsh; signals reflection.
 */
export const playReflectTone = async () => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0.12;
    master.connect(ctx.destination);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    lp.connect(master);

    // A3 -> E3, slow soft fall
    const tones = [220, 164.81];
    const now = ctx.currentTime;
    tones.forEach((freq, i) => {
      const start = now + i * 0.18;
      const dur = 0.9;
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      og.gain.setValueAtTime(0, start);
      og.gain.linearRampToValueAtTime(0.9, start + 0.05);
      og.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(og);
      og.connect(lp);
      osc.start(start);
      osc.stop(start + dur);
    });
  } catch (e) {
    console.error('Reflect tone error:', e);
  }
};
