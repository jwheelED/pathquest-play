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
  const typingRipplesRef = useRef<Array<{ x: number; y: number; progress: number; radius: number; intensity: number }>>([]);
  const colorsRef = useRef({ primary: '', destructive: '' });
  const cursorTrailRef = useRef<Array<{ x: number; y: number; age: number }>>([]);
  
  const [streak, setStreak] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);

  // Get CSS variable colors and convert to canvas-compatible format
  const getCSSColor = useCallback((hslString: string, opacity: number = 1): string => {
    // Parse HSL string like "240 5.9% 10%" to rgb
    const [h, s, l] = hslString.split(' ').map(v => parseFloat(v));
    
    // Convert HSL to RGB for canvas
    const sNorm = s / 100;
    const lNorm = l / 100;
    
    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
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

  // Initialize colors from CSS variables
  useEffect(() => {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    
    colorsRef.current = {
      primary: styles.getPropertyValue('--primary').trim(),
      destructive: styles.getPropertyValue('--destructive').trim()
    };
  }, []);

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
    gradient.addColorStop(0, getCSSColor(colorsRef.current.primary, 0.2));
    gradient.addColorStop(0.5, getCSSColor(colorsRef.current.primary, 0.1));
    gradient.addColorStop(1, getCSSColor(colorsRef.current.primary, 0.05));
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

      ctx.strokeStyle = getCSSColor(colorsRef.current.primary, opacity);
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
      const particleGradient = ctx.createRadialGradient(
        particle.x, particle.y, 0,
        particle.x, particle.y, 8
      );
      particleGradient.addColorStop(0, getCSSColor(colorsRef.current.primary, 0.6));
      particleGradient.addColorStop(1, getCSSColor(colorsRef.current.primary, 0));
      
      ctx.fillStyle = particleGradient;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw ripple effect (for wrong answers)
    if (rippleRef.current.active) {
      rippleRef.current.progress += 0.05;
      rippleRef.current.radius += 8;
      
      const opacity = Math.max(0, 1 - rippleRef.current.progress);
      ctx.strokeStyle = getCSSColor(colorsRef.current.destructive, opacity * 0.4);
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

    // Draw typing ripples with variable intensity
    typingRipplesRef.current = typingRipplesRef.current.filter(ripple => {
      // Adjust growth rate based on intensity
      const growthRate = 0.03 + (ripple.intensity * 0.02); // 0.03-0.05
      const radiusGrowth = 3 + (ripple.intensity * 2); // 3-5 pixels per frame
      
      ripple.progress += growthRate;
      ripple.radius += radiusGrowth;
      
      // Adjust opacity based on intensity
      const baseOpacity = 0.15 + (ripple.intensity * 0.1); // 0.15-0.25 max opacity
      const opacity = Math.max(0, baseOpacity * (1 - ripple.progress));
      
      if (opacity > 0) {
        // Main ripple ring
        ctx.strokeStyle = getCSSColor(colorsRef.current.primary, opacity);
        ctx.lineWidth = 1 + (ripple.intensity * 0.5); // 1-1.5 line width
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Second ripple ring with adjusted spacing
        const ringSpacing = 5 + (ripple.intensity * 3); // 5-8 pixels
        ctx.strokeStyle = getCSSColor(colorsRef.current.primary, opacity * 0.5);
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, ripple.radius + ringSpacing, 0, Math.PI * 2);
        ctx.stroke();
        
        // Optional: Add third ring for very fast typing
        if (ripple.intensity > 0.7) {
          ctx.strokeStyle = getCSSColor(colorsRef.current.primary, opacity * 0.3);
          ctx.beginPath();
          ctx.arc(ripple.x, ripple.y, ripple.radius + ringSpacing * 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      
      return ripple.progress < 1;
    });

    // Draw cursor glow and trail
    if (mouse.isOver) {
      // Update cursor trail
      cursorTrailRef.current.forEach(trail => {
        trail.age += 0.1;
      });
      cursorTrailRef.current = cursorTrailRef.current.filter(trail => trail.age < 1);

      // Draw cursor trail particles
      cursorTrailRef.current.forEach(trail => {
        const opacity = (1 - trail.age) * 0.4;
        const size = 12 * (1 - trail.age * 0.5);
        
        const trailGradient = ctx.createRadialGradient(
          trail.x, trail.y, 0,
          trail.x, trail.y, size
        );
        trailGradient.addColorStop(0, getCSSColor(colorsRef.current.primary, opacity * 0.8));
        trailGradient.addColorStop(0.5, getCSSColor(colorsRef.current.primary, opacity * 0.4));
        trailGradient.addColorStop(1, getCSSColor(colorsRef.current.primary, 0));
        
        ctx.fillStyle = trailGradient;
        ctx.beginPath();
        ctx.arc(trail.x, trail.y, size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw main cursor glow
      const glowSize = 20 + Math.sin(timeRef.current * 3) * 3;
      const cursorGradient = ctx.createRadialGradient(
        mouse.x, mouse.y, 0,
        mouse.x, mouse.y, glowSize
      );
      cursorGradient.addColorStop(0, getCSSColor(colorsRef.current.primary, 0.5));
      cursorGradient.addColorStop(0.4, getCSSColor(colorsRef.current.primary, 0.3));
      cursorGradient.addColorStop(1, getCSSColor(colorsRef.current.primary, 0));
      
      ctx.fillStyle = cursorGradient;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, glowSize, 0, Math.PI * 2);
      ctx.fill();

      // Draw cursor core
      ctx.fillStyle = getCSSColor(colorsRef.current.primary, 0.8);
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 3, 0, Math.PI * 2);
      ctx.fill();
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

    const handleTyping = (event: CustomEvent) => {
      const { x, y, speed = 0 } = event.detail;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const canvasRect = canvas.getBoundingClientRect();
      
      // Convert screen coordinates to canvas coordinates
      const canvasX = x - canvasRect.left;
      const canvasY = y - canvasRect.top;
      
      // Calculate intensity based on typing speed
      // Speed ranges: 0-2 CPS = slow, 2-5 CPS = medium, 5+ CPS = fast
      const normalizedSpeed = Math.min(speed / 5, 1); // Clamp to 0-1
      const intensity = 0.3 + (normalizedSpeed * 0.7); // Range: 0.3-1.0
      
      // Performance limit: keep only 20 most recent ripples
      if (typingRipplesRef.current.length > 20) {
        typingRipplesRef.current.shift();
      }
      
      // Add new typing ripple with intensity
      typingRipplesRef.current.push({
        x: canvasX,
        y: canvasY,
        progress: 0,
        radius: 10 + (intensity * 15), // 10-25 initial radius
        intensity: intensity
      });
    };

    window.addEventListener('flowstate:answer' as any, handleAnswerResult);
    window.addEventListener('flowstate:typing' as any, handleTyping);
    
    return () => {
      window.removeEventListener('flowstate:answer' as any, handleAnswerResult);
      window.removeEventListener('flowstate:typing' as any, handleTyping);
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
    const newX = e.clientX - rect.left;
    const newY = e.clientY - rect.top;
    
    mouseRef.current = {
      x: newX,
      y: newY,
      isOver: true
    };

    // Add to cursor trail (throttle to every few pixels of movement)
    const lastTrail = cursorTrailRef.current[cursorTrailRef.current.length - 1];
    if (!lastTrail || Math.hypot(newX - lastTrail.x, newY - lastTrail.y) > 8) {
      cursorTrailRef.current.push({ x: newX, y: newY, age: 0 });
      
      // Keep trail at reasonable length
      if (cursorTrailRef.current.length > 15) {
        cursorTrailRef.current.shift();
      }
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    mouseRef.current.isOver = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current.isOver = false;
  }, []);

  return (
    <Card className="pixel-corners overflow-hidden bg-card border-2 border-primary/30">
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
