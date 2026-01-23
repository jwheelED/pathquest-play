/**
 * Deepgram WebSocket Proxy Server
 * Runs on Fly.io/Railway for persistent connections (no 60s timeout)
 */

const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY");
const PORT = parseInt(Deno.env.get("PORT") || "8080");

console.log(`🚀 Starting Deepgram WebSocket Proxy on port ${PORT}`);

Deno.serve({ port: PORT }, (req) => {
  const upgrade = req.headers.get("upgrade") || "";
  
  if (upgrade.toLowerCase() !== "websocket") {
    // Health check endpoint
    if (new URL(req.url).pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", timestamp: Date.now() }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("WebSocket connection required", { status: 426 });
  }

  if (!DEEPGRAM_API_KEY) {
    console.error("❌ DEEPGRAM_API_KEY not configured");
    return new Response("Server misconfigured", { status: 500 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  
  let deepgramWS: WebSocket | null = null;
  let keepAliveInterval: number | null = null;
  let connectionStartTime: number | null = null;

  socket.onopen = () => {
    connectionStartTime = Date.now();
    console.log("✅ Client connected to proxy");

    try {
      // Build Deepgram WebSocket URL with Audio Intelligence features
      const url = new URL("wss://api.deepgram.com/v1/listen");
      url.searchParams.set("model", "nova-2-general");  // More stable for diverse audio
      url.searchParams.set("language", "en");
      url.searchParams.set("smart_format", "true");
      url.searchParams.set("numerals", "true"); // Convert spoken numbers to digits
      url.searchParams.set("interim_results", "true");
      url.searchParams.set("punctuate", "true");
      url.searchParams.set("diarize", "true");
      url.searchParams.set("encoding", "opus");
      url.searchParams.set("channels", "1");
      
      // Audio Intelligence features for hallucination prevention
      url.searchParams.set("filler_words", "true");     // Detect um, uh, etc. separately
      url.searchParams.set("utterances", "true");       // Natural speech segmentation
      url.searchParams.set("endpointing", "300");       // Faster endpoint detection (ms)
      url.searchParams.set("utterance_end_ms", "800");  // Shorter utterance boundary
      url.searchParams.set("vad_events", "true");
      url.searchParams.set("no_delay", "true");         // Reduce latency
      
      // Math/STEM keyword boosting with higher weights
      const mathKeywords = [
        "derivative:3", "integral:3", "equation:3", "variable:3",
        "coefficient:3", "exponent:3", "logarithm:3", "polynomial:3",
        "quadratic:3", "calculus:3", "algebra:3", "trigonometry:3",
        "sine:3", "cosine:3", "tangent:3", "function:3",
        "limit:3", "infinity:3", "summation:3", "sigma:3",
        "delta:3", "theta:3", "pi:3", "squared:3", "cubed:3",
        "x:2", "y:2", "z:2", "f of x:3", "g of x:3",
        "plus:2", "minus:2", "times:2", "divided by:2", "equals:2",
        "greater than:2", "less than:2", "approximately:2",
        "fraction:3", "numerator:3", "denominator:3",
        "matrix:3", "vector:3", "scalar:3", "determinant:3",
        "hypothesis:3", "theorem:3", "proof:3", "lemma:3"
      ];
      url.searchParams.set("keywords", mathKeywords.join(","));

      console.log("🔗 Connecting to Deepgram...");

      deepgramWS = new WebSocket(url.toString(), ["token", DEEPGRAM_API_KEY]);

      deepgramWS.onopen = () => {
        console.log("✅ Connected to Deepgram");
        
        socket.send(JSON.stringify({ 
          type: "ready",
          message: "Real-time transcription active"
        }));

        // Keep-alive every 8 seconds (Deepgram timeout is 10s)
        keepAliveInterval = setInterval(() => {
          if (deepgramWS?.readyState === WebSocket.OPEN) {
            deepgramWS.send(JSON.stringify({ type: "KeepAlive" }));
          }
        }, 8000);
      };

      deepgramWS.onmessage = (event) => {
        try {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }

          // Log transcript snippets for debugging
          const data = JSON.parse(event.data);
          if (data.channel?.alternatives?.[0]?.transcript) {
            const transcript = data.channel.alternatives[0].transcript;
            const isFinal = data.is_final || false;
            if (transcript.trim()) {
              console.log(`📝 ${isFinal ? 'FINAL' : 'interim'}: ${transcript.substring(0, 60)}...`);
            }
          }
        } catch (error) {
          console.error("❌ Error processing Deepgram message:", error);
        }
      };

      deepgramWS.onerror = (error) => {
        console.error("❌ Deepgram WebSocket error:", error);
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ 
            type: "error", 
            message: "Transcription service error",
            canRetry: true
          }));
        }
      };

      deepgramWS.onclose = (event) => {
        const duration = connectionStartTime ? Math.round((Date.now() - connectionStartTime) / 1000) : 0;
        console.log(`🔌 Deepgram closed after ${duration}s - Code: ${event.code}, Reason: ${event.reason}`);
        
        cleanup();
        
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ 
            type: "closed",
            message: "Transcription service disconnected",
            duration
          }));
          socket.close(1000, "Deepgram connection closed");
        }
      };

    } catch (error) {
      console.error("❌ Setup error:", error);
      socket.send(JSON.stringify({ 
        type: "error", 
        message: "Failed to initialize transcription" 
      }));
      socket.close(1011, "Setup failed");
    }
  };

  socket.onmessage = (event) => {
    if (deepgramWS?.readyState === WebSocket.OPEN) {
      try {
        if (typeof event.data === "string") {
          const message = JSON.parse(event.data);
          console.log("📤 Control message:", message.type);
          deepgramWS.send(event.data);
        } else {
          // Binary audio data - forward directly
          deepgramWS.send(event.data);
        }
      } catch (error) {
        console.error("❌ Error forwarding to Deepgram:", error);
      }
    }
  };

  socket.onclose = () => {
    const duration = connectionStartTime ? Math.round((Date.now() - connectionStartTime) / 1000) : 0;
    console.log(`🔌 Client disconnected after ${duration}s`);
    cleanup();
  };

  socket.onerror = (error) => {
    console.error("❌ Client socket error:", error);
    cleanup();
  };

  function cleanup() {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
    if (deepgramWS?.readyState === WebSocket.OPEN) {
      deepgramWS.send(JSON.stringify({ type: "CloseStream" }));
      deepgramWS.close(1000, "Client disconnected");
    }
    deepgramWS = null;
  }

  return response;
});

console.log(`✅ Proxy server listening on port ${PORT}`);
