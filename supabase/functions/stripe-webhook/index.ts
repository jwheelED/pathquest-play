// Stripe webhook handler — the source of truth for subscription state.
//
// Verifies the Stripe signature, then reconciles our `subscriptions` table and
// the instructor's monthly minute allowance in response to lifecycle events.
// This function must be PUBLIC (no JWT) because Stripe calls it directly — see
// verify_jwt = false in supabase/config.toml.
//
// Handled events:
//   checkout.session.completed      -> activate the new subscription
//   customer.subscription.updated   -> sync status / period / tier changes
//   customer.subscription.deleted   -> mark canceled, revert to free allowance
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import {
  corsHeaders,
  FREE_TIER_MINUTES,
  getAdminClient,
  getStripe,
  setInstructorMinuteLimit,
} from "../_shared/billing.ts";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function periodEndSeconds(sub: Stripe.Subscription): number {
  // Newer API versions expose the period on the subscription item.
  const item = sub.items?.data?.[0] as
    | (Stripe.SubscriptionItem & { current_period_end?: number })
    | undefined;
  return (
    item?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    Math.floor(Date.now() / 1000)
  );
}

function periodStartSeconds(sub: Stripe.Subscription): number {
  const item = sub.items?.data?.[0] as
    | (Stripe.SubscriptionItem & { current_period_start?: number })
    | undefined;
  return (
    item?.current_period_start ??
    (sub as unknown as { current_period_start?: number })
      .current_period_start ??
    sub.start_date ??
    Math.floor(Date.now() / 1000)
  );
}

/** Resolve our tier row from the price on a subscription. */
async function tierForSubscription(
  admin: SupabaseClient,
  sub: Stripe.Subscription,
): Promise<{ id: string; name: string } | null> {
  const priceId = sub.items?.data?.[0]?.price?.id;
  if (!priceId) return null;
  const { data } = await admin
    .from("subscription_tiers")
    .select("id, name")
    .eq("stripe_price_id", priceId)
    .maybeSingle();
  return data ?? null;
}

/** Upsert a subscription row keyed on stripe_subscription_id (no DB unique). */
async function upsertSubscription(
  admin: SupabaseClient,
  row: Record<string, unknown>,
  stripeSubscriptionId: string,
): Promise<void> {
  const { data: existing } = await admin
    .from("subscriptions")
    .select("id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  if (existing) {
    await admin.from("subscriptions").update(row).eq("id", existing.id);
  } else {
    await admin.from("subscriptions").insert(row);
  }
}

async function syncFromSubscription(
  admin: SupabaseClient,
  sub: Stripe.Subscription,
): Promise<void> {
  const userId = sub.metadata?.supabase_user_id;
  if (!userId) {
    console.error("subscription missing supabase_user_id metadata", sub.id);
    return;
  }

  const tier = await tierForSubscription(admin, sub);
  if (!tier) {
    console.error("no tier matches subscription price", sub.id);
    return;
  }

  const canceled = sub.status === "canceled";

  await upsertSubscription(
    admin,
    {
      user_id: userId,
      org_id: null,
      tier_id: tier.id,
      stripe_subscription_id: sub.id,
      stripe_customer_id: typeof sub.customer === "string"
        ? sub.customer
        : sub.customer.id,
      status: sub.status,
      current_period_start: new Date(periodStartSeconds(sub) * 1000)
        .toISOString(),
      current_period_end: new Date(periodEndSeconds(sub) * 1000).toISOString(),
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      canceled_at: sub.canceled_at
        ? new Date(sub.canceled_at * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    sub.id,
  );

  // Revert to the free allowance when the subscription is fully canceled,
  // otherwise stamp the paid tier's monthly minutes.
  await setInstructorMinuteLimit(admin, userId, canceled ? "free" : tier.name);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !webhookSecret) {
    return new Response("Missing signature or webhook secret", { status: 400 });
  }

  const stripe = getStripe();
  const body = await req.text();

  let event: Stripe.Event;
  try {
    // Async variant is required in Deno (SubtleCrypto-based).
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = getAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            session.subscription as string,
          );
          // Ensure user attribution even if subscription_data metadata was lost.
          if (!sub.metadata?.supabase_user_id && session.client_reference_id) {
            sub.metadata = {
              ...sub.metadata,
              supabase_user_id: session.client_reference_id,
            };
          }
          await syncFromSubscription(admin, sub);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await syncFromSubscription(admin, sub);
        break;
      }
      default:
        // Unhandled events are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
