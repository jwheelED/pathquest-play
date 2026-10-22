// Temporary: times a sample scan on Groq models. Delete after use.
Deno.serve(async () => {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) return new Response(JSON.stringify({ error: "no key" }), { status: 500 });
  const out: Record<string, unknown> = {};
  for (const model of ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"]) {
    for (let i = 0; i < 2; i++) {
      const t = Date.now();
      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: "system", content: 'Decide if the instructor just asked the class a question. If so, rewrite it as a clean question and give exactly 4 multiple-choice options (1 correct, 3 realistic distractors) and correct_answer letter. Respond with ONLY JSON: {"detected":bool,"question":string,"options":string[],"correct_answer":"A"|"B"|"C"|"D"}' },
          { role: "user", content: "EARLIER CONTEXT:\nOkay let's warm up with some arithmetic.\n\nNEW SPEECH:\nso what's four plus four" },
        ],
        response_format: { type: "json_object" },
      };
      if (model.startsWith("openai/")) body.reasoning_effort = "low";
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      out[`${model}#${i}`] = { status: res.status, ms: Date.now() - t, content: data?.choices?.[0]?.message?.content ?? data?.error?.message };
    }
  }
  return new Response(JSON.stringify(out, null, 1), { headers: { "Content-Type": "application/json" } });
});
