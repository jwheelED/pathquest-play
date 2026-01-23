import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { ArrowRight, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const StickyCtaBar = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      // Show after scrolling 50% of the page
      const scrollPercentage = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
      setIsVisible(scrollPercentage > 50 && !isDismissed);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isDismissed]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 transform transition-transform duration-500 animate-slide-up">
      <div className="bg-card/95 backdrop-blur-xl border-t border-border/50 shadow-xl">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm md:text-base font-semibold text-foreground">
                Ready to transform your classroom?
              </p>
              <p className="text-xs md:text-sm text-muted-foreground">
                Join thousands of instructors using Edvana
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => navigate('/instructor/auth')}
                className="rounded-full gap-2"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4" />
              </Button>
              <button
                onClick={() => setIsDismissed(true)}
                className="p-2 hover:bg-muted rounded-full transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
