import { BookOpen, Upload, Users, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PathEmptyStateProps {
  onUpload: () => void;
  onJoinClass: () => void;
}

export function PathEmptyState({ onUpload, onJoinClass }: PathEmptyStateProps) {
  return (
    <div className="path-card p-8 text-center space-y-8">
      {/* Hero illustration */}
      <div className="relative w-24 h-24 mx-auto">
        <div className="absolute inset-0 bg-primary/20 rounded-full animate-pulse" />
        <div className="absolute inset-2 bg-primary/30 rounded-full" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className="w-10 h-10 text-primary" />
        </div>
      </div>

      {/* Main message */}
      <div className="space-y-2">
        <h3 className="text-xl font-bold text-foreground">
          Let's Build Your Learning Path
        </h3>
        <p className="text-muted-foreground max-w-sm mx-auto">
          Upload your study materials or join an instructor's class to get personalized practice questions
        </p>
      </div>

      {/* Action cards */}
      <div className="grid gap-4 max-w-md mx-auto">
        {/* Upload materials - Primary */}
        <button
          onClick={onUpload}
          className="group relative p-6 rounded-2xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all text-left"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/20 text-primary">
              <Upload className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-foreground mb-1">
                Upload Study Materials
              </h4>
              <p className="text-sm text-muted-foreground">
                Syllabus, notes, PDFs — we'll generate practice questions automatically
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
          </div>
        </button>

        {/* Join class - Secondary */}
        <button
          onClick={onJoinClass}
          className="group relative p-6 rounded-2xl border border-border hover:border-primary/30 hover:bg-accent/50 transition-all text-left"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-muted text-muted-foreground">
              <Users className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-foreground mb-1">
                Join an Instructor's Class
              </h4>
              <p className="text-sm text-muted-foreground">
                Get assigned content, lectures, and track progress with your class
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
          </div>
        </button>
      </div>

      {/* Benefits list */}
      <div className="pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground mb-3">What you'll get:</p>
        <div className="flex flex-wrap justify-center gap-3">
          {[
            'AI-generated questions',
            'Spaced repetition',
            'Progress tracking',
            'Weakness detection'
          ].map((benefit) => (
            <span 
              key={benefit}
              className="px-3 py-1 rounded-full bg-muted text-xs text-muted-foreground"
            >
              {benefit}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
