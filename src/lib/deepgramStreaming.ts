import { logger } from "./logger";
import { validateDeepgramApiKey, getValidationErrorMessage } from "./deepgramValidation";

export interface DeepgramTranscript {
  text: string;
  isFinal: boolean;
  confidence: number;
  speakers: Array<{
    id: number;
    text: string;
    confidence: number;
  }>;
}

export interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  punctuated_word?: string;
}

export interface DeepgramStreamingConfig {
  proxyUrl?: string; // Fly.io proxy URL (e.g., wss://your-app.fly.dev)
  projectRef?: string; // Deprecated: kept for backward compatibility
  onTranscript: (data: DeepgramTranscript) => void;
  onError: (error: string) => void;
  onReady?: () => void;
  onClose?: () => void;
}

export class DeepgramStreamingClient {
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10; // Increased for long sessions (30-60+ min)
  private reconnectDelay: number = 2000;
  private audioChunksQueue: Blob[] = [];
  private isDeepgramReady: boolean = false;
  private shouldReconnect: boolean = true;
  
  // Proactive reconnection properties (only used for Supabase Edge Functions, not Fly.io proxy)
  private connectionStartTime: number = 0;
  private proactiveReconnectTimer: number | null = null;
  private isProactiveReconnect: boolean = false;
  
  // Flag to track if using Fly.io proxy (which doesn't have timeout limits)
  private usesFlyProxy: boolean = false;
  
  // Long session health monitoring (detect stale connections)
  private longSessionHealthInterval: number | null = null;
  private lastTranscriptTime: number = 0;

  constructor(private config: DeepgramStreamingConfig) {}

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      console.log("⚠️ Already connected or connecting");
      return;
    }

    // Each fresh connect indicates we should try to keep the stream alive
    this.shouldReconnect = true;
    this.isConnecting = true;

    try {
      // Determine WebSocket URL - prefer Fly.io proxy, fallback to Supabase edge function
      let wsUrl: string;
      
      if (this.config.proxyUrl) {
        // Use Fly.io proxy (no API key validation needed - proxy handles it)
        // Fly.io proxy has NO timeout limits, so we disable proactive reconnect
        wsUrl = this.config.proxyUrl;
        this.usesFlyProxy = true;
        console.log("🔗 Connecting to Fly.io Deepgram proxy (persistent connection):", wsUrl);
      } else if (this.config.projectRef) {
        // Legacy: Validate API key and use Supabase edge function
        // Supabase Edge Functions have ~60s timeout, so proactive reconnect is needed
        this.usesFlyProxy = false;
        console.log("🔍 Validating Deepgram API key...");
        const validation = await validateDeepgramApiKey();

        if (!validation.valid) {
          const errorMessage = getValidationErrorMessage(validation);
          console.error("❌ API key validation failed:", errorMessage);
          this.isConnecting = false;
          this.config.onError(errorMessage);
          return;
        }

        console.log("✅ Deepgram API key validated successfully");
        wsUrl = `wss://${this.config.projectRef}.functions.supabase.co/deepgram-streaming`;
        console.log("🔗 Connecting to Supabase streaming relay:", wsUrl);
      } else {
        throw new Error("No proxy URL or project reference configured");
      }

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("✅ WebSocket connected to relay");
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Start connection duration tracking
        this.connectionStartTime = Date.now();
        this.lastTranscriptTime = Date.now(); // Initialize for health monitoring
        
        // Only set up proactive reconnection for Supabase Edge Functions (which have ~60s timeout)
        // Fly.io proxy has NO timeout, so we skip proactive reconnect entirely
        if (!this.usesFlyProxy) {
          console.log("⏱️ Setting up proactive reconnect timer (Supabase Edge Function mode)");
          this.proactiveReconnectTimer = window.setInterval(() => {
            const connectionAge = Date.now() - this.connectionStartTime;
            console.log(`⏱️ Connection age: ${Math.round(connectionAge / 1000)}s`);
            
            if (connectionAge >= 55000) { // 55 seconds - buffer before 60s limit
              console.log("🔄 Proactive reconnect: approaching timeout limit");
              this.proactiveReconnect();
            }
          }, 5000); // Check every 5 seconds
        } else {
          console.log("🔗 Fly.io proxy mode: persistent connection, no proactive reconnect needed");
          
          // For Fly.io proxy, set up long session health monitoring
          // Detect if no transcripts received for 60s (possible stale connection)
          this.longSessionHealthInterval = window.setInterval(() => {
            const timeSinceLastTranscript = Date.now() - this.lastTranscriptTime;
            const connectionAge = Date.now() - this.connectionStartTime;
            
            // Only check after at least 30 seconds of connection
            if (connectionAge > 30000 && timeSinceLastTranscript > 60000) {
              console.warn(`⚠️ No transcript for ${Math.round(timeSinceLastTranscript / 1000)}s - connection may be stale`);
              // Don't auto-reconnect, just log warning - user might be paused
            }
          }, 30000); // Check every 30 seconds
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle control messages from relay
          if (data.type === "ready") {
            console.log("✅ Deepgram ready, starting audio capture");
            this.isDeepgramReady = true;
            this.startAudioCapture();
            this.config.onReady?.();

            // Flush any queued audio chunks
            this.flushAudioQueue();
          } else if (data.type === "error") {
            console.error("❌ Deepgram error:", data.message);
            this.config.onError(data.message);

            // Attempt reconnect on certain errors
            if (data.canRetry) {
              this.handleReconnect();
            }
          } else if (data.type === "closed") {
            console.log("🔌 Deepgram closed:", data.message);
            this.config.onClose?.();
          } else {
            // Check if this is transcript data from Deepgram
            // Deepgram Results events have "channel" or "is_final" fields
            if (data.channel || data.is_final !== undefined) {
              this.handleTranscript(data);
            } else if (data.type) {
              // Log other Deepgram events for debugging
              console.log("📡 Deepgram event:", data.type);
            }
          }
        } catch (error) {
          console.error("❌ Error parsing WebSocket message:", error);
        }
      };

      this.ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        this.isConnecting = false;
        this.config.onError("WebSocket connection error");

        // Proactively close and attempt a reconnect for transient WebSocket failures
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          try {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.close(1011, "Client-side WebSocket error");
            }
          } catch (closeError) {
            console.error("❌ Error while closing WebSocket after error:", closeError);
          }
          this.handleReconnect();
        }
      };

      this.ws.onclose = (event) => {
        console.log("🔌 WebSocket closed:", event.code, event.reason);
        this.isConnecting = false;
        this.isDeepgramReady = false;
        
        // Clear proactive reconnect timer
        if (this.proactiveReconnectTimer !== null) {
          clearInterval(this.proactiveReconnectTimer);
          this.proactiveReconnectTimer = null;
        }
        
        // Skip audio capture cleanup during proactive reconnect
        if (this.isProactiveReconnect) {
          console.log("ℹ️ WebSocket closed as part of proactive reconnect, keeping audio capture alive");
          return;
        }
        
        this.stopAudioCapture();

        // Attempt reconnect on any unexpected close while we still want streaming
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.handleReconnect();
        } else {
          this.config.onClose?.();
        }
      };
    } catch (error) {
      this.isConnecting = false;
      this.config.onError(error instanceof Error ? error.message : "Connection failed");
      throw error;
    }
  }

  private async startAudioCapture(): Promise<void> {
    try {
      // Detect mobile/iOS for flexible audio constraints
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      // Request microphone with optimal settings for speech (flexible for mobile)
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: isMobile || isIOS || isSafari ? {
          // Flexible constraints for mobile - let browser choose optimal settings
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } : {
          // Strict constraints for desktop
          channelCount: 1,
          sampleRate: 16000, // Deepgram prefers 16kHz
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      console.log("🎙️ Microphone access granted", isMobile ? "(mobile mode)" : "(desktop mode)");

      // Create MediaRecorder with appropriate MIME type (including iOS Safari support)
      const mimeTypes = [
        "audio/webm;codecs=opus",    // Chrome, Firefox, Edge
        "audio/webm",                 // Fallback for Chrome/Firefox
        "audio/mp4",                  // iOS Safari, newer Safari
        "audio/mp4;codecs=mp4a.40.2", // iOS Safari with specific codec
        "audio/ogg;codecs=opus",      // Firefox fallback
      ];

      let selectedMimeType = "";
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      if (!selectedMimeType) {
        throw new Error("No supported audio MIME type found on this device");
      }

      console.log("🎵 Using MIME type:", selectedMimeType);

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: selectedMimeType,
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          if (this.ws?.readyState === WebSocket.OPEN && this.isDeepgramReady) {
            // Send audio directly
            this.ws.send(event.data);
          } else {
            // Queue audio if not ready yet
            this.audioChunksQueue.push(event.data);
            console.log("📦 Queued audio chunk (Deepgram not ready)");
          }
        }
      };

      this.mediaRecorder.onerror = (event) => {
        console.error("❌ MediaRecorder error:", event);
        this.config.onError("Audio recording error");
      };

      // Send audio in 250ms chunks for real-time streaming
      this.mediaRecorder.start(250);
      console.log("🎙️ Audio capture started (250ms chunks)");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to start audio capture:", errorMessage);

      if (errorMessage.includes("Permission denied") || errorMessage.includes("NotAllowedError")) {
        this.config.onError("Microphone access denied. Please allow microphone permissions.");
      } else {
        this.config.onError("Failed to access microphone: " + errorMessage);
      }

      throw error;
    }
  }

  private flushAudioQueue(): void {
    if (this.audioChunksQueue.length > 0) {
      console.log(`📤 Flushing ${this.audioChunksQueue.length} queued audio chunks`);

      this.audioChunksQueue.forEach((chunk) => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(chunk);
        }
      });

      this.audioChunksQueue = [];
    }
  }

  private handleTranscript(data: any): void {
    // Track last transcript time for health monitoring
    this.lastTranscriptTime = Date.now();
    
    const channel = data.channel;
    if (!channel?.alternatives?.[0]) return;

    const alternative = channel.alternatives[0];
    const transcript = alternative.transcript;
    const isFinal = data.is_final || false;
    const confidence = alternative.confidence || 0;

    // Skip empty transcripts
    if (!transcript || transcript.trim().length === 0) {
      return;
    }

    // LAYER 1: Stricter confidence threshold (75% for final, 60% for interim)
    if (isFinal && confidence < 0.75) {
      console.warn(`⚠️ Low confidence (${(confidence * 100).toFixed(0)}%): ${transcript.substring(0, 40)}`);
      return;
    }

    // LAYER 2: Word-level confidence filtering
    const words: DeepgramWord[] = alternative.words || [];
    if (isFinal && words.length > 0) {
      const confidentWords = words.filter(w => w.confidence >= 0.6);
      const confidentRatio = confidentWords.length / words.length;
      
      if (confidentRatio < 0.5) {
        console.warn(`⚠️ Too many low-confidence words (${(confidentRatio * 100).toFixed(0)}%): ${transcript.substring(0, 40)}`);
        return;
      }
    }

    // LAYER 3: Repetition detection (stricter)
    const textWords = transcript.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    if (textWords.length >= 6) {
      const uniqueWords = new Set(textWords);
      const uniqueRatio = uniqueWords.size / textWords.length;
      
      // Reject if less than 40% unique words
      if (uniqueRatio < 0.4) {
        console.warn(`⚠️ Repetitive (${(uniqueRatio * 100).toFixed(0)}% unique): ${transcript.substring(0, 40)}`);
        return;
      }
      
      // Check for any word repeated 3+ times
      const wordCounts = new Map<string, number>();
      textWords.forEach(w => wordCounts.set(w, (wordCounts.get(w) || 0) + 1));
      for (const [word, count] of wordCounts) {
        if (count >= 3 && word.length > 2) {
          console.warn(`⚠️ Word "${word}" repeated ${count}x`);
          return;
        }
      }
    }

    // LAYER 4: Known hallucination pattern detection
    const trimmedLower = transcript.trim().toLowerCase();
    const hallPatterns = [
      /you'?re in the right place/i,
      /thank you for watching/i,
      /please subscribe/i,
      /\bmuck\s+(of\s+the\s+muck)+/i,
      /\bveve\s*,?\s*veve/i,
      /\b(uh|um)\s+\1\s+\1/i,
    ];
    
    for (const pattern of hallPatterns) {
      if (pattern.test(trimmedLower)) {
        console.warn(`⚠️ Hallucination pattern: ${transcript.substring(0, 40)}`);
        return;
      }
    }

    // Extract speaker information from words
    const speakerMap = new Map<number, { words: string[]; confidence: number[] }>();

    words.forEach((word) => {
      const speaker = word.speaker ?? 0;
      const wordText = word.punctuated_word || word.word;

      if (!speakerMap.has(speaker)) {
        speakerMap.set(speaker, { words: [], confidence: [] });
      }

      const speakerData = speakerMap.get(speaker)!;
      speakerData.words.push(wordText);
      speakerData.confidence.push(word.confidence);
    });

    // Build speaker array
    const speakers = Array.from(speakerMap.entries()).map(([id, data]) => ({
      id,
      text: data.words.join(" "),
      confidence: data.confidence.reduce((a, b) => a + b, 0) / data.confidence.length,
    }));

    // Log transcript for debugging
    const logPrefix = isFinal ? "📝 FINAL" : "📝 interim";
    const speakerInfo =
      speakers.length > 1
        ? ` [${speakers.length} speakers]`
        : speakers[0]?.id !== undefined
          ? ` [Speaker ${speakers[0].id}]`
          : "";

    console.log(`${logPrefix}${speakerInfo} (${(confidence * 100).toFixed(0)}%):`, transcript.substring(0, 100));

    // Call the transcript handler
    this.config.onTranscript({
      text: transcript,
      isFinal,
      confidence,
      speakers,
    });
  }

  private async proactiveReconnect(): Promise<void> {
    console.log("🔄 Initiating proactive reconnection (preventing timeout)");
    
    // Clear the timer to prevent duplicate reconnects
    if (this.proactiveReconnectTimer !== null) {
      clearInterval(this.proactiveReconnectTimer);
      this.proactiveReconnectTimer = null;
    }
    
    // Don't count this as a "failed" reconnect attempt
    const currentAttempts = this.reconnectAttempts;
    this.reconnectAttempts = 0;
    
    // Mark that this close is intentional and part of proactive flow
    this.isProactiveReconnect = true;
    
    // Close current connection gracefully (but keep audio recording active)
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
        this.ws.close(1000, "Proactive reconnect");
      } catch (error) {
        console.error("❌ Error during proactive close:", error);
      }
    }
    
    // Important: Don't stop audio capture - keep MediaRecorder running
    // Audio chunks will be queued automatically during the brief reconnection
    
    // Immediately reconnect
    try {
      await this.connect();
      console.log("✅ Proactive reconnection successful");
    } catch (error) {
      console.error("❌ Proactive reconnection failed:", error);
      // Restore attempt counter if reconnection fails
      this.reconnectAttempts = currentAttempts;
      this.handleReconnect();
    } finally {
      // Once new connection is up (or retries are scheduled), clear the flag
      this.isProactiveReconnect = false;
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("❌ Max reconnection attempts reached");
      this.config.onError("Failed to reconnect after multiple attempts");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error("❌ Reconnection failed:", error);
      });
    }, delay);
  }

  private stopAudioCapture(): void {
    if (this.mediaRecorder) {
      if (this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.stop();
      }
      this.mediaRecorder = null;
      console.log("🛑 MediaRecorder stopped");
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      this.stream = null;
      console.log("🛑 Media stream stopped");
    }

    // Clear any queued audio
    this.audioChunksQueue = [];
  }

  disconnect(): void {
    console.log("🔌 Disconnecting streaming client");

    // Mark this as an intentional shutdown so we don't auto-reconnect
    this.shouldReconnect = false;
    
    // Clear proactive reconnect timer
    if (this.proactiveReconnectTimer !== null) {
      clearInterval(this.proactiveReconnectTimer);
      this.proactiveReconnectTimer = null;
    }
    
    // Clear long session health interval
    if (this.longSessionHealthInterval !== null) {
      clearInterval(this.longSessionHealthInterval);
      this.longSessionHealthInterval = null;
    }
    
    this.stopAudioCapture();
    this.isDeepgramReady = false;

    if (this.ws) {
      // Send close signal to Deepgram
      if (this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: "CloseStream" }));
        } catch (error) {
          console.error("❌ Error sending close signal:", error);
        }
        this.ws.close(1000, "Client disconnect");
      }
      this.ws = null;
    }

    this.reconnectAttempts = 0;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.isDeepgramReady;
  }

  getConnectionState(): string {
    if (!this.ws) return "disconnected";

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return "connecting";
      case WebSocket.OPEN:
        return this.isDeepgramReady ? "ready" : "initializing";
      case WebSocket.CLOSING:
        return "closing";
      case WebSocket.CLOSED:
        return "closed";
      default:
        return "unknown";
    }
  }
}
