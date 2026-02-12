import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_OUTPUT_CHARS = 4000;

/**
 * Extract readable text from a PDF byte array.
 * This is a lightweight approach that looks for text between BT/ET operators
 * and parenthesized strings, without requiring a full PDF parser.
 */
function extractTextFromPdf(bytes: Uint8Array): string {
  // Convert to string for regex scanning (latin1 to preserve byte values)
  const raw = new TextDecoder("latin1").decode(bytes);

  const textChunks: string[] = [];

  // Strategy 1: Extract parenthesized text strings (most common in PDFs)
  // Matches text inside parentheses in PDF content streams
  const parenRegex = /\(([^)]{2,})\)/g;
  let match: RegExpExecArray | null;
  while ((match = parenRegex.exec(raw)) !== null) {
    const text = match[1]
      // Unescape PDF string escapes
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\")
      // Remove non-printable characters
      .replace(/[^\x20-\x7E\n\r\t]/g, "");

    if (text.trim().length > 1) {
      textChunks.push(text.trim());
    }
  }

  // Strategy 2: Extract hex-encoded strings <hex>
  const hexRegex = /<([0-9A-Fa-f\s]{4,})>/g;
  while ((match = hexRegex.exec(raw)) !== null) {
    const hex = match[1].replace(/\s/g, "");
    if (hex.length % 2 !== 0) continue;
    let decoded = "";
    for (let i = 0; i < hex.length; i += 2) {
      const code = parseInt(hex.substring(i, i + 2), 16);
      if (code >= 32 && code <= 126) {
        decoded += String.fromCharCode(code);
      }
    }
    if (decoded.trim().length > 2) {
      textChunks.push(decoded.trim());
    }
  }

  // Deduplicate while preserving order, join into readable text
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const chunk of textChunks) {
    if (!seen.has(chunk)) {
      seen.add(chunk);
      unique.push(chunk);
    }
  }

  return unique.join(" ").slice(0, MAX_OUTPUT_CHARS);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { filePath } = await req.json();

    if (!filePath || typeof filePath !== "string") {
      return new Response(
        JSON.stringify({ error: "filePath is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("📄 Parsing material:", filePath);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("lecture-materials")
      .download(filePath);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      return new Response(
        JSON.stringify({ error: "Failed to download file", details: downloadError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fileType = filePath.split(".").pop()?.toLowerCase() || "";
    let text = "";

    if (fileType === "pdf") {
      // Extract text from PDF bytes
      const bytes = new Uint8Array(await fileData.arrayBuffer());
      text = extractTextFromPdf(bytes);
      console.log(`📄 PDF extracted: ${text.length} chars`);
    } else if (["txt", "md", "markdown", "csv", "text"].includes(fileType)) {
      // Plain text files — read directly
      text = (await fileData.text()).slice(0, MAX_OUTPUT_CHARS);
      console.log(`📝 Text file read: ${text.length} chars`);
    } else {
      // Unsupported type — return filename as minimal context
      text = `[File: ${filePath.split("/").pop()}]`;
      console.log(`⚠️ Unsupported file type: ${fileType}`);
    }

    return new Response(
      JSON.stringify({
        text,
        file_type: fileType,
        chars: text.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Parse error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
