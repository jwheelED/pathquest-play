import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_OUTPUT_CHARS = 4000;

/**
 * Extract readable text from a PDF byte array.
 */
function extractTextFromPdf(bytes: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(bytes);
  const textChunks: string[] = [];

  // Strategy 1: Extract parenthesized text strings
  const parenRegex = /\(([^)]{2,})\)/g;
  let match: RegExpExecArray | null;
  while ((match = parenRegex.exec(raw)) !== null) {
    const text = match[1]
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\")
      .replace(/[^\x20-\x7E\n\r\t]/g, "");
    if (text.trim().length > 1) {
      textChunks.push(text.trim());
    }
  }

  // Strategy 2: Extract hex-encoded strings
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

/**
 * Strip XML tags and return plain text content.
 */
function stripXmlTags(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract text from a PPTX file (ZIP containing XML slides).
 */
async function extractTextFromPptx(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const slideTexts: string[] = [];

  // Get all slide files, sorted by slide number
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/i)?.[1] || "0");
      const numB = parseInt(b.match(/slide(\d+)/i)?.[1] || "0");
      return numA - numB;
    });

  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async("text");
    const text = stripXmlTags(xml);
    if (text.length > 2) {
      const slideNum = slidePath.match(/slide(\d+)/i)?.[1] || "?";
      slideTexts.push(`[Slide ${slideNum}] ${text}`);
    }
  }

  // Also try to extract from notes
  const noteFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name))
    .sort();

  for (const notePath of noteFiles) {
    const xml = await zip.files[notePath].async("text");
    const text = stripXmlTags(xml);
    if (text.length > 10) {
      const noteNum = notePath.match(/notesSlide(\d+)/i)?.[1] || "?";
      slideTexts.push(`[Notes ${noteNum}] ${text}`);
    }
  }

  return slideTexts.join("\n\n").slice(0, MAX_OUTPUT_CHARS);
}

/**
 * Extract text from a DOCX file (ZIP containing XML document).
 */
async function extractTextFromDocx(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const docParts: string[] = [];

  // Main document body
  const docFile = zip.files["word/document.xml"];
  if (docFile) {
    const xml = await docFile.async("text");
    const text = stripXmlTags(xml);
    if (text.length > 2) {
      docParts.push(text);
    }
  }

  // Headers
  for (const name of Object.keys(zip.files)) {
    if (/^word\/header\d+\.xml$/i.test(name)) {
      const xml = await zip.files[name].async("text");
      const text = stripXmlTags(xml);
      if (text.length > 5) {
        docParts.push(`[Header] ${text}`);
      }
    }
  }

  // Footers
  for (const name of Object.keys(zip.files)) {
    if (/^word\/footer\d+\.xml$/i.test(name)) {
      const xml = await zip.files[name].async("text");
      const text = stripXmlTags(xml);
      if (text.length > 5) {
        docParts.push(`[Footer] ${text}`);
      }
    }
  }

  return docParts.join("\n\n").slice(0, MAX_OUTPUT_CHARS);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { filePath, saveToDb } = await req.json();

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
      const bytes = new Uint8Array(await fileData.arrayBuffer());
      text = extractTextFromPdf(bytes);
      console.log(`📄 PDF extracted: ${text.length} chars`);
    } else if (fileType === "pptx" || fileType === "ppt") {
      const bytes = new Uint8Array(await fileData.arrayBuffer());
      text = await extractTextFromPptx(bytes);
      console.log(`📊 PPTX extracted: ${text.length} chars`);
    } else if (fileType === "docx" || fileType === "doc") {
      const bytes = new Uint8Array(await fileData.arrayBuffer());
      text = await extractTextFromDocx(bytes);
      console.log(`📝 DOCX extracted: ${text.length} chars`);
    } else if (["txt", "md", "markdown", "csv", "text"].includes(fileType)) {
      text = (await fileData.text()).slice(0, MAX_OUTPUT_CHARS);
      console.log(`📝 Text file read: ${text.length} chars`);
    } else {
      text = `[File: ${filePath.split("/").pop()}]`;
      console.log(`⚠️ Unsupported file type: ${fileType}`);
    }

    // Optionally save parsed text back to the DB
    if (saveToDb && text.length > 30) {
      const { error: updateErr } = await supabase
        .from("lecture_materials")
        .update({ parsed_text: text })
        .eq("file_path", filePath);
      if (updateErr) {
        console.error("Failed to save parsed_text:", updateErr);
      } else {
        console.log(`💾 Saved parsed_text for ${filePath}`);
      }
    }

    return new Response(
      JSON.stringify({
        text,
        file_type: fileType,
        chars: text.length,
        saved: saveToDb && text.length > 30,
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
