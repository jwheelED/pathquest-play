import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CreditCard, Crown, Sparkles, ExternalLink, Loader2, CheckCircle, AlertCircle, Users, BookOpen, Zap, TrendingUp, Award } from "lucide-react";
import { format } from "date-fns";

interface SubscriptionTier {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  price_cents: number;
  features: unknown[];
  student_limit: number | null;
  course_limit: number | null;
  pricing_model: string | null;
  price_suffix: string | null;
}

interface Subscription {
  id: string;
  status: string;
  current_period_end: string;
  stripe_customer_id: string | null;
  tier: SubscriptionTier;
}

export function BillingSettings() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    fetchBillingData();
  }, []);

  const fetchBillingData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch available tiers
      const { data: tiersData, error: tiersError } = await supabase
        .from('subscription_tiers')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (tiersError) throw tiersError;

      // Parse features from JSON
      const parsedTiers = (tiersData || []).map(tier => ({
        ...tier,
        features: Array.isArray(tier.features) ? tier.features : [],
      }));
      setTiers(parsedTiers);

      // Fetch user's subscription
      const { data: subData, error: subError } = await supabase
        .from('subscriptions')
        .select(`
          id,
          status,
          current_period_end,
          stripe_customer_id,
          tier:subscription_tiers(*)
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (subError && subError.code !== 'PGRST116') throw subError;

      if (subData && subData.tier) {
        const tierData = subData.tier as unknown as SubscriptionTier;
        setSubscription({
          ...subData,
          tier: {
            ...tierData,
            features: Array.isArray(tierData.features) ? tierData.features : [],
          },
        });
      }
    } catch (error) {
      console.error('Error fetching billing data:', error);
      toast.error('Failed to load billing information');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (tierName: string) => {
    setUpgrading(tierName);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { 
          tierName,
          successUrl: `${window.location.origin}/instructor/settings?checkout=success`,
          cancelUrl: `${window.location.origin}/instructor/settings?checkout=canceled`,
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
      setUpgrading(null);
    }
  };

  const handleManageBilling = async () => {
    setOpeningPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal-session', {
        body: { 
          returnUrl: `${window.location.origin}/instructor/settings`,
        },
      });

      if (error) throw error;
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error opening portal:', error);
      toast.error('Failed to open billing portal');
    } finally {
      setOpeningPortal(false);
    }
  };

  const getCurrentTierName = () => {
    return subscription?.tier?.name || 'free';
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  // Enhanced descriptions for each tier
  const getTierEnhancements = (tierName: string) => {
    const enhancements: Record<string, {
      tagline: string;
      icon: typeof Users;
      highlights: string[];
      bestFor: string;
      gradient: string;
    }> = {
      free: {
        tagline: "Perfect for trying out Edvana",
        icon: BookOpen,
        highlights: ["No credit card required", "Full AI grading features", "Real-time transcription"],
        bestFor: "Small classes or testing the platform",
        gradient: "from-blue-500/10 to-cyan-500/10"
      },
      instructor: {
        tagline: "Most popular for individual instructors",
        icon: Sparkles,
        highlights: ["Unlimited AI-powered questions", "Advanced analytics", "Priority support"],
        bestFor: "Teachers with multiple classes",
        gradient: "from-amber-500/10 to-orange-500/10"
      },
      institutional: {
        tagline: "Enterprise-grade for departments",
        icon: Crown,
        highlights: ["White-label options", "Custom integrations", "Dedicated account manager"],
        bestFor: "Universities and large institutions",
        gradient: "from-purple-500/10 to-pink-500/10"
      }
    };
    return enhancements[tierName] || enhancements.free;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const currentTier = getCurrentTierName();

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Subscription & Billing
        </CardTitle>
        <CardDescription>
          Manage your subscription plan and billing details
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Plan Status */}
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg">
                  {subscription?.tier?.display_name || 'Free Plan'}
                </h3>
                {currentTier !== 'free' && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary">
                    <Crown className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                )}
              </div>
              {subscription?.current_period_end && (
                <p className="text-sm text-muted-foreground mt-1">
                  Valid until {format(new Date(subscription.current_period_end), 'MMMM d, yyyy')}
                </p>
              )}
              {currentTier === 'free' && (
                <p className="text-sm text-muted-foreground mt-1">
                  Limited to 1 course and 25 students
                </p>
              )}
            </div>
            {subscription?.stripe_customer_id && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleManageBilling}
                disabled={openingPortal}
              >
                {openingPortal ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ExternalLink className="h-4 w-4 mr-2" />
                )}
                Manage Billing
              </Button>
            )}
          </div>
        </div>

        {/* Available Plans */}
        <div>
          <div className="mb-6">
            <h3 className="text-xl font-semibold mb-2">Choose Your Plan</h3>
            <p className="text-sm text-muted-foreground">
              All plans include AI-powered grading, real-time transcription, and live engagement tools.
              Upgrade anytime as your needs grow.
            </p>
          </div>
          
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tiers.map((tier) => {
              const isCurrentTier = tier.name === currentTier;
              const isFreeTier = tier.name === 'free';
              const enhancements = getTierEnhancements(tier.name);
              const IconComponent = enhancements.icon;
              
              return (
                <div
                  key={tier.id}
                  className={`relative rounded-xl border-2 overflow-hidden transition-all duration-300 ${
                    isCurrentTier 
                      ? 'border-primary shadow-lg scale-[1.02]' 
                      : 'border-border hover:border-primary/50 hover:shadow-md'
                  }`}
                >
                  {/* Gradient Background */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${enhancements.gradient} opacity-50`} />
                  
                  {/* Popular Badge */}
                  {tier.name === 'instructor' && (
                    <div className="absolute top-4 right-4">
                      <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        Most Popular
                      </Badge>
                    </div>
                  )}
                  
                  <div className="relative p-6">
                    {/* Header */}
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`p-2 rounded-lg ${
                          isFreeTier ? 'bg-blue-100 dark:bg-blue-900' :
                          tier.name === 'instructor' ? 'bg-amber-100 dark:bg-amber-900' :
                          'bg-purple-100 dark:bg-purple-900'
                        }`}>
                          <IconComponent className={`h-5 w-5 ${
                            isFreeTier ? 'text-blue-600 dark:text-blue-400' :
                            tier.name === 'instructor' ? 'text-amber-600 dark:text-amber-400' :
                            'text-purple-600 dark:text-purple-400'
                          }`} />
                        </div>
                        {isCurrentTier && (
                          <Badge variant="secondary" className="bg-primary text-primary-foreground">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Current Plan
                          </Badge>
                        )}
                      </div>
                      
                      <h4 className="text-2xl font-bold">{tier.display_name}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{enhancements.tagline}</p>
                    </div>

                    {/* Pricing */}
                    <div className="mb-4">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold">
                          {isFreeTier ? '$0' : formatPrice(tier.price_cents).split('.')[0]}
                        </span>
                        {!isFreeTier && (
                          <>
                            <span className="text-lg text-muted-foreground">
                              {formatPrice(tier.price_cents).includes('.') ? `.${formatPrice(tier.price_cents).split('.')[1]}` : ''}
                            </span>
                            {tier.price_suffix && (
                              <span className="text-sm text-muted-foreground ml-1">
                                {tier.price_suffix}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      {tier.pricing_model === 'per_seat' && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Pay only for active students
                        </p>
                      )}
                    </div>

                    {/* Best For */}
                    <div className="mb-4 p-3 rounded-lg bg-muted/50 border border-border/50">
                      <p className="text-xs font-medium text-muted-foreground mb-1">BEST FOR</p>
                      <p className="text-sm font-medium">{enhancements.bestFor}</p>
                    </div>

                    {/* Features */}
                    <div className="space-y-2.5 mb-4">
                      {/* Core Limits */}
                      <div className="flex items-start gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong>{tier.student_limit === null ? 'Unlimited' : tier.student_limit}</strong> students per course
                        </span>
                      </div>
                      <div className="flex items-start gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong>{tier.course_limit === null ? 'Unlimited' : tier.course_limit}</strong> {tier.course_limit === 1 ? 'course' : 'courses'}
                        </span>
                      </div>
                      
                      {/* Key Highlights */}
                      {enhancements.highlights.map((highlight, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-sm">
                          <Zap className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          <span>{highlight}</span>
                        </div>
                      ))}
                      
                      {/* Additional Features */}
                      {tier.features.map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-sm">
                          <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>{String(feature)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Action Button */}
                    {!isCurrentTier && !isFreeTier && (
                      <Button 
                        className={`w-full ${
                          tier.name === 'instructor' 
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600' 
                            : ''
                        }`}
                        size="lg"
                        onClick={() => handleUpgrade(tier.name)}
                        disabled={upgrading === tier.name}
                      >
                        {upgrading === tier.name ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            Upgrade Now
                          </>
                        )}
                      </Button>
                    )}
                    {isCurrentTier && (
                      <div className="flex items-center justify-center gap-2 text-sm font-medium text-primary py-3 bg-primary/10 rounded-lg">
                        <Award className="h-4 w-4" />
                        You're on this plan
                      </div>
                    )}
                    {!isCurrentTier && isFreeTier && (
                      <div className="text-center py-3 text-sm text-muted-foreground">
                        No credit card required
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Help Text */}
          <div className="mt-6 p-4 rounded-lg bg-muted/30 border">
            <p className="text-sm text-muted-foreground">
              💡 <strong>Not sure which plan?</strong> Start with the Free plan to explore all features.
              You can upgrade anytime as your courses grow. All plans include our core AI features.
            </p>
          </div>
        </div>

        {/* Checkout Status Messages */}
        {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('checkout') === 'success' && (
          <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="font-medium text-green-700 dark:text-green-400">Payment successful!</p>
              <p className="text-sm text-green-600 dark:text-green-500">Your subscription has been activated.</p>
            </div>
          </div>
        )}
        {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('checkout') === 'canceled' && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <div>
              <p className="font-medium text-amber-700 dark:text-amber-400">Checkout canceled</p>
              <p className="text-sm text-amber-600 dark:text-amber-500">No charges were made. You can try again anytime.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
