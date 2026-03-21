// upload-to-cloudinary: uploads files to Cloudflare R2 (S3-compatible)
// Uses manual AWS Signature V4 + native fetch (no AWS SDK — Deno compatible)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(data: Uint8Array | string): Promise<string> {
  const encoded = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", encoded.buffer as ArrayBuffer);
  return toHex(hash);
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

async function getSignatureKey(secretKey: string, dateStamp: string, region: string, service: string): Promise<Uint8Array> {
  let key = await hmac(new TextEncoder().encode("AWS4" + secretKey), dateStamp);
  key = await hmac(key, region);
  key = await hmac(key, service);
  key = await hmac(key, "aws4_request");
  return key;
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeObjectKey(key: string): string {
  return key.split("/").map(encodeRfc3986).join("/");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth check ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // --- End auth check ---

    const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID");
    const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID");
    const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME");
    const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL");

    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
      throw new Error("Cloudflare R2 credentials not configured");
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const folder = (formData.get("folder") as string) || "student-materials";

    if (!file) {
      throw new Error("No file provided");
    }

    console.log("File received:", { name: file.name, size: file.size, type: file.type });

    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const uniqueId = crypto.randomUUID();
    const key = `${folder}/${uniqueId}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const body = new Uint8Array(arrayBuffer);
    const fileContentType = file.type || "application/octet-stream";

    const encodedKey = encodeObjectKey(key);
    const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const canonicalUri = `/${encodeRfc3986(R2_BUCKET_NAME)}/${encodedKey}`;
    const url = `https://${host}${canonicalUri}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const dateStamp = amzDate.slice(0, 8);
    const region = "auto";
    const service = "s3";
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

    const payloadHash = await sha256(body);

    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}${signedHeaders}\n${payloadHash}`;

    const canonicalRequestHash = await sha256(canonicalRequest);
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

    const signingKey = await getSignatureKey(R2_SECRET_ACCESS_KEY, dateStamp, region, service);
    const signatureBuffer = await hmac(signingKey, stringToSign);
    const signature = toHex(signatureBuffer.buffer as ArrayBuffer);

    const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const uploadRes = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": fileContentType,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        "Authorization": authorizationHeader,
      },
      body: body,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("R2 upload failed:", uploadRes.status, errText);
      throw new Error(`R2 upload failed: ${uploadRes.status} - ${errText.slice(0, 200)}`);
    }

    const publicBase = R2_PUBLIC_URL.replace(/\/+$/, "");
    const publicUrl = `${publicBase}/${key}`;

    console.log("Upload successful:", { publicUrl, bytes: arrayBuffer.byteLength });

    return new Response(
      JSON.stringify({
        url: publicUrl,
        key,
        contentType: file.type,
        bytes: arrayBuffer.byteLength,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("R2 upload error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
