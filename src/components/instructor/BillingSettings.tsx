import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CreditCard, Crown, Sparkles, ExternalLink, Loader2, CheckCircle, AlertCircle } from "lucide-react";
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
                  Limited to 1 course and 60 min of lecture time per week
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
          <h3 className="font-medium mb-4">Available Plans</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tiers.map((tier) => {
              const isCurrentTier = tier.name === currentTier;
              const isFreeTier = tier.name === 'free';
              
              return (
                <div
                  key={tier.id}
                  className={`rounded-lg border p-4 ${
                    isCurrentTier 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                  } transition-colors`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold flex items-center gap-2">
                        {tier.display_name}
                        {tier.name === 'instructor' && (
                          <Sparkles className="h-4 w-4 text-amber-500" />
                        )}
                        {tier.name === 'institutional' && (
                          <Crown className="h-4 w-4 text-primary" />
                        )}
                      </h4>
                      <p className="text-2xl font-bold mt-1">
                        {isFreeTier ? 'Free' : formatPrice(tier.price_cents)}
                        {!isFreeTier && tier.price_suffix && (
                          <span className="text-sm font-normal text-muted-foreground">
                            {tier.price_suffix}
                          </span>
                        )}
                      </p>
                      {tier.pricing_model === 'per_seat' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Billed based on active student count
                        </p>
                      )}
                    </div>
                    {isCurrentTier && (
                      <Badge variant="secondary" className="bg-primary text-primary-foreground">
                        Current
                      </Badge>
                    )}
                  </div>

                  {tier.description && (
                    <p className="text-sm text-muted-foreground mb-3">
                      {tier.description}
                    </p>
                  )}

                  <ul className="space-y-2 mb-4">
                    <li className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      {tier.name === 'free' ? '60 min lecture time/week' : (tier.student_limit === null ? 'Unlimited students' : `Up to ${tier.student_limit} students`)}
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      {tier.course_limit === null ? 'Unlimited courses' : `${tier.course_limit} course`}
                    </li>
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        {String(feature)}
                      </li>
                    ))}
                  </ul>

                  {!isCurrentTier && !isFreeTier && (
                    <Button 
                      className="w-full"
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
                          Upgrade to {tier.display_name}
                        </>
                      )}
                    </Button>
                  )}
                  {isCurrentTier && (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Your current plan
                    </div>
                  )}
                </div>
              );
            })}
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
