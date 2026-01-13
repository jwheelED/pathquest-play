import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
    apiVersion: '2023-10-16',
  });

  // Use service role for webhook operations
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  
  let event: Stripe.Event;

  try {
    const body = await req.text();
    
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } else {
      // For testing without webhook signature verification
      event = JSON.parse(body);
      console.log('⚠️ Webhook signature not verified (no secret configured)');
    }

    console.log('Received Stripe event:', event.type);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Checkout completed:', session.id);
        
        const userId = session.metadata?.supabase_user_id;
        const tierId = session.metadata?.tier_id;
        const tierName = session.metadata?.tier_name;
        
        if (!userId || !tierId) {
          console.error('Missing metadata in checkout session');
          break;
        }

        // Calculate period end (semester = 4 months)
        const periodEnd = new Date();
        periodEnd.setMonth(periodEnd.getMonth() + 4);

        // Check for existing subscription
        const { data: existingSub } = await supabaseAdmin
          .from('subscriptions')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (existingSub) {
          // Update existing subscription
          const { error: updateError } = await supabaseAdmin
            .from('subscriptions')
            .update({
              tier_id: tierId,
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string || session.payment_intent as string,
              status: 'active',
              current_period_start: new Date().toISOString(),
              current_period_end: periodEnd.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingSub.id);

          if (updateError) {
            console.error('Error updating subscription:', updateError);
          } else {
            console.log('Updated subscription for user:', userId, 'to tier:', tierName);
          }
        } else {
          // Create new subscription
          const { error: insertError } = await supabaseAdmin
            .from('subscriptions')
            .insert({
              user_id: userId,
              tier_id: tierId,
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string || session.payment_intent as string,
              status: 'active',
              current_period_start: new Date().toISOString(),
              current_period_end: periodEnd.toISOString(),
            });

          if (insertError) {
            console.error('Error creating subscription:', insertError);
          } else {
            console.log('Created subscription for user:', userId, 'tier:', tierName);
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Subscription updated:', subscription.id);

        const { error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: subscription.status,
            cancel_at_period_end: subscription.cancel_at_period_end,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);

        if (error) {
          console.error('Error updating subscription status:', error);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Subscription deleted:', subscription.id);

        const { error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);

        if (error) {
          console.error('Error marking subscription canceled:', error);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log('Payment failed for invoice:', invoice.id);

        if (invoice.subscription) {
          const { error } = await supabaseAdmin
            .from('subscriptions')
            .update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', invoice.subscription as string);

          if (error) {
            console.error('Error marking subscription past_due:', error);
          }
        }
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
