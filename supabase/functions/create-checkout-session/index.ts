// Creates a Stripe Checkout session for an instructor upgrading to a paid tier.
//
// Flow: authenticate the caller -> look up the requested tier's stripe_price_id
// -> find/create their Stripe customer -> open a subscription-mode Checkout
// session. The subscription row itself is written by `stripe-webhook` on
// checkout.session.completed, so this function never mutates our DB.
import {
  corsHeaders,
  getAdminClient,
  getOrCreateCustomer,
  getStripe,
  getUserFromRequest,
  jsonResponse,
} from "../_shared/billing.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await getUserFromRequest(req.headers.get("Authorization"));
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { tierName, successUrl, cancelUrl } = await req.json();
    if (!tierName || !successUrl || !cancelUrl) {
      return jsonResponse(
        { error: "tierName, successUrl and cancelUrl are required" },
        400,
      );
    }

    const admin = getAdminClient();

    // Resolve the tier and its Stripe price.
    const { data: tier, error: tierError } = await admin
      .from("subscription_tiers")
      .select("id, name, price_cents, stripe_price_id, is_active")
      .eq("name", tierName)
      .maybeSingle();

    if (tierError || !tier) {
      return jsonResponse({ error: "Unknown subscription tier" }, 404);
    }
    if (!tier.is_active) {
      return jsonResponse({ error: "This tier is not available" }, 400);
    }
    if (tier.price_cents === 0 || !tier.stripe_price_id) {
      return jsonResponse(
        { error: "This tier is not purchasable via checkout" },
        400,
      );
    }

    const stripe = getStripe();
    const customerId = await getOrCreateCustomer(
      stripe,
      admin,
      user.id,
      user.email,
    );

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: tier.stripe_price_id, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      client_reference_id: user.id,
      // Copied onto the subscription so the webhook can attribute it.
      subscription_data: {
        metadata: { supabase_user_id: user.id, tier_name: tier.name },
      },
      metadata: { supabase_user_id: user.id, tier_name: tier.name },
    });

    return jsonResponse({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error("create-checkout-session error:", error);
    return jsonResponse({ error: "Failed to create checkout session" }, 500);
  }
});
