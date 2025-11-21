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
  projectRef: string;
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
  private maxReconnectAttempts: number = 3;
  private reconnectDelay: number = 2000;
  private audioChunksQueue: Blob[] = [];
  private isDeepgramReady: boolean = false;
  private shouldReconnect: boolean = true;
  
  // Proactive reconnection properties
  private connectionStartTime: number = 0;
  private connectionDurationLimit: number = 60000; // 60 seconds - safely before edge function timeout
  private proactiveReconnectTimer: number | null = null;
  private isProactiveReconnect: boolean = false;

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
      // Validate API key before attempting to connect
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

      // Connect to relay edge function via WebSocket
      const wsUrl = `wss://${this.config.projectRef}.functions.supabase.co/deepgram-streaming`;
      console.log("🔗 Connecting to streaming relay:", wsUrl);

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("✅ WebSocket connected to relay");
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Start connection duration tracking
        this.connectionStartTime = Date.now();
        
        // Set up proactive reconnection monitoring
        this.proactiveReconnectTimer = window.setInterval(() => {
          const connectionAge = Date.now() - this.connectionStartTime;
          console.log(`⏱️ Connection age: ${Math.round(connectionAge / 1000)}s`);
          
          if (connectionAge >= 55000) { // 55 seconds - buffer before 60s limit
            console.log("🔄 Proactive reconnect: approaching timeout limit");
            this.proactiveReconnect();
          }
        }, 5000); // Check every 5 seconds
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
      // Request microphone with optimal settings for speech
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000, // Deepgram prefers 16kHz
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      console.log("🎙️ Microphone access granted");

      // Create MediaRecorder with appropriate MIME type
      const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

      let selectedMimeType = "";
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      if (!selectedMimeType) {
        throw new Error("No supported audio MIME type found");
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

    // Extract speaker information from words
    const words: DeepgramWord[] = alternative.words || [];
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

    console.log(`${logPrefix}${speakerInfo}:`, transcript.substring(0, 100));

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
