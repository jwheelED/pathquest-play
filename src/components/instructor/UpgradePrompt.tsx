import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Crown, Sparkles, Loader2, BookOpen, Users } from "lucide-react";

interface UpgradePromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  limitType: 'course' | 'student';
  currentCount: number;
  limit: number;
}

export function UpgradePrompt({ 
  open, 
  onOpenChange, 
  limitType,
  currentCount,
  limit,
}: UpgradePromptProps) {
  const [upgrading, setUpgrading] = useState(false);

  // A course limit needs unlimited courses (Professional); a student limit is
  // lifted on any paid tier, so recommend the cheaper Starter entry point.
  const recommendedTier = limitType === 'course'
    ? { name: 'pro', label: 'Professional', price: '$59/month', hours: '40 hours of lecture time / month' }
    : { name: 'starter', label: 'Starter', price: '$29/month', hours: '15 hours of lecture time / month' };

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          tierName: recommendedTier.name,
          successUrl: `${window.location.origin}/instructor/settings?checkout=success`,
          cancelUrl: `${window.location.origin}/instructor/dashboard`,
        },
      });

      if (error) throw error;
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
      toast.error('Failed to start checkout process');
    } finally {
      setUpgrading(false);
    }
  };

  const LimitIcon = limitType === 'course' ? BookOpen : Users;
  const limitText = limitType === 'course' ? 'course' : 'student';
  const limitTextPlural = limitType === 'course' ? 'courses' : 'students';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            Upgrade Required
          </DialogTitle>
          <DialogDescription>
            You've reached your free plan limit
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-500/10 p-2">
                <LimitIcon className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="font-medium">
                  {currentCount} of {limit} {limitTextPlural} used
                </p>
                <p className="text-sm text-muted-foreground">
                  Free plan allows only {limit} {limit === 1 ? limitText : limitTextPlural}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <h4 className="font-semibold flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {recommendedTier.label} Plan - {recommendedTier.price}
            </h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>✓ {recommendedTier.hours}</li>
              <li>✓ Unlimited students</li>
              <li>✓ {limitType === 'course' ? 'Unlimited courses' : '1 course'}</li>
              <li>✓ {limitType === 'course' ? 'Advanced analytics & priority support' : 'Full AI question suite'}</li>
            </ul>
          </div>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Maybe Later
            </Button>
            <Button 
              className="flex-1"
              onClick={handleUpgrade}
              disabled={upgrading}
            >
              {upgrading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  <Crown className="h-4 w-4 mr-2" />
                  Upgrade Now
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
