import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Brain, Target, Lightbulb, Sparkles, BookOpen, GraduationCap, Save, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DifficultyMix {
  recall: number;
  application: number;
  reasoning: number;
}

interface StyleMix {
  mcq: number;
  short_answer: number;
}

const PRESETS: Record<string, { name: string; description: string; difficulty: DifficultyMix; style: StyleMix; icon: React.ReactNode }> = {
  balanced: {
    name: 'Balanced',
    description: 'Even mix of question types for general learning',
    difficulty: { recall: 33, application: 34, reasoning: 33 },
    style: { mcq: 70, short_answer: 30 },
    icon: <Target className="h-4 w-4" />
  },
  concept_check: {
    name: 'Concept Check',
    description: 'Focus on foundational understanding',
    difficulty: { recall: 60, application: 30, reasoning: 10 },
    style: { mcq: 80, short_answer: 20 },
    icon: <BookOpen className="h-4 w-4" />
  },
  deep_understanding: {
    name: 'Deep Understanding',
    description: 'Emphasize application and critical thinking',
    difficulty: { recall: 20, application: 40, reasoning: 40 },
    style: { mcq: 50, short_answer: 50 },
    icon: <Lightbulb className="h-4 w-4" />
  },
  board_prep: {
    name: 'Board Prep',
    description: 'High-stakes exam style with reasoning focus',
    difficulty: { recall: 10, application: 30, reasoning: 60 },
    style: { mcq: 90, short_answer: 10 },
    icon: <GraduationCap className="h-4 w-4" />
  }
};

export const AdaptiveTutoringSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preset, setPreset] = useState('balanced');
  const [difficultyMix, setDifficultyMix] = useState<DifficultyMix>({ recall: 40, application: 40, reasoning: 20 });
  const [styleMix, setStyleMix] = useState<StyleMix>({ mcq: 70, short_answer: 30 });
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('difficulty_mix, style_mix, question_preset')
        .eq('id', user.id)
        .single();

      if (profile) {
        if (profile.difficulty_mix) {
          setDifficultyMix(profile.difficulty_mix as unknown as DifficultyMix);
        }
        if (profile.style_mix) {
          setStyleMix(profile.style_mix as unknown as StyleMix);
        }
        if (profile.question_preset) {
          setPreset(profile.question_preset);
        }
      }
      setLoading(false);
    };

    loadSettings();
  }, []);

  const handlePresetChange = (newPreset: string) => {
    setPreset(newPreset);
    const presetData = PRESETS[newPreset];
    if (presetData) {
      setDifficultyMix(presetData.difficulty);
      setStyleMix(presetData.style);
    }
    setHasChanges(true);
  };

  const handleDifficultyChange = (type: keyof DifficultyMix, value: number) => {
    // Normalize other values to maintain 100% total
    const remaining = 100 - value;
    const otherKeys = Object.keys(difficultyMix).filter(k => k !== type) as (keyof DifficultyMix)[];
    const otherTotal = otherKeys.reduce((sum, k) => sum + difficultyMix[k], 0);
    
    const newMix = { ...difficultyMix, [type]: value };
    if (otherTotal > 0) {
      otherKeys.forEach(k => {
        newMix[k] = Math.round((difficultyMix[k] / otherTotal) * remaining);
      });
    } else {
      // Distribute equally if others are 0
      otherKeys.forEach(k => {
        newMix[k] = Math.round(remaining / otherKeys.length);
      });
    }
    
    setDifficultyMix(newMix);
    setPreset('custom');
    setHasChanges(true);
  };

  const handleStyleChange = (value: number) => {
    setStyleMix({ mcq: value, short_answer: 100 - value });
    setPreset('custom');
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update({
          difficulty_mix: JSON.parse(JSON.stringify(difficultyMix)),
          style_mix: JSON.parse(JSON.stringify(styleMix)),
          question_preset: preset
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Adaptive tutoring settings saved');
      setHasChanges(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    handlePresetChange('balanced');
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-8 bg-muted rounded" />
            <div className="h-8 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Adaptive Tutoring Settings
        </CardTitle>
        <CardDescription>
          Configure how AI generates questions for pre-recorded lectures
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Presets */}
        <div className="space-y-3">
          <Label>Question Preset</Label>
          <Select value={preset} onValueChange={handlePresetChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select a preset" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRESETS).map(([key, data]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    {data.icon}
                    <span>{data.name}</span>
                  </div>
                </SelectItem>
              ))}
              {preset === 'custom' && (
                <SelectItem value="custom">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    <span>Custom</span>
                  </div>
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {preset !== 'custom' && PRESETS[preset] && (
            <p className="text-xs text-muted-foreground">{PRESETS[preset].description}</p>
          )}
        </div>

        {/* Difficulty Mix */}
        <div className="space-y-4">
          <Label className="flex items-center justify-between">
            <span>Difficulty Mix</span>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs">
                Recall: {difficultyMix.recall}%
              </Badge>
              <Badge variant="outline" className="text-xs">
                Application: {difficultyMix.application}%
              </Badge>
              <Badge variant="outline" className="text-xs">
                Reasoning: {difficultyMix.reasoning}%
              </Badge>
            </div>
          </Label>
          
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs w-20 text-muted-foreground">Recall</span>
              <Slider
                value={[difficultyMix.recall]}
                onValueChange={([v]) => handleDifficultyChange('recall', v)}
                max={100}
                step={5}
                className="flex-1"
              />
              <span className="text-xs w-8 text-right">{difficultyMix.recall}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs w-20 text-muted-foreground">Application</span>
              <Slider
                value={[difficultyMix.application]}
                onValueChange={([v]) => handleDifficultyChange('application', v)}
                max={100}
                step={5}
                className="flex-1"
              />
              <span className="text-xs w-8 text-right">{difficultyMix.application}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs w-20 text-muted-foreground">Reasoning</span>
              <Slider
                value={[difficultyMix.reasoning]}
                onValueChange={([v]) => handleDifficultyChange('reasoning', v)}
                max={100}
                step={5}
                className="flex-1"
              />
              <span className="text-xs w-8 text-right">{difficultyMix.reasoning}%</span>
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground">
            <strong>Recall:</strong> Facts, definitions, basic concepts • 
            <strong> Application:</strong> Using concepts in examples • 
            <strong> Reasoning:</strong> Why, compare, predict
          </p>
        </div>

        {/* Style Mix */}
        <div className="space-y-3">
          <Label className="flex items-center justify-between">
            <span>Question Style</span>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs">MCQ: {styleMix.mcq}%</Badge>
              <Badge variant="outline" className="text-xs">Short Answer: {styleMix.short_answer}%</Badge>
            </div>
          </Label>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Short Answer</span>
            <Slider
              value={[styleMix.mcq]}
              onValueChange={([v]) => handleStyleChange(v)}
              max={100}
              step={10}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground">MCQ</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving || !hasChanges} className="flex-1">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
