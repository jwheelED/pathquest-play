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
      // Build Deepgram WebSocket URL
      const url = new URL("wss://api.deepgram.com/v1/listen");
      url.searchParams.set("model", "nova-2");
      url.searchParams.set("language", "en");
      url.searchParams.set("smart_format", "true");
      url.searchParams.set("numerals", "true"); // Convert spoken numbers to digits
      url.searchParams.set("interim_results", "true");
      url.searchParams.set("punctuate", "true");
      url.searchParams.set("diarize", "true");
      url.searchParams.set("encoding", "opus");
      url.searchParams.set("channels", "1");
      url.searchParams.set("utterance_end_ms", "1000");
      url.searchParams.set("vad_events", "true");
      
      // Math/STEM keyword boosting to improve accuracy for technical terms
      const mathKeywords = [
        "derivative:2", "integral:2", "equation:2", "variable:2",
        "coefficient:2", "exponent:2", "logarithm:2", "polynomial:2",
        "quadratic:2", "calculus:2", "algebra:2", "trigonometry:2",
        "sine:2", "cosine:2", "tangent:2", "function:2",
        "limit:2", "infinity:2", "summation:2", "sigma:2",
        "delta:2", "theta:2", "pi:2", "squared:2", "cubed:2",
        "x:1", "y:1", "z:1", "f of x:2", "g of x:2",
        "plus:1", "minus:1", "times:1", "divided by:1", "equals:1",
        "greater than:1", "less than:1", "approximately:1",
        "fraction:2", "numerator:2", "denominator:2",
        "matrix:2", "vector:2", "scalar:2", "determinant:2"
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
