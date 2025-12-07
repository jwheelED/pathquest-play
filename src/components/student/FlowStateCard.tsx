import { useEffect, useRef, useState, useCallback } from "react";
import { Zap } from "lucide-react";

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
  const colorsRef = useRef({ primary: "", destructive: "" });
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
      destructive: styles.getPropertyValue("--destructive").trim(),
    };
  }, []);

  const initParticles = useCallback((width: number, height: number) => {
    const particles: Particle[] = [];
    const particleCount = Math.min(15, Math.floor((width * height) / 6000));

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

    timeRef.current += 0.01;
    ctx.clearRect(0, 0, width, height);

    // Subtle gradient background
    const gradient = ctx.createRadialGradient(
      mouse.isOver ? mouse.x : width / 2,
      mouse.isOver ? mouse.y : height / 2,
      0, width / 2, height / 2, Math.max(width, height) * 0.7
    );
    gradient.addColorStop(0, getCSSColor(colorsRef.current.primary, 0.12));
    gradient.addColorStop(0.5, getCSSColor(colorsRef.current.primary, 0.06));
    gradient.addColorStop(1, getCSSColor(colorsRef.current.primary, 0.02));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Flowing waves
    const waveCount = 2;
    const baseAmplitude = height * 0.04;

    for (let i = 0; i < waveCount; i++) {
      ctx.beginPath();
      const amplitude = baseAmplitude * (1 + i * 0.3) * pulseScaleRef.current;
      const frequency = 0.008 - i * 0.001;
      const speed = 0.4 + i * 0.15;
      const offset = (i * Math.PI * 2) / waveCount;
      const opacity = 0.12 - i * 0.03;

      for (let x = 0; x <= width; x += 4) {
        const y = height / 2 +
          amplitude * Math.sin(x * frequency + timeRef.current * speed + offset) +
          amplitude * 0.4 * Math.sin(x * frequency * 2 - timeRef.current * speed * 0.6);

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.strokeStyle = getCSSColor(colorsRef.current.primary, opacity);
      ctx.lineWidth = 1.5 + i;
      ctx.stroke();
    }

    // Particles
    particlesRef.current.forEach((particle) => {
      if (mouse.isOver) {
        const dx = mouse.x - particle.x;
        const dy = mouse.y - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 120;

        if (distance < maxDistance) {
          const force = (1 - distance / maxDistance) * 0.25;
          particle.vx += dx * force * 0.01;
          particle.vy += dy * force * 0.01;
        }
      }

      const returnForce = 0.02;
      particle.vx += (particle.baseX - particle.x) * returnForce;
      particle.vy += (particle.baseY - particle.y) * returnForce;
      particle.vx *= 0.95;
      particle.vy *= 0.95;
      particle.x += particle.vx;
      particle.y += particle.vy;

      const particleGradient = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, 6);
      particleGradient.addColorStop(0, getCSSColor(colorsRef.current.primary, 0.4));
      particleGradient.addColorStop(1, getCSSColor(colorsRef.current.primary, 0));

      ctx.fillStyle = particleGradient;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 6, 0, Math.PI * 2);
      ctx.fill();
    });

    // Ripple effect
    if (rippleRef.current.active) {
      rippleRef.current.progress += 0.04;
      rippleRef.current.radius += 6;

      const opacity = Math.max(0, 1 - rippleRef.current.progress);
      ctx.strokeStyle = getCSSColor(colorsRef.current.destructive, opacity * 0.3);
      ctx.lineWidth = 2;
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
      const growthRate = 0.03 + ripple.intensity * 0.02;
      const radiusGrowth = 2 + ripple.intensity * 1.5;

      ripple.progress += growthRate;
      ripple.radius += radiusGrowth;

      const baseOpacity = 0.1 + ripple.intensity * 0.08;
      const opacity = Math.max(0, baseOpacity * (1 - ripple.progress));

      if (opacity > 0) {
        ctx.strokeStyle = getCSSColor(colorsRef.current.primary, opacity);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      return ripple.progress < 1;
    });

    // Cursor glow
    if (mouse.isOver) {
      cursorTrailRef.current.forEach((trail) => { trail.age += 0.1; });
      cursorTrailRef.current = cursorTrailRef.current.filter((trail) => trail.age < 1);

      cursorTrailRef.current.forEach((trail) => {
        const opacity = (1 - trail.age) * 0.3;
        const size = 10 * (1 - trail.age * 0.5);

        const trailGradient = ctx.createRadialGradient(trail.x, trail.y, 0, trail.x, trail.y, size);
        trailGradient.addColorStop(0, getCSSColor(colorsRef.current.primary, opacity * 0.6));
        trailGradient.addColorStop(1, getCSSColor(colorsRef.current.primary, 0));

        ctx.fillStyle = trailGradient;
        ctx.beginPath();
        ctx.arc(trail.x, trail.y, size, 0, Math.PI * 2);
        ctx.fill();
      });

      const glowSize = 16 + Math.sin(timeRef.current * 2.5) * 2;
      const cursorGradient = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, glowSize);
      cursorGradient.addColorStop(0, getCSSColor(colorsRef.current.primary, 0.35));
      cursorGradient.addColorStop(0.5, getCSSColor(colorsRef.current.primary, 0.15));
      cursorGradient.addColorStop(1, getCSSColor(colorsRef.current.primary, 0));

      ctx.fillStyle = cursorGradient;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, glowSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pulse animation
    if (pulseScaleRef.current > 1) {
      pulseScaleRef.current = Math.max(1, pulseScaleRef.current - 0.015);
    } else {
      pulseScaleRef.current = 1 + Math.sin(timeRef.current * 1.5) * 0.03;
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [getCSSColor]);

  const triggerSuccessPulse = useCallback(() => {
    pulseScaleRef.current = 1.4;
    setStreak((prev) => prev + 1);
    setQuestionsAnswered((prev) => prev + 1);

    particlesRef.current.forEach((particle) => {
      const angle = Math.random() * Math.PI * 2;
      const force = 4 + Math.random() * 4;
      particle.vx += Math.cos(angle) * force;
      particle.vy += Math.sin(angle) * force;
    });
  }, []);

  const triggerErrorRipple = useCallback(() => {
    rippleRef.current = { active: true, progress: 0, radius: 15 };
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
      const normalizedSpeed = Math.min(speed / 5, 1);
      const intensity = 0.3 + normalizedSpeed * 0.7;

      if (typingRipplesRef.current.length > 15) typingRipplesRef.current.shift();

      typingRipplesRef.current.push({
        x: canvasX, y: canvasY, progress: 0,
        radius: 8 + intensity * 12, intensity
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
    const newX = e.clientX - rect.left;
    const newY = e.clientY - rect.top;

    mouseRef.current = { x: newX, y: newY, isOver: true };

    const lastTrail = cursorTrailRef.current[cursorTrailRef.current.length - 1];
    if (!lastTrail || Math.hypot(newX - lastTrail.x, newY - lastTrail.y) > 6) {
      cursorTrailRef.current.push({ x: newX, y: newY, age: 0 });
      if (cursorTrailRef.current.length > 12) cursorTrailRef.current.shift();
    }
  }, []);

  const handleMouseEnter = useCallback(() => { mouseRef.current.isOver = true; }, []);
  const handleMouseLeave = useCallback(() => { mouseRef.current.isOver = false; }, []);

  return (
    <div className="bento-card overflow-hidden h-full">
      <div className="p-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Flow State</h3>
            <p className="text-xs text-muted-foreground">Stay in rhythm</p>
          </div>
        </div>
      </div>
      <div className="relative w-full h-[200px] md:h-[220px]">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-pointer"
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
        {/* Stats overlay */}
        <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end pointer-events-none">
          <div className="stat-pill text-xs bg-card/80 backdrop-blur-sm">
            <span className="text-muted-foreground">Streak:</span>
            <span className="font-semibold text-foreground">{streak}</span>
          </div>
          <div className="stat-pill text-xs bg-card/80 backdrop-blur-sm">
            <span className="text-muted-foreground">Answered:</span>
            <span className="font-semibold text-foreground">{questionsAnswered}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
