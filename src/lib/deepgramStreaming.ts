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

  constructor(private config: DeepgramStreamingConfig) {}

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      console.log("⚠️ Already connected or connecting");
      return;
    }

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
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
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
            // Transcript data from Deepgram
            this.handleTranscript(data);
          }
        } catch (error) {
          console.error("❌ Error parsing WebSocket message:", error);
        }
      };

      this.ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        this.isConnecting = false;
        this.config.onError("WebSocket connection error");
      };

      this.ws.onclose = (event) => {
        console.log("🔌 WebSocket closed:", event.code, event.reason);
        this.isConnecting = false;
        this.isDeepgramReady = false;
        this.stopAudioCapture();

        // Attempt reconnect if not a clean close
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
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
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ];

      let selectedMimeType = '';
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
      
      this.audioChunksQueue.forEach(chunk => {
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
    const speakerMap = new Map<number, { words: string[], confidence: number[] }>();
    
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
    const speakerInfo = speakers.length > 1 
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
      this.connect().catch(error => {
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
      this.stream.getTracks().forEach(track => {
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
