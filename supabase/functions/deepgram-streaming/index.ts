import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { 
      status: 426,
      headers: corsHeaders 
    });
  }

  console.log("🔌 New WebSocket connection request");

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
      
      // Utterance detection (helps with final transcripts)
      deepgramURL.searchParams.set("utterance_end_ms", "1000");
      deepgramURL.searchParams.set("vad_events", "true");

      console.log("🔗 Connecting to Deepgram:", deepgramURL.toString().split('?')[0]);

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

      deepgramWS.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("📥 Deepgram event:", data.type || "transcript");

          // Forward all Deepgram messages to client
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }

          // Log transcript data for debugging
          if (data.channel?.alternatives?.[0]?.transcript) {
            const transcript = data.channel.alternatives[0].transcript;
            const isFinal = data.is_final || false;
            console.log(`📝 ${isFinal ? 'FINAL' : 'interim'}:`, transcript.substring(0, 80));
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
