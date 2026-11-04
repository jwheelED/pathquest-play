// Storage for live-session question pictures (Cloudinary).
// R2's hand-rolled S3 signing kept failing with SignatureDoesNotMatch, so
// pictures go to Cloudinary through its signed upload API instead.

const PREP_FOLDER = "question-images";

function cloudinaryEnv() {
  const cloud = Deno.env.get("CLOUDINARY_CLOUD_NAME");
  const key = Deno.env.get("CLOUDINARY_API_KEY");
  const secret = Deno.env.get("CLOUDINARY_API_SECRET");
  if (!cloud || !key || !secret) {
    throw new Error("Cloudinary credentials not configured");
  }
  return { cloud, key, secret };
}

async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function prepPublicId(prepKey: string): string {
  return `${PREP_FOLDER}/prep-${prepKey}`;
}

/** Deterministic delivery URL for a picture pre-generated while On Deck. */
export function preparedImageUrl(prepKey: string): string | null {
  const cloud = Deno.env.get("CLOUDINARY_CLOUD_NAME");
  if (!cloud) return null;
  return `https://res.cloudinary.com/${cloud}/image/upload/v1/${prepPublicId(prepKey)}.png`;
}

/**
 * Checks whether a picture exists. A cache-busting query keeps a 404 from
 * being cached by the CDN for the clean URL participants will load.
 */
export async function imageExists(url: string): Promise<boolean> {
  try {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}chk=${Date.now()}`, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Uploads PNG bytes and returns the public HTTPS URL. */
export async function uploadQuestionImage(
  imageBytes: Uint8Array,
  publicId?: string,
): Promise<string> {
  const { cloud, key, secret } = cloudinaryEnv();
  const id = publicId ?? `${PREP_FOLDER}/${crypto.randomUUID()}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Signature: alphabetically sorted params + API secret, SHA-1 hex.
  const toSign = `overwrite=true&public_id=${id}&timestamp=${timestamp}${secret}`;
  const signature = await sha1Hex(toSign);

  const form = new FormData();
  form.append(
    "file",
    new Blob([imageBytes as BlobPart], { type: "image/png" }),
    "question.png",
  );
  form.append("api_key", key);
  form.append("timestamp", timestamp);
  form.append("public_id", id);
  form.append("overwrite", "true");
  form.append("signature", signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
    { method: "POST", body: form },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudinary upload failed: ${res.status} - ${text.slice(0, 200)}`);
  }
  const data = await res.json() as { secure_url?: string };
  if (!data.secure_url) throw new Error("Cloudinary returned no URL");
  return data.secure_url;
}
