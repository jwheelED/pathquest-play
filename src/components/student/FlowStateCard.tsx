import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap } from "lucide-react";

interface FlowStateCardProps {
  userId: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
}

export function FlowStateCard({ userId }: FlowStateCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const mouseRef = useRef({ x: 0, y: 0, isOver: false });
  const particlesRef = useRef<Particle[]>([]);
  const timeRef = useRef(0);
  const pulseScaleRef = useRef(1);
  const rippleRef = useRef({ active: false, progress: 0, radius: 0 });
  
  const [streak, setStreak] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);

  // Initialize particles
  const initParticles = useCallback((width: number, height: number) => {
    const particles: Particle[] = [];
    const particleCount = Math.min(20, Math.floor((width * height) / 5000)); // Responsive particle count
    
    for (let i = 0; i < particleCount; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        baseX: x,
        baseY: y
      });
    }
    
    particlesRef.current = particles;
  }, []);

  // Easing functions
  const easeOutBack = (x: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  };

  // Animation loop
  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const mouse = mouseRef.current;
    
    timeRef.current += 0.01;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw gradient background
    const gradient = ctx.createRadialGradient(
      mouse.isOver ? mouse.x : width / 2,
      mouse.isOver ? mouse.y : height / 2,
      0,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.7
    );
    gradient.addColorStop(0, 'hsl(var(--primary) / 0.2)');
    gradient.addColorStop(0.5, 'hsl(var(--primary) / 0.1)');
    gradient.addColorStop(1, 'hsl(var(--primary) / 0.05)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw flowing waves
    const waveCount = 3;
    const baseAmplitude = height * 0.05;
    
    for (let i = 0; i < waveCount; i++) {
      ctx.beginPath();
      const amplitude = baseAmplitude * (1 + i * 0.3) * pulseScaleRef.current;
      const frequency = 0.01 - i * 0.001;
      const speed = 0.5 + i * 0.2;
      const offset = (i * Math.PI * 2) / waveCount;
      const opacity = 0.15 - i * 0.03;

      for (let x = 0; x <= width; x += 5) {
        const y = height / 2 + 
          amplitude * Math.sin(x * frequency + timeRef.current * speed + offset) +
          amplitude * 0.5 * Math.sin(x * frequency * 2 - timeRef.current * speed * 0.7);
        
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.strokeStyle = `hsl(var(--primary) / ${opacity})`;
      ctx.lineWidth = 2 + i;
      ctx.stroke();
    }

    // Update and draw particles with magnetic effect
    particlesRef.current.forEach((particle, index) => {
      if (mouse.isOver) {
        // Magnetic attraction
        const dx = mouse.x - particle.x;
        const dy = mouse.y - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 150;
        
        if (distance < maxDistance) {
          const force = (1 - distance / maxDistance) * 0.3;
          particle.vx += dx * force * 0.01;
          particle.vy += dy * force * 0.01;
        }
      }

      // Return to base position
      const returnForce = 0.02;
      particle.vx += (particle.baseX - particle.x) * returnForce;
      particle.vy += (particle.baseY - particle.y) * returnForce;

      // Apply friction
      particle.vx *= 0.95;
      particle.vy *= 0.95;

      // Update position
      particle.x += particle.vx;
      particle.y += particle.vy;

      // Draw particle
      const gradient = ctx.createRadialGradient(
        particle.x, particle.y, 0,
        particle.x, particle.y, 8
      );
      gradient.addColorStop(0, `hsl(var(--primary) / 0.6)`);
      gradient.addColorStop(1, `hsl(var(--primary) / 0)`);
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw ripple effect (for wrong answers)
    if (rippleRef.current.active) {
      rippleRef.current.progress += 0.05;
      rippleRef.current.radius += 8;
      
      const opacity = Math.max(0, 1 - rippleRef.current.progress);
      ctx.strokeStyle = `hsl(var(--destructive) / ${opacity * 0.4})`;
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

    // Pulse animation (baseline + success boost)
    if (pulseScaleRef.current > 1) {
      pulseScaleRef.current = Math.max(1, pulseScaleRef.current - 0.02);
    } else {
      // Baseline gentle pulse
      pulseScaleRef.current = 1 + Math.sin(timeRef.current * 2) * 0.05;
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  // Trigger success pulse animation
  const triggerSuccessPulse = useCallback(() => {
    pulseScaleRef.current = 1.5;
    setStreak(prev => prev + 1);
    setQuestionsAnswered(prev => prev + 1);
    
    // Particle burst effect
    particlesRef.current.forEach(particle => {
      const angle = Math.random() * Math.PI * 2;
      const force = 5 + Math.random() * 5;
      particle.vx += Math.cos(angle) * force;
      particle.vy += Math.sin(angle) * force;
    });
  }, []);

  // Trigger error ripple animation
  const triggerErrorRipple = useCallback(() => {
    rippleRef.current = { active: true, progress: 0, radius: 20 };
    setStreak(0);
    setQuestionsAnswered(prev => prev + 1);
  }, []);

  // Expose methods to parent via window event listeners
  useEffect(() => {
    const handleAnswerResult = (event: CustomEvent) => {
      const { isCorrect } = event.detail;
      if (isCorrect) {
        triggerSuccessPulse();
      } else {
        triggerErrorRipple();
      }
    };

    window.addEventListener('flowstate:answer' as any, handleAnswerResult);
    
    return () => {
      window.removeEventListener('flowstate:answer' as any, handleAnswerResult);
    };
  }, [triggerSuccessPulse, triggerErrorRipple]);

  // Canvas setup and animation
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
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }

      initParticles(rect.width, rect.height);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Start animation
    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [animate, initParticles]);

  // Mouse tracking
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

  const handleMouseEnter = useCallback(() => {
    mouseRef.current.isOver = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current.isOver = false;
  }, []);

  return (
    <Card className="pixel-corners overflow-hidden bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Your Flow State
        </CardTitle>
        <CardDescription>Stay in rhythm with today's lecture</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative w-full h-[300px] md:h-[350px]">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{ touchAction: 'none' }}
          />
          
          {/* Stats overlay */}
          <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
            <div className="bg-background/80 backdrop-blur-sm px-4 py-2 rounded-lg pixel-corners border border-border/50">
              <div className="text-xs text-muted-foreground">Current Streak</div>
              <div className="text-2xl font-bold text-primary">{streak}</div>
            </div>
            
            <div className="bg-background/80 backdrop-blur-sm px-4 py-2 rounded-lg pixel-corners border border-border/50">
              <div className="text-xs text-muted-foreground">Questions Today</div>
              <div className="text-2xl font-bold">{questionsAnswered}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
