import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting: max connections per IP
const ipConnectionCounts = new Map<string, { count: number; resetTime: number }>();
const MAX_CONNECTIONS_PER_IP = 3; // Max 3 concurrent connections per IP
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute window

function getClientIP(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
         req.headers.get('cf-connecting-ip') ||
         req.headers.get('x-real-ip') ||
         'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const record = ipConnectionCounts.get(ip);

  if (!record || now > record.resetTime) {
    ipConnectionCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (record.count >= MAX_CONNECTIONS_PER_IP) {
    return { allowed: false, reason: 'Too many connections. Please try again later.' };
  }

  record.count++;
  return { allowed: true };
}

// Validate origin - only allow known domains
function validateOrigin(req: Request): boolean {
  const origin = req.headers.get('origin') || '';
  const allowedPatterns = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/.*\.lovable\.app$/,
    /^https?:\/\/.*\.lovableproject\.com$/,
    /^https?:\/\/.*\.supabase\.co$/,
  ];

  // Also check referer as fallback
  const referer = req.headers.get('referer') || '';

  return allowedPatterns.some(pattern => pattern.test(origin) || pattern.test(referer));
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIP = getClientIP(req);

  // Validate origin
  if (!validateOrigin(req)) {
    console.warn(`⛔ Rejected connection from unauthorized origin. IP: ${clientIP}`);
    return new Response("Unauthorized origin", {
      status: 403,
      headers: corsHeaders
    });
  }

  // Check rate limit
  const rateLimitCheck = checkRateLimit(clientIP);
  if (!rateLimitCheck.allowed) {
    console.warn(`⛔ Rate limit exceeded for IP: ${clientIP}`);
    return new Response(JSON.stringify({ error: rateLimitCheck.reason }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", {
      status: 426,
      headers: corsHeaders
    });
  }

  console.log(`🔌 New WebSocket connection request from IP: ${clientIP}`);

  const { socket, response } = Deno.upgradeWebSocket(req);
  const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY");

  if (!DEEPGRAM_API_KEY) {
    console.error("❌ DEEPGRAM_API_KEY not configured");
    socket.close(1008, "API key not configured");
    return response;
  }

  let deepgramWS: WebSocket | null = null;
  let keepAliveInterval: number | null = null;

  socket.onopen = () => {
    console.log("✅ Client connected to relay");

    try {
      // Build Deepgram WebSocket URL with streaming configuration
      const deepgramURL = new URL("https://api.deepgram.com/v1/listen");

      // Core streaming settings
      deepgramURL.searchParams.set("model", "nova-2");
      deepgramURL.searchParams.set("language", "en");
      deepgramURL.searchParams.set("smart_format", "true");
      deepgramURL.searchParams.set("interim_results", "true");
      deepgramURL.searchParams.set("punctuate", "true");
      deepgramURL.searchParams.set("diarize", "true"); // Speaker detection

      // Audio format settings - match browser MediaRecorder (Opus in WebM/OGG)
      deepgramURL.searchParams.set("encoding", "opus");
      deepgramURL.searchParams.set("channels", "1");

      // ── Sentence-boundary tuning (Issue B fix — see
      //    docs/decision-guides/live-lecture-reliability.html R7) ──────────────
      //
      // `endpointing` (ms): silence required before a chunk is finalized as an
      // `is_final`. Deepgram's default is ~10ms, which is so aggressive that any
      // natural breath pause inside a long question (e.g. "If a cell has a high
      // surface-area-to-volume ratio, [breath] what advantage does that give it?")
      // splits the sentence into two finals. 500ms catches natural mid-sentence
      // pauses without adding meaningful detection latency.
      deepgramURL.searchParams.set("endpointing", "500");

      // `utterance_end_ms`: silence required before Deepgram emits an
      // UtteranceEnd event (the "speaker has truly stopped" signal). Bumped
      // from 1000 → 1500 so the client can rely on UtteranceEnd as the trigger
      // for completed-sentence detection (see R8 follow-up).
      deepgramURL.searchParams.set("utterance_end_ms", "1500");

      deepgramURL.searchParams.set("vad_events", "true");

      // Log the full query string (minus the API key, which is sent as a
      // WebSocket subprotocol header — not in the URL) so the actual streaming
      // config used in production is visible in function logs. Diagnostic D6.
      console.log("🔗 Connecting to Deepgram with params:", deepgramURL.search);

      // Connect to Deepgram with authentication header
      deepgramWS = new WebSocket(deepgramURL.toString(), [
        "token",
        DEEPGRAM_API_KEY,
      ]);

      deepgramWS.onopen = () => {
        console.log("✅ Connected to Deepgram streaming API");

        // Send ready signal to client
        socket.send(JSON.stringify({
          type: "ready",
          message: "Real-time transcription active"
        }));

        // Keep-alive ping every 5 seconds
        keepAliveInterval = setInterval(() => {
          if (deepgramWS?.readyState === WebSocket.OPEN) {
            deepgramWS.send(JSON.stringify({ type: "KeepAlive" }));
            console.log("💓 Sent keep-alive to Deepgram");
          }
        }, 5000);
      };

      // Track time-of-last-final for D5 diagnostic. Lets us see in logs how
      // far apart consecutive finals arrive — large gaps with split sentences
      // mean endpointing is still too aggressive.
      let lastFinalAt = 0;

      deepgramWS.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Forward all Deepgram messages to client first (don't let logging
          // delay transcript delivery).
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }

          // Structured logging for transcript events. Diagnostic D5.
          const transcript = data.channel?.alternatives?.[0]?.transcript;
          if (transcript) {
            const isFinal = data.is_final || false;
            const now = Date.now();
            const gapMs = isFinal && lastFinalAt ? now - lastFinalAt : null;
            if (isFinal) lastFinalAt = now;
            console.log(JSON.stringify({
              evt: 'dg.transcript',
              final: isFinal,
              chars: transcript.length,
              gap_ms_since_prev_final: gapMs,
              preview: transcript.substring(0, 80),
            }));
          } else if (data.type === 'UtteranceEnd') {
            console.log(JSON.stringify({
              evt: 'dg.utterance_end',
              last_word_end: data.last_word_end ?? null,
            }));
          } else if (data.type) {
            console.log("📡 Deepgram event:", data.type);
          }
        } catch (error) {
          console.error("❌ Error parsing Deepgram message:", error);
        }
      };

      deepgramWS.onerror = (error) => {
        console.error("❌ Deepgram WebSocket error:", error);

        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "error",
            message: "Transcription service connection error",
            canRetry: true
          }));
        }
      };

      deepgramWS.onclose = (event) => {
        console.log("🔌 Deepgram connection closed:", event.code, event.reason);

        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
          keepAliveInterval = null;
        }

        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "closed",
            message: "Transcription service disconnected"
          }));
          socket.close(1000, "Deepgram connection closed");
        }
      };

    } catch (error) {
      console.error("❌ Error setting up Deepgram connection:", error);
      socket.send(JSON.stringify({
        type: "error",
        message: "Failed to initialize transcription service"
      }));
      socket.close(1011, "Setup failed");
    }
  };

  socket.onmessage = (event) => {
    // Forward audio data from client to Deepgram
    if (deepgramWS?.readyState === WebSocket.OPEN) {
      try {
        // Check if it's binary audio data or control message
        if (typeof event.data === "string") {
          const message = JSON.parse(event.data);
          console.log("📤 Client control message:", message.type);

          // Forward control messages to Deepgram
          deepgramWS.send(event.data);
        } else {
          // Binary audio data
          deepgramWS.send(event.data);
        }
      } catch (error) {
        console.error("❌ Error forwarding to Deepgram:", error);
      }
    } else {
      console.warn("⚠️ Deepgram not ready, dropping audio chunk");
    }
  };

  socket.onclose = () => {
    console.log("🔌 Client disconnected from relay");

    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }

    if (deepgramWS?.readyState === WebSocket.OPEN) {
      // Send close frame to Deepgram
      deepgramWS.send(JSON.stringify({ type: "CloseStream" }));
      deepgramWS.close(1000, "Client disconnected");
    }
  };

  socket.onerror = (error) => {
    console.error("❌ Client WebSocket error:", error);

    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }

    deepgramWS?.close(1011, "Client error");
  };

  return response;
});
