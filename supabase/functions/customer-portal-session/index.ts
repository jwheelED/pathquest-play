// Opens a Stripe Billing Portal session so an instructor can manage their
// subscription (update card, change plan, cancel). Requires an existing
// Stripe customer, which only exists once they've checked out at least once.
import {
  corsHeaders,
  getAdminClient,
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

    const { returnUrl } = await req.json();
    if (!returnUrl) {
      return jsonResponse({ error: "returnUrl is required" }, 400);
    }

    const admin = getAdminClient();
    const { data: sub } = await admin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .not("stripe_customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      return jsonResponse({ error: "No billing account found" }, 404);
    }

    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: returnUrl,
    });

    return jsonResponse({ url: portal.url });
  } catch (error) {
    console.error("customer-portal-session error:", error);
    return jsonResponse({ error: "Failed to open billing portal" }, 500);
  }
});
