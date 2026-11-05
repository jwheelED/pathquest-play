import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { OPENAI_IMAGE_MODEL } from "../_shared/models.ts";
import {
  imageExists,
  preparedImageUrl,
  prepPublicId,
  uploadQuestionImage,
} from "../_shared/questionImageStore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

const DIAGRAM_KEYWORDS = [
  "graph", "chart", "diagram", "plot", "axis", "curve", "slope",
  "equation", "formula", "calculate", "ratio", "proportion",
  "flow", "cycle", "pathway", "circuit", "structure", "anatomy",
];

async function waitForPrepared(prepKey: string, maxMs: number): Promise<string | null> {
  const url = preparedImageUrl(prepKey);
  if (!url) return null;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await imageExists(url)) return url;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

async function generateAndUpload(
  questionText: string,
  solutionText: string,
  courseTitle: string | undefined,
  imageKind: "illustration" | "diagram",
  publicId?: string,
): Promise<string> {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    console.log(`🎨 Generating ${imageKind}`);

    const styleGuide =
      imageKind === "diagram"
        ? "Clean, labeled educational diagram with simple shapes, arrows, and annotations. White background, minimal color palette using teal/emerald accents. No text beyond short labels."
        : "Clean, flat educational illustration. Soft pastel colors with emerald/teal accents on a light background. Simple, conceptual, no photorealism. The only text allowed is the key answer itself (a number, word or short label) shown large and legible.";

    const courseContext = courseTitle ? ` for a ${courseTitle} course` : "";
    // The picture is shown AFTER the student answers, so it illustrates the
    // correct answer (e.g. a large "206" surrounded by bones), not the question.
    const solution = solutionText.trim();
    const prompt = solution
      ? `${styleGuide}\n\nQuestion${courseContext}: ${questionText}\nCorrect answer: ${solution}\n\nCreate a simple, memorable visual that shows and reinforces this correct answer. Make the answer the clear focal point (for a number or term, show it prominently with imagery of the concept around it).`
      : `${styleGuide}\n\nConcept: ${questionText}${courseContext}\n\nCreate a simple, clear visual that helps a student understand this concept at a glance.`;

    // DALL-E 3 was retired by OpenAI. GPT Image models always return base64
    // and reject `response_format`; "low" quality is the fastest (~6s).
    const dalleRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt,
        n: 1,
        size: "1536x1024",
        quality: "low",
      }),
    });

    if (!dalleRes.ok) {
      const errBody = await dalleRes.text();
      console.error("OpenAI image API error:", dalleRes.status, errBody.slice(0, 300));
      throw new Error(`OpenAI image API error: ${dalleRes.status}`);
    }

    const dalleData = await dalleRes.json();
    const b64 = dalleData.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("No image data in OpenAI image response");
    }

    // Decode base64 to bytes
    const binaryString = atob(b64);
    const imageBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      imageBytes[i] = binaryString.charCodeAt(i);
    }

    console.log(`🎨 Image generated (${imageBytes.length} bytes), uploading...`);

    return await uploadQuestionImage(imageBytes, publicId);
}

// --- Main handler ---

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let questionId: string | undefined;
  let isPrepare = false;

  try {
    const body = await req.json();
    questionId = body.questionId;
    isPrepare = body.mode === "prepare";
    const questionText: string = body.questionText;
    const solutionText: string =
      typeof body.solutionText === "string" ? body.solutionText.slice(0, 600) : "";
    const courseTitle: string | undefined = body.courseTitle;
    const imageKind: "illustration" | "diagram" = body.imageKind || "illustration";
    const prepKey: string | null =
      typeof body.prepKey === "string" && /^[0-9a-f-]{36}$/i.test(body.prepKey)
        ? body.prepKey
        : null;

    // --- Prepare mode: pre-generate while the question is On Deck ---
    if (body.mode === "prepare") {
      questionId = undefined;
      if (!prepKey || typeof questionText !== "string" || !questionText.trim()) {
        return new Response(JSON.stringify({ error: "prepKey and questionText are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: userData } = await supabase.auth.getUser(token);
      const userId = userData?.user?.id;
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: live } = await supabase
        .from("live_sessions")
        .select("id")
        .eq("instructor_id", userId)
        .eq("is_active", true)
        .limit(1);
      if (!live || live.length === 0) {
        return new Response(JSON.stringify({ skipped: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const lower = questionText.toLowerCase();
      const kind = DIAGRAM_KEYWORDS.some((k) => lower.includes(k)) ? "diagram" : "illustration";
      const url = await generateAndUpload(questionText, solutionText, courseTitle, kind, prepPublicId(prepKey));
      console.log(`✅ Pre-generated image ready: ${url}`);
      return new Response(JSON.stringify({ success: true, imageUrl: url }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!questionId || !questionText) {
      return new Response(
        JSON.stringify({ error: "questionId and questionText are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let publicUrl: string | null = null;
    if (prepKey) {
      // A pre-generation may still be in flight — wait briefly for it
      publicUrl = await waitForPrepared(prepKey, 20_000);
      if (publicUrl) console.log(`♻️ Reusing pre-generated image for ${questionId}`);
    }
    if (!publicUrl) {
      publicUrl = await generateAndUpload(questionText, solutionText, courseTitle, imageKind);
    }

    console.log(`✅ Image uploaded: ${publicUrl}`);

    // Update the live_questions row
    const { error: updateError } = await supabase
      .from("live_questions")
      .update({ image_url: publicUrl, image_status: "ready" })
      .eq("id", questionId);

    if (updateError) {
      console.error("Failed to update live_questions:", updateError);
      throw new Error(`DB update failed: ${updateError.message}`);
    }

    console.log(`✅ Question ${questionId} image_status → ready`);

    return new Response(
      JSON.stringify({ success: true, imageUrl: publicUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Image generation failed for ${questionId}:`, message);

    // Mark as failed so the client collapses the banner
    if (questionId) {
      await supabase
        .from("live_questions")
        .update({ image_status: "failed" })
        .eq("id", questionId)
        .then(({ error: e }) => {
          if (e) console.error("Failed to mark image_status=failed:", e);
        });
    }

    // Pre-generation is best effort: a failure must not surface as an app error.
    if (isPrepare) {
      return new Response(
        JSON.stringify({ success: false, error: message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
