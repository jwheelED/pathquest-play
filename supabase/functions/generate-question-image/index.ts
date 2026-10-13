import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

// --- R2 upload helpers (from upload-to-cloudinary) ---

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(data: Uint8Array | string): Promise<string> {
  const encoded =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest(
    "SHA-256",
    encoded.buffer as ArrayBuffer
  );
  return toHex(hash);
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(data)
  );
  return new Uint8Array(sig);
}

async function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<Uint8Array> {
  let key = await hmac(
    new TextEncoder().encode("AWS4" + secretKey),
    dateStamp
  );
  key = await hmac(key, region);
  key = await hmac(key, service);
  key = await hmac(key, "aws4_request");
  return key;
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeObjectKey(key: string): string {
  return key.split("/").map(encodeRfc3986).join("/");
}

async function uploadToR2(
  imageBytes: Uint8Array,
  contentType: string,
  fixedKey?: string
): Promise<string> {
  const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID");
  const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID");
  const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME");
  const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL");

  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET_NAME ||
    !R2_PUBLIC_URL
  ) {
    throw new Error("R2 credentials not configured");
  }

  const key = fixedKey ?? `question-images/${crypto.randomUUID()}.png`;
  const encodedKey = encodeObjectKey(key);
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeRfc3986(R2_BUCKET_NAME)}/${encodedKey}`;
  const url = `https://${host}${canonicalUri}`;
  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const payloadHash = await sha256(imageBytes);
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}${signedHeaders}\n${payloadHash}`;

  const canonicalRequestHash = await sha256(canonicalRequest);
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

  const signingKey = await getSignatureKey(
    R2_SECRET_ACCESS_KEY,
    dateStamp,
    region,
    service
  );
  const signatureBuffer = await hmac(signingKey, stringToSign);
  const signature = toHex(signatureBuffer.buffer as ArrayBuffer);

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const uploadRes = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authorizationHeader,
    },
    body: imageBytes,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`R2 upload failed: ${uploadRes.status} - ${errText.slice(0, 200)}`);
  }

  const publicBase = R2_PUBLIC_URL.replace(/\/+$/, "");
  return `${publicBase}/${key}`;
}


const DIAGRAM_KEYWORDS = [
  "graph", "chart", "diagram", "plot", "axis", "curve", "slope",
  "equation", "formula", "calculate", "ratio", "proportion",
  "flow", "cycle", "pathway", "circuit", "structure", "anatomy",
];

function prepObjectKey(prepKey: string): string {
  return `question-images/prep-${prepKey}.png`;
}

function preparedPublicUrl(prepKey: string): string | null {
  const base = (Deno.env.get("R2_PUBLIC_URL") || "").replace(/\/+$/, "");
  return base ? `${base}/${prepObjectKey(prepKey)}` : null;
}

async function waitForPrepared(prepKey: string, maxMs: number): Promise<string | null> {
  const url = preparedPublicUrl(prepKey);
  if (!url) return null;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) return url;
    } catch { /* keep waiting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

async function generateAndUpload(
  questionText: string,
  courseTitle: string | undefined,
  imageKind: "illustration" | "diagram",
  fixedKey?: string,
): Promise<string> {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    console.log(`🎨 Generating ${imageKind}`);

    const styleGuide =
      imageKind === "diagram"
        ? "Clean, labeled educational diagram with simple shapes, arrows, and annotations. White background, minimal color palette using teal/emerald accents. No text beyond short labels."
        : "Clean, flat educational illustration. Soft pastel colors with emerald/teal accents on a light background. Simple, conceptual, no photorealism. No text in the image.";

    const courseContext = courseTitle ? ` for a ${courseTitle} course` : "";
    const prompt = `${styleGuide}\n\nConcept: ${questionText}${courseContext}\n\nCreate a simple, clear visual that helps a student understand this concept at a glance.`;

    const dalleRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1792x1024",
        quality: "standard",
        response_format: "b64_json",
      }),
    });

    if (!dalleRes.ok) {
      const errBody = await dalleRes.text();
      console.error("DALL-E API error:", dalleRes.status, errBody.slice(0, 300));
      throw new Error(`DALL-E API error: ${dalleRes.status}`);
    }

    const dalleData = await dalleRes.json();
    const b64 = dalleData.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("No image data in DALL-E response");
    }

    // Decode base64 to bytes
    const binaryString = atob(b64);
    const imageBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      imageBytes[i] = binaryString.charCodeAt(i);
    }

    console.log(`🎨 Image generated (${imageBytes.length} bytes), uploading to R2...`);

    return await uploadToR2(imageBytes, "image/png", fixedKey);
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

  try {
    const body = await req.json();
    questionId = body.questionId;
    const questionText: string = body.questionText;
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
      const url = await generateAndUpload(questionText, courseTitle, kind, prepObjectKey(prepKey));
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
      publicUrl = await generateAndUpload(questionText, courseTitle, imageKind);
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

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
