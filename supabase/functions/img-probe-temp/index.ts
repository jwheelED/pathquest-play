// Temporary probe of OpenAI image params. Delete after use.
Deno.serve(async () => {
  const key = Deno.env.get("OPENAI_API_KEY");
  const variants: Record<string, Record<string, unknown>> = {
    mini: { model: "gpt-image-1-mini", size: "1536x1024", quality: "low" },
    v15: { model: "gpt-image-1.5", size: "1536x1024", quality: "low" },
  };
  const out: Record<string, unknown> = {};
  for (const [name, v] of Object.entries(variants)) {
    const t = Date.now();
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...v, prompt: "Flat educational illustration of the number 8 made of two stacked circles", n: 1 }),
    });
    const txt = await res.text();
    let info: unknown = txt.slice(0, 300);
    try {
      const j = JSON.parse(txt);
      const d = j?.data?.[0];
      info = d ? { has_b64: !!d.b64_json, has_url: !!d.url, model: j.model ?? null } : j?.error?.message;
    } catch { /* keep text */ }
    out[name] = { status: res.status, ms: Date.now() - t, info };
  }
  return new Response(JSON.stringify(out, null, 1), { headers: { "Content-Type": "application/json" } });
});
