import { useEffect, useRef, useState, useCallback } from "react";
import { Sparkles, Flame, CheckCircle2 } from "lucide-react";

interface FlowStateCardProps {
  userId: string;
  instructorId?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
}

export function FlowStateCard({ userId, instructorId }: FlowStateCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const mouseRef = useRef({ x: 0, y: 0, isOver: false });
  const particlesRef = useRef<Particle[]>([]);
  const timeRef = useRef(0);
  const pulseScaleRef = useRef(1);
  const rippleRef = useRef({ active: false, progress: 0, radius: 0 });
  const typingRipplesRef = useRef<Array<{ x: number; y: number; progress: number; radius: number; intensity: number }>>([]);
  const colorsRef = useRef({ primary: "", secondary: "", accent: "" });
  const cursorTrailRef = useRef<Array<{ x: number; y: number; age: number }>>([]);

  const [streak, setStreak] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);

  const getCSSColor = useCallback((hslString: string, opacity: number = 1): string => {
    const [h, s, l] = hslString.split(" ").map((v) => parseFloat(v));
    const sNorm = s / 100;
    const lNorm = l / 100;

    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lNorm - c / 2;

    let r = 0, g = 0, b = 0;
    if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
    else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
    else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
    else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
    else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
    else if (h >= 300 && h < 360) { r = c; g = 0; b = x; }

    const rFinal = Math.round((r + m) * 255);
    const gFinal = Math.round((g + m) * 255);
    const bFinal = Math.round((b + m) * 255);

    return `rgba(${rFinal}, ${gFinal}, ${bFinal}, ${opacity})`;
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    colorsRef.current = {
      primary: styles.getPropertyValue("--primary").trim(),
      secondary: styles.getPropertyValue("--secondary").trim(),
      accent: styles.getPropertyValue("--headspace-mint-dark").trim() || "160 45% 45%",
    };
  }, []);

  const initParticles = useCallback((width: number, height: number) => {
    const particles: Particle[] = [];
    const particleCount = Math.min(20, Math.floor((width * height) / 5000));

    for (let i = 0; i < particleCount; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      particles.push({ x, y, vx: 0, vy: 0, baseX: x, baseY: y });
    }
    particlesRef.current = particles;
  }, []);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const mouse = mouseRef.current;

    timeRef.current += 0.008;
    ctx.clearRect(0, 0, width, height);

    // Calming gradient background - Headspace style
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, getCSSColor(colorsRef.current.secondary, 0.15));
    gradient.addColorStop(0.5, getCSSColor(colorsRef.current.accent, 0.08));
    gradient.addColorStop(1, getCSSColor(colorsRef.current.secondary, 0.12));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Gentle waves at bottom - Headspace style
    const waveCount = 3;
    for (let i = 0; i < waveCount; i++) {
      ctx.beginPath();
      const baseY = height * 0.7 + i * 20;
      const amplitude = 15 + i * 5;
      const frequency = 0.006 - i * 0.001;
      const speed = 0.3 + i * 0.1;
      const opacity = 0.2 - i * 0.05;

      for (let x = 0; x <= width; x += 3) {
        const y = baseY +
          amplitude * Math.sin(x * frequency + timeRef.current * speed) +
          amplitude * 0.5 * Math.sin(x * frequency * 1.5 - timeRef.current * speed * 0.7);

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      
      const waveGradient = ctx.createLinearGradient(0, baseY - amplitude, 0, height);
      waveGradient.addColorStop(0, getCSSColor(colorsRef.current.accent, opacity));
      waveGradient.addColorStop(1, getCSSColor(colorsRef.current.secondary, opacity * 0.5));
      ctx.fillStyle = waveGradient;
      ctx.fill();
    }

    // Floating particles - calming dots
    particlesRef.current.forEach((particle) => {
      // Gentle floating motion
      particle.x = particle.baseX + Math.sin(timeRef.current + particle.baseX * 0.01) * 10;
      particle.y = particle.baseY + Math.cos(timeRef.current + particle.baseY * 0.01) * 8;

      if (mouse.isOver) {
        const dx = mouse.x - particle.x;
        const dy = mouse.y - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 100;

        if (distance < maxDistance) {
          const force = (1 - distance / maxDistance) * 0.15;
          particle.x += dx * force;
          particle.y += dy * force;
        }
      }

      const particleGradient = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, 8);
      particleGradient.addColorStop(0, getCSSColor(colorsRef.current.primary, 0.5));
      particleGradient.addColorStop(1, getCSSColor(colorsRef.current.primary, 0));

      ctx.fillStyle = particleGradient;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    // Success ripple effect
    if (rippleRef.current.active) {
      rippleRef.current.progress += 0.03;
      rippleRef.current.radius += 5;

      const opacity = Math.max(0, 1 - rippleRef.current.progress);
      ctx.strokeStyle = getCSSColor(colorsRef.current.primary, opacity * 0.4);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, rippleRef.current.radius, 0, Math.PI * 2);
      ctx.stroke();

      if (rippleRef.current.progress >= 1) {
        rippleRef.current.active = false;
        rippleRef.current.progress = 0;
        rippleRef.current.radius = 0;
      }
    }

    // Typing ripples
    typingRipplesRef.current = typingRipplesRef.current.filter((ripple) => {
      ripple.progress += 0.025;
      ripple.radius += 2;

      const opacity = Math.max(0, 0.2 * (1 - ripple.progress));

      if (opacity > 0) {
        ctx.strokeStyle = getCSSColor(colorsRef.current.secondary, opacity);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      return ripple.progress < 1;
    });

    // Cursor glow
    if (mouse.isOver) {
      const glowSize = 20 + Math.sin(timeRef.current * 2) * 3;
      const cursorGradient = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, glowSize);
      cursorGradient.addColorStop(0, getCSSColor(colorsRef.current.primary, 0.25));
      cursorGradient.addColorStop(0.5, getCSSColor(colorsRef.current.primary, 0.1));
      cursorGradient.addColorStop(1, getCSSColor(colorsRef.current.primary, 0));

      ctx.fillStyle = cursorGradient;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, glowSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Gentle pulse
    if (pulseScaleRef.current > 1) {
      pulseScaleRef.current = Math.max(1, pulseScaleRef.current - 0.01);
    } else {
      pulseScaleRef.current = 1 + Math.sin(timeRef.current * 1.2) * 0.02;
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [getCSSColor]);

  const triggerSuccessPulse = useCallback(() => {
    pulseScaleRef.current = 1.3;
    rippleRef.current = { active: true, progress: 0, radius: 20 };
    setStreak((prev) => prev + 1);
    setQuestionsAnswered((prev) => prev + 1);
  }, []);

  const triggerErrorRipple = useCallback(() => {
    setStreak(0);
    setQuestionsAnswered((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const handleAnswerResult = (event: CustomEvent) => {
      const { isCorrect } = event.detail;
      if (isCorrect) triggerSuccessPulse();
      else triggerErrorRipple();
    };

    const handleTyping = (event: CustomEvent) => {
      const { x, y, speed = 0 } = event.detail;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const canvasRect = canvas.getBoundingClientRect();
      const canvasX = x - canvasRect.left;
      const canvasY = y - canvasRect.top;
      const intensity = Math.min(speed / 5, 1);

      if (typingRipplesRef.current.length > 10) typingRipplesRef.current.shift();

      typingRipplesRef.current.push({
        x: canvasX, y: canvasY, progress: 0,
        radius: 5 + intensity * 8, intensity
      });
    };

    window.addEventListener("flowstate:answer" as any, handleAnswerResult);
    window.addEventListener("flowstate:typing" as any, handleTyping);

    return () => {
      window.removeEventListener("flowstate:answer" as any, handleAnswerResult);
      window.removeEventListener("flowstate:typing" as any, handleTyping);
    };
  }, [triggerSuccessPulse, triggerErrorRipple]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (!container) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);

      initParticles(rect.width, rect.height);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [animate, initParticles]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    mouseRef.current = { 
      x: e.clientX - rect.left, 
      y: e.clientY - rect.top, 
      isOver: true 
    };
  }, []);

  const handleMouseEnter = useCallback(() => { mouseRef.current.isOver = true; }, []);
  const handleMouseLeave = useCallback(() => { mouseRef.current.isOver = false; }, []);

  return (
    <div className="headspace-card overflow-hidden h-full">
      {/* Header */}
      <div className="p-5 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-secondary/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Flow State</h3>
            <p className="text-xs text-muted-foreground">Stay in your rhythm</p>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative w-full h-[180px] md:h-[200px]">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-pointer rounded-b-3xl"
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
        
        {/* Stats overlay - Headspace pill style */}
        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-card/90 backdrop-blur-sm shadow-md">
            <Flame className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Streak</span>
            <span className="font-bold text-foreground">{streak}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-card/90 backdrop-blur-sm shadow-md">
            <CheckCircle2 className="w-4 h-4 text-secondary" />
            <span className="text-xs text-muted-foreground">Answered</span>
            <span className="font-bold text-foreground">{questionsAnswered}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
