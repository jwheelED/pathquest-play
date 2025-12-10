import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { usePresenterBroadcast } from '@/hooks/useLecturePresenterChannel';
import { analyzeContentQuality } from '@/lib/contentQuality';
import { playNotificationSound } from '@/lib/audioNotification';
import { DeepgramStreamingClient, DeepgramTranscript } from '@/lib/deepgramStreaming';
import { useVoiceCommandDetection } from '@/hooks/useVoiceCommandDetection';

// Constants
const MAX_CONSECUTIVE_FAILURES = 5;
const RECORDING_CHUNK_DURATION = 8000;
const MAX_RECORDING_CYCLES = 50;

export interface LectureRecordingState {
  isRecording: boolean;
  recordingDuration: number;
  transcriptChunks: string[];
  lastTranscript: string;
  isSendingQuestion: boolean;
  studentCount: number;
  autoQuestionEnabled: boolean;
  autoQuestionInterval: number;
  nextAutoQuestionIn: number;
  dailyQuestionCount: number;
  voiceCommandDetected: boolean;
  isProcessing: boolean;
  isStreamingMode: boolean;
}

export interface LectureRecordingActions {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  handleManualQuestionSend: () => Promise<void>;
  handleTestAutoQuestion: () => Promise<void>;
  toggleAutoQuestion: () => Promise<void>;
}

export interface UseLectureRecordingOptions {
  onQuestionGenerated?: () => void;
  slideContext?: string;
  onVoiceCommand?: (type: 'send_question' | 'send_slide_question') => void;
}

export function useLectureRecording(options: UseLectureRecordingOptions = {}) {
  const { onQuestionGenerated, slideContext, onVoiceCommand } = options;
  const { toast } = useToast();
  const { broadcast } = usePresenterBroadcast();
  
  // Voice command detection hook
  const { checkTranscriptForCommand, resetCooldown: resetVoiceCommandCooldown } = useVoiceCommandDetection({
    cooldownMs: 5000,
    onCommandDetected: (type) => {
      if (type && onVoiceCommand) {
        console.log(`🎤 Voice command detected: ${type}`);
        setVoiceCommandDetected(true);
        setTimeout(() => setVoiceCommandDetected(false), 2000);
        onVoiceCommand(type);
      }
    },
  });
  
  // Store slide context in a ref so it's always current
  const slideContextRef = useRef<string>('');

  // Core state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [transcriptChunks, setTranscriptChunks] = useState<string[]>([]);
  const [lastTranscript, setLastTranscript] = useState('');
  const [isSendingQuestion, setIsSendingQuestion] = useState(false);
  const [studentCount, setStudentCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [voiceCommandDetected, setVoiceCommandDetected] = useState(false);
  const [failureCount, setFailureCount] = useState(0);
  const [dailyQuestionCount, setDailyQuestionCount] = useState(0);

  // Auto-question state
  const [autoQuestionEnabled, setAutoQuestionEnabled] = useState(false);
  const [autoQuestionInterval, setAutoQuestionInterval] = useState(15);
  const [autoQuestionForceSend, setAutoQuestionForceSend] = useState(true);
  const [nextAutoQuestionIn, setNextAutoQuestionIn] = useState(0);
  
  // Update slide context ref when prop changes
  useEffect(() => {
    slideContextRef.current = slideContext || '';
  }, [slideContext]);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptBufferRef = useRef<string>('');
  const intervalTranscriptRef = useRef<string>('');
  const isRecordingRef = useRef(false);
  const recordingCycleCountRef = useRef(0);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const intervalStartTimeRef = useRef<number>(0);
  const isGeneratingAutoQuestionRef = useRef(false);
  const lastQuestionSentTimeRef = useRef<number>(0);
  const studentTimerChannelRef = useRef<any>(null);
  const processAudioChunkRef = useRef<((audioBlob: Blob) => Promise<void>) | null>(null);
  
  // Deepgram streaming refs for real-time transcription
  const deepgramClientRef = useRef<DeepgramStreamingClient | null>(null);
  const [isStreamingMode, setIsStreamingMode] = useState(false);

  // Helper to get question preview
  const getQuestionPreview = (questionText: any, maxLength = 60): string => {
    if (typeof questionText === 'string') {
      return questionText.substring(0, maxLength);
    }
    if (questionText?.title) {
      return `[Coding] ${questionText.title}`;
    }
    if (questionText?.problemStatement) {
      return questionText.problemStatement.substring(0, maxLength);
    }
    return 'Question';
  };

  // Fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch student count
        const { data: students } = await supabase
          .from('instructor_students')
          .select('student_id')
          .eq('instructor_id', user.id);

        if (students) setStudentCount(students.length);

        // Fetch profile settings
        const { data: profile } = await supabase
          .from('profiles')
          .select('auto_question_enabled, auto_question_interval, auto_question_force_send')
          .eq('id', user.id)
          .single();

        if (profile) {
          setAutoQuestionEnabled(profile.auto_question_enabled || false);
          setAutoQuestionInterval(profile.auto_question_interval || 15);
          setAutoQuestionForceSend(profile.auto_question_force_send !== false);
        }

        // Fetch today's question count
        const today = new Date().toISOString().split('T')[0];
        const { count } = await supabase
          .from('student_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('instructor_id', user.id)
          .eq('assignment_type', 'lecture_checkin')
          .gte('created_at', today);

        if (count !== null) setDailyQuestionCount(count);
      } catch (error) {
        console.error('Error fetching initial data:', error);
      }
    };

    fetchInitialData();
  }, []);

  // Setup student timer broadcast channel
  useEffect(() => {
    const setupChannel = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isRecording) return;

      const channelName = `lecture-timer-${user.id}`;
      studentTimerChannelRef.current = supabase.channel(channelName);
      await studentTimerChannelRef.current.subscribe();
    };

    if (isRecording) setupChannel();

    return () => {
      if (studentTimerChannelRef.current) {
        supabase.removeChannel(studentTimerChannelRef.current);
        studentTimerChannelRef.current = null;
      }
    };
  }, [isRecording]);

  // Recording duration timer
  useEffect(() => {
    if (!isRecording) {
      setRecordingDuration(0);
      return;
    }

    const startTime = Date.now();
    durationTimerRef.current = setInterval(() => {
      const newDuration = Math.floor((Date.now() - startTime) / 1000);
      setRecordingDuration(newDuration);

      broadcast('state_update', {
        isRecording: true,
        recordingDuration: newDuration,
        autoQuestionEnabled,
        autoQuestionInterval,
        studentCount,
        nextAutoQuestionIn,
      });
    }, 1000);

    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
    };
  }, [isRecording, autoQuestionEnabled, autoQuestionInterval, studentCount, broadcast]);

  // Auto-question timer - use ref for start time to avoid stale closure issues
  const lastAutoQuestionTimeRef = useRef<number>(0);
  
  useEffect(() => {
    if (!isRecording || !autoQuestionEnabled) return;

    const intervalMs = autoQuestionInterval * 60 * 1000;

    // Initialize start time when recording begins with auto-question enabled
    if (lastAutoQuestionTimeRef.current === 0) {
      lastAutoQuestionTimeRef.current = Date.now();
    }

    const checkInterval = setInterval(() => {
      if (isGeneratingAutoQuestionRef.current) return;

      const now = Date.now();
      const elapsed = now - lastAutoQuestionTimeRef.current;
      const timeLeft = intervalMs - elapsed;
      const secondsLeft = Math.max(0, Math.ceil(timeLeft / 1000));

      setNextAutoQuestionIn(secondsLeft);

      broadcast('countdown_tick', {
        nextAutoQuestionIn: secondsLeft,
        autoQuestionEnabled: true,
        isRecording: true,
        studentCount,
      });

      if (studentTimerChannelRef.current && (secondsLeft % 5 === 0 || secondsLeft <= 10)) {
        studentTimerChannelRef.current.send({
          type: 'broadcast',
          event: 'timer_update',
          payload: { nextQuestionIn: secondsLeft, intervalMinutes: autoQuestionInterval, autoQuestionEnabled: true, isRecording: true }
        });
      }

      if (elapsed >= intervalMs && !isGeneratingAutoQuestionRef.current) {
        isGeneratingAutoQuestionRef.current = true;
        handleAutoQuestionGeneration()
          .then((success) => {
            lastAutoQuestionTimeRef.current = Date.now();
            if (success) {
              intervalTranscriptRef.current = '';
            }
          })
          .finally(() => {
            isGeneratingAutoQuestionRef.current = false;
          });
      }
    }, 1000);

    return () => clearInterval(checkInterval);
  }, [isRecording, autoQuestionEnabled, autoQuestionInterval, studentCount, broadcast]);

  // Reset state when recording stops
  useEffect(() => {
    if (!isRecording) {
      lastAutoQuestionTimeRef.current = 0;
      setNextAutoQuestionIn(0);
      intervalTranscriptRef.current = '';
      isGeneratingAutoQuestionRef.current = false;
    }
  }, [isRecording]);

  // Voice command detection - check transcriptChunks for commands
  useEffect(() => {
    if (!isRecording || transcriptChunks.length === 0) return;
    
    // Check the latest transcript chunks for voice commands
    checkTranscriptForCommand(transcriptChunks);
  }, [isRecording, transcriptChunks, checkTranscriptForCommand]);

  // Handle question send
  const handleQuestionSend = async (detectionData: any) => {
    try {
      console.log('📤 Sending question:', detectionData);

      await supabase.auth.refreshSession();

      broadcast('question_sent', {
        lastQuestionSent: {
          question: getQuestionPreview(detectionData.question_text, 100),
          type: detectionData.suggested_type || 'multiple_choice',
          timestamp: new Date().toISOString(),
        },
      });

      if (studentTimerChannelRef.current) {
        studentTimerChannelRef.current.send({
          type: 'broadcast',
          event: 'question_sent',
          payload: { timestamp: new Date().toISOString() }
        });
      }

      toast({
        title: '🎯 Question detected!',
        description: `"${getQuestionPreview(detectionData.question_text, 60)}..." - Sending to students...`,
      });

      const { data, error } = await supabase.functions.invoke('format-and-send-question', {
        body: detectionData,
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      if (data?.success) {
        playNotificationSound().catch(() => {});
        setDailyQuestionCount((prev) => prev + 1);
        
        toast({
          title: '✅ Question sent!',
          description: `Delivered to ${data.sent_to} students`,
        });

        sonnerToast.success('Question Delivered!', {
          description: `${data.sent_to} student${data.sent_to !== 1 ? 's' : ''} received your question`,
        });

        onQuestionGenerated?.();
        lastQuestionSentTimeRef.current = Date.now();
      }
    } catch (error: any) {
      console.error('Failed to send question:', error);
      toast({
        title: '❌ Failed to send',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
      throw error;
    }
  };

  // Auto-question generation
  const handleAutoQuestionGeneration = async (): Promise<boolean> => {
    try {
      setIsSendingQuestion(true);
      const intervalTranscript = intervalTranscriptRef.current;

      if (!autoQuestionForceSend && intervalTranscript.length < 50) {
        toast({
          title: '⏭️ Skipped',
          description: 'Need more lecture content',
        });
        return false;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data: profile } = await supabase
        .from('profiles')
        .select('question_format_preference')
        .eq('id', user.id)
        .single();

      const formatPreference = profile?.question_format_preference || 'multiple_choice';

      toast({
        title: '⏰ Auto-question!',
        description: 'Generating from recent content...',
      });

      setVoiceCommandDetected(true);
      setTimeout(() => setVoiceCommandDetected(false), 2000);

      const { data, error } = await supabase.functions.invoke('generate-interval-question', {
        body: {
          interval_transcript: intervalTranscript,
          interval_minutes: autoQuestionInterval,
          format_preference: formatPreference,
          force_send: autoQuestionForceSend,
          strict_mode: true, // Always strict mode - guaranteed questions
          slide_context: slideContextRef.current, // Pass current slide text
        },
      });

      if (error || !data?.success) {
        console.error('Auto-question failed:', error || data);
        toast({
          title: '⚠️ Skipped',
          description: data?.error || 'Could not generate question',
        });
        return false;
      }

      await handleQuestionSend({
        question_text: data.question_text,
        suggested_type: data.suggested_type,
        confidence: data.confidence,
        extraction_method: 'auto_interval',
        source: 'auto_interval',
      });

      return true;
    } catch (error) {
      console.error('Auto-question error:', error);
      return false;
    } finally {
      setIsSendingQuestion(false);
    }
  };

  // Process audio chunk - use ref to always have latest version
  const processAudioChunk = useCallback(async (audioBlob: Blob) => {
    try {
      if (!audioBlob || audioBlob.size < 1000) {
        console.log('Audio blob too small:', audioBlob?.size);
        return;
      }

      console.log('Processing audio chunk, size:', audioBlob.size);

      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result?.toString().split(',')[1];
        if (!base64Audio) {
          console.log('No base64 audio data');
          return;
        }

        console.log('Sending to transcribe-lecture, base64 length:', base64Audio.length);

        try {
          const { data, error } = await supabase.functions.invoke('transcribe-lecture', {
            body: { audio: base64Audio },
          });

          if (error) {
            console.error('Transcription error:', error);
            setFailureCount((prev) => prev + 1);
            return;
          }

          console.log('Transcription result:', data);

          if (data?.text?.trim()) {
            const newText = data.text.trim();
            console.log('New transcript chunk:', newText);
            setFailureCount(0);
            setTranscriptChunks((prev) => [...prev, newText]);
            setLastTranscript(newText);

            transcriptBufferRef.current += ' ' + newText;
            intervalTranscriptRef.current += ' ' + newText;
            console.log('Buffer length now:', transcriptBufferRef.current.length);
          }
        } catch (err) {
          console.error('Transcription failed:', err);
        }
      };
    } catch (error) {
      console.error('Process audio error:', error);
    }
  }, []);

  // Keep ref updated with latest processAudioChunk
  useEffect(() => {
    processAudioChunkRef.current = processAudioChunk;
  }, [processAudioChunk]);

  // Start recording cycle
  const startRecordingCycle = useCallback(async () => {
    if (!streamRef.current) return;

    try {
      recordingCycleCountRef.current++;
      if (recordingCycleCountRef.current >= MAX_RECORDING_CYCLES) {
        recordingCycleCountRef.current = 0;
        if (mediaRecorderRef.current) {
          mediaRecorderRef.current.ondataavailable = null;
          mediaRecorderRef.current.onstop = null;
          mediaRecorderRef.current = null;
        }
      }

      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      let mimeType = '';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      if (!mimeType) throw new Error('No supported audio format');

      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        if (chunks.length > 0) {
          const audioBlob = new Blob(chunks, { type: mimeType });
          console.log('Recording cycle complete, processing audio blob');
          // Use ref to get latest processAudioChunk
          if (processAudioChunkRef.current) {
            await processAudioChunkRef.current(audioBlob);
          }
        }
        chunks.length = 0;

        if (isRecordingRef.current && streamRef.current) {
          setTimeout(() => {
            if (isRecordingRef.current && streamRef.current) {
              startRecordingCycle();
            }
          }, 100);
        }
      };

      mediaRecorder.start();

      recordingIntervalRef.current = setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, RECORDING_CHUNK_DURATION);
    } catch (error) {
      console.error('Recording cycle error:', error);
      setFailureCount((prev) => prev + 1);

      if (failureCount >= MAX_CONSECUTIVE_FAILURES - 1) {
        stopRecording();
        toast({
          title: 'Recording paused',
          description: 'Multiple errors. Please restart.',
          variant: 'destructive',
        });
      } else if (isRecordingRef.current) {
        setTimeout(() => {
          if (isRecordingRef.current && streamRef.current) {
            startRecordingCycle();
          }
        }, 1000 * Math.pow(2, failureCount));
      }
    }
  }, [failureCount, toast]);

  // Start Deepgram streaming for real-time transcription
  const startDeepgramStreaming = useCallback(async () => {
    console.log('🔴 Starting Deepgram WebSocket streaming for real-time transcription');
    
    // Use Fly.io proxy for Deepgram streaming (bypasses Supabase edge function timeout limits)
    // Replace with your actual Fly.io app URL after deployment
    const proxyUrl = import.meta.env.VITE_DEEPGRAM_PROXY_URL || 'wss://edvana-deepgram-proxy.fly.dev';
    
    deepgramClientRef.current = new DeepgramStreamingClient({
      proxyUrl,
      onTranscript: (data: DeepgramTranscript) => {
        if (data.isFinal && data.text.trim()) {
          console.log('📝 Deepgram final transcript:', data.text);
          setTranscriptChunks(prev => [...prev, data.text]);
          setLastTranscript(data.text);
          transcriptBufferRef.current += ' ' + data.text;
          intervalTranscriptRef.current += ' ' + data.text;
        }
      },
      onError: (error) => {
        console.error('❌ Deepgram streaming error:', error);
        toast({
          title: 'Transcription error',
          description: error,
          variant: 'destructive',
        });
      },
      onReady: () => {
        console.log('✅ Deepgram streaming ready');
        setIsStreamingMode(true);
      },
      onClose: () => {
        console.log('🔌 Deepgram streaming closed');
        setIsStreamingMode(false);
      },
    });
    
    try {
      await deepgramClientRef.current.connect();
    } catch (error) {
      console.error('Failed to connect Deepgram:', error);
      // Fallback to chunk-based transcription
      toast({
        title: 'Streaming unavailable',
        description: 'Using chunked transcription instead',
      });
      startRecordingCycle();
    }
  }, [toast, startRecordingCycle]);

  // Stop Deepgram streaming
  const stopDeepgramStreaming = useCallback(() => {
    if (deepgramClientRef.current) {
      console.log('🛑 Stopping Deepgram streaming');
      deepgramClientRef.current.disconnect();
      deepgramClientRef.current = null;
      setIsStreamingMode(false);
    }
  }, []);

  // Start recording - TESTING: Always use Deepgram WebSocket streaming via Fly.io proxy
  const startRecording = useCallback(async () => {
    try {
      isRecordingRef.current = true;
      setIsRecording(true);
      setTranscriptChunks([]);
      transcriptBufferRef.current = '';
      intervalTranscriptRef.current = '';
      setFailureCount(0);

      // TESTING: Always use Deepgram WebSocket streaming to test Fly.io proxy
      console.log('🌊 TESTING MODE: Using Deepgram WebSocket streaming via Fly.io proxy');
      if (autoQuestionEnabled) {
        lastAutoQuestionTimeRef.current = Date.now();
      }
      await startDeepgramStreaming();

      broadcast('recording_status', { isRecording: true });

      toast({
        title: '🎙️ Recording started',
        description: 'Real-time Deepgram streaming (Fly.io proxy)',
      });
    } catch (error) {
      console.error('Start recording error:', error);
      isRecordingRef.current = false;
      setIsRecording(false);
      toast({
        title: 'Failed to start',
        description: error instanceof Error ? error.message : 'Microphone error',
        variant: 'destructive',
      });
    }
  }, [autoQuestionEnabled, startDeepgramStreaming, broadcast, toast]);

  // Stop recording - cleans up both modes
  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);

    // Stop chunk-based recording
    if (recordingIntervalRef.current) {
      clearTimeout(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      streamRef.current = null;
    }

    // Stop Deepgram streaming
    stopDeepgramStreaming();

    broadcast('recording_status', { isRecording: false });
    toast({ title: 'Recording stopped' });
  }, [broadcast, toast, stopDeepgramStreaming]);

  // Manual question send
  const handleManualQuestionSend = useCallback(async () => {
    if (isSendingQuestion) return;

    try {
      setIsSendingQuestion(true);

      const hasTranscript = transcriptBufferRef.current && transcriptBufferRef.current.length >= 20;
      const hasSlideContext = slideContextRef.current && slideContextRef.current.length >= 20;

      // Allow manual send if we have either transcript OR slide context
      if (!hasTranscript && !hasSlideContext) {
        toast({
          title: 'Still processing audio',
          description: 'Please wait a moment for more content...',
        });
        return;
      }

      toast({
        title: '🔍 Extracting question',
        description: 'Analyzing recent speech...',
      });

      const recentTranscript = transcriptBufferRef.current.slice(-1500);

      const { data, error } = await supabase.functions.invoke('extract-voice-command-question', {
        body: { recentTranscript },
      });

      if (error || !data?.success || !data?.question_text) {
        toast({
          title: 'Could not extract question',
          description: 'Try asking a clearer question',
          variant: 'destructive',
        });
        return;
      }

      await handleQuestionSend({
        question_text: data.question_text,
        suggested_type: data.suggested_type,
        confidence: 1.0,
        extraction_method: 'manual_button',
        source: 'manual_button',
      });

      if (autoQuestionEnabled) {
        lastAutoQuestionTimeRef.current = Date.now();
        intervalTranscriptRef.current = '';
      }
    } catch (error: any) {
      console.error('Manual send error:', error);
      toast({
        title: 'Failed',
        description: error.message || 'Could not send',
        variant: 'destructive',
      });
    } finally {
      setIsSendingQuestion(false);
    }
  }, [isSendingQuestion, autoQuestionEnabled, toast]);

  // Test auto-question
  const handleTestAutoQuestion = useCallback(async () => {
    const intervalTranscript = intervalTranscriptRef.current.trim();

    if (intervalTranscript.length < 100) {
      toast({
        title: 'Cannot Test',
        description: `Need 100+ characters. Current: ${intervalTranscript.length}`,
        variant: 'destructive',
      });
      return;
    }

    if (isSendingQuestion) {
      toast({
        title: 'Please Wait',
        description: 'Already processing',
      });
      return;
    }

    toast({
      title: '🧪 Testing',
      description: 'Generating test question...',
    });

    setIsSendingQuestion(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('question_format_preference')
        .eq('id', user.id)
        .single();

      const { data, error } = await supabase.functions.invoke('generate-interval-question', {
        body: {
          interval_transcript: intervalTranscript,
          interval_minutes: autoQuestionInterval,
          format_preference: profile?.question_format_preference || 'multiple_choice',
          force_send: true,
          strict_mode: true, // Always strict mode
          slide_context: slideContextRef.current,
        },
      });

      if (error || !data?.success) {
        toast({
          title: '🧪 Test Failed',
          description: data?.error || 'Could not generate',
          variant: 'destructive',
        });
        return;
      }

      await handleQuestionSend({
        question_text: data.question_text,
        suggested_type: data.suggested_type,
        confidence: data.confidence,
        extraction_method: 'manual_test',
        source: 'manual_test',
      });
    } finally {
      setIsSendingQuestion(false);
    }
  }, [isSendingQuestion, autoQuestionInterval, toast]);

  // Toggle auto-question - switches transcription mode mid-recording if needed
  const toggleAutoQuestion = useCallback(async () => {
    const newState = !autoQuestionEnabled;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update({ auto_question_enabled: newState })
        .eq('id', user.id);

      if (error) throw error;

      setAutoQuestionEnabled(newState);

      // Handle mid-recording mode switch
      if (isRecording) {
        if (newState) {
          // Switching to ON: stop Deepgram streaming, start chunk-based
          console.log('🔄 Switching to chunk-based transcription (auto-question ON)');
          stopDeepgramStreaming();
          
          // Get microphone access for chunk-based recording
          const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: isMobile ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            } : {
              channelCount: 1,
              sampleRate: 16000,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          streamRef.current = stream;
          lastAutoQuestionTimeRef.current = Date.now();
          startRecordingCycle();
        } else {
          // Switching to OFF: stop chunk-based, start Deepgram streaming
          console.log('🔄 Switching to Deepgram streaming (auto-question OFF)');
          
          // Stop chunk-based recording
          if (recordingIntervalRef.current) {
            clearTimeout(recordingIntervalRef.current);
            recordingIntervalRef.current = null;
          }
          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
          mediaRecorderRef.current = null;
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => {
              track.stop();
              track.enabled = false;
            });
            streamRef.current = null;
          }
          
          // Start Deepgram streaming
          await startDeepgramStreaming();
        }
      }

      toast({
        title: newState ? '✅ Auto-Questions On' : '⏸️ Auto-Questions Off',
        description: newState 
          ? `Every ${autoQuestionInterval} min (chunked mode)` 
          : 'Paused (real-time streaming)',
      });
    } catch (error) {
      console.error('Toggle error:', error);
      toast({
        title: 'Error',
        description: 'Failed to update setting',
        variant: 'destructive',
      });
    }
  }, [autoQuestionEnabled, autoQuestionInterval, isRecording, toast, stopDeepgramStreaming, startDeepgramStreaming, startRecordingCycle]);

  return {
    // State
    isRecording,
    recordingDuration,
    transcriptChunks,
    lastTranscript,
    isSendingQuestion,
    studentCount,
    autoQuestionEnabled,
    autoQuestionInterval,
    nextAutoQuestionIn,
    dailyQuestionCount,
    voiceCommandDetected,
    isProcessing,
    isStreamingMode,

    // Actions
    startRecording,
    stopRecording,
    handleManualQuestionSend,
    handleTestAutoQuestion,
    toggleAutoQuestion,
  };
}
