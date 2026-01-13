import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get the user from the auth header
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { tierName, successUrl, cancelUrl } = await req.json();
    console.log('Creating checkout for tier:', tierName, 'user:', user.id);

    // Get the tier details
    const { data: tier, error: tierError } = await supabaseClient
      .from('subscription_tiers')
      .select('id, name, display_name, stripe_price_id, price_cents')
      .eq('name', tierName)
      .eq('is_active', true)
      .single();

    if (tierError || !tier) {
      console.error('Tier lookup error:', tierError);
      return new Response(
        JSON.stringify({ error: 'Tier not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tier.stripe_price_id) {
      console.error('No Stripe price ID for tier:', tierName);
      return new Response(
        JSON.stringify({ error: 'Tier has no Stripe price configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    });

    // Check if user already has a Stripe customer ID
    const { data: existingSubscription } = await supabaseClient
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = existingSubscription?.stripe_customer_id;

    // If no customer ID, check if customer exists by email
    if (!customerId && user.email) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      }
    }

    // Create customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;
      console.log('Created new Stripe customer:', customerId);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: tier.stripe_price_id,
          quantity: 1,
        },
      ],
      mode: 'payment', // One-time payment for semester license
      success_url: successUrl || `${req.headers.get('origin')}/instructor/settings?checkout=success`,
      cancel_url: cancelUrl || `${req.headers.get('origin')}/instructor/settings?checkout=canceled`,
      metadata: {
        supabase_user_id: user.id,
        tier_id: tier.id,
        tier_name: tier.name,
      },
    });

    console.log('Created checkout session:', session.id);

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating checkout session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
