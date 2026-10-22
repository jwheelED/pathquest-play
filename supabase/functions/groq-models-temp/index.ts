// Temporary: lists Groq model IDs available to this key. Delete after use.
Deno.serve(async () => {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) return new Response(JSON.stringify({ error: "no key" }), { status: 500 });
  const res = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${key}` } });
  const data = await res.json().catch(() => null);
  const ids = Array.isArray(data?.data) ? data.data.map((m: { id: string }) => m.id).sort() : data;
  return new Response(JSON.stringify({ status: res.status, ids }), { headers: { "Content-Type": "application/json" } });
});
