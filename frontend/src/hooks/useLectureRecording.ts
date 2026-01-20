import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { usePresenterBroadcast } from '@/hooks/useLecturePresenterChannel';
import { analyzeContentQuality } from '@/lib/contentQuality';
import { playNotificationSound } from '@/lib/audioNotification';
import { DeepgramStreamingClient, DeepgramTranscript } from '@/lib/deepgramStreaming';
import { useVoiceCommandDetection } from '@/hooks/useVoiceCommandDetection';
import { createReliableTimer, type ReliableTimer } from '@/lib/reliableTimer';
import { retryWithBackoff } from '@/lib/retryWithBackoff';

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

export interface ExtractedVoiceQuestion {
  question_text: string;
  suggested_type: 'short_answer' | 'multiple_choice';
}

export interface UseLectureRecordingOptions {
  onQuestionGenerated?: () => void;
  slideContext?: string;
  onVoiceCommand?: (type: 'send_question' | 'send_slide_question') => void;
  /** Callback when a voice command extracts a question - allows preview before sending */
  onQuestionExtracted?: (data: ExtractedVoiceQuestion) => void;
}

export function useLectureRecording(options: UseLectureRecordingOptions = {}) {
  const { onQuestionGenerated, slideContext, onVoiceCommand, onQuestionExtracted } = options;
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
  
  // Store course context (topics, title) for AI question generation
  const courseContextRef = useRef<{ title: string; topics: string[] } | null>(null);

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
  
  // Question preview setting - when false, questions send immediately without preview
  const [questionPreviewEnabled, setQuestionPreviewEnabled] = useState(true);
  const questionPreviewEnabledRef = useRef(true);
  
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
  
  // Reliable timer ref for auto-questions (Web Worker-based, throttle-resistant)
  const reliableTimerRef = useRef<ReliableTimer | null>(null);
  
  // Rolling transcript buffer settings - prevents memory issues on long intervals
  const TRANSCRIPT_MAX_LENGTH = 20000; // ~4000 words, enough for 30+ mins of lecture
  const intervalTranscriptSnapshotRef = useRef<string>(''); // Backup snapshot for recovery
  const transcriptChunkCountRef = useRef(0); // Track chunks for batched state updates
  
  // Refs for values that the timer needs (avoids stale closures)
  const studentCountRef = useRef(studentCount);
  const autoQuestionIntervalRef = useRef(autoQuestionInterval);
  
  // Deepgram streaming refs for real-time transcription
  const deepgramClientRef = useRef<DeepgramStreamingClient | null>(null);
  const [isStreamingMode, setIsStreamingMode] = useState(false);

  // Keep refs updated when state changes (avoids stale closures in timer callbacks)
  useEffect(() => {
    studentCountRef.current = studentCount;
  }, [studentCount]);

  useEffect(() => {
    autoQuestionIntervalRef.current = autoQuestionInterval;
  }, [autoQuestionInterval]);

  // Refs for callbacks to avoid timer reset on callback recreation
  const handleAutoQuestionGenerationWithRetryRef = useRef<() => Promise<boolean>>();
  const broadcastRef = useRef<typeof broadcast>();

  // Keep callback refs updated
  useEffect(() => {
    broadcastRef.current = broadcast;
  }, [broadcast]);

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

        // Fetch profile settings including course context and preview preference
        const { data: profile } = await supabase
          .from('profiles')
          .select('auto_question_enabled, auto_question_interval, auto_question_force_send, course_title, course_topics, question_preview_enabled')
          .eq('id', user.id)
          .single();

        if (profile) {
          setAutoQuestionEnabled(profile.auto_question_enabled || false);
          setAutoQuestionInterval(profile.auto_question_interval || 15);
          setAutoQuestionForceSend(profile.auto_question_force_send !== false);
          
          // Question preview preference
          const previewEnabled = profile.question_preview_enabled !== false;
          setQuestionPreviewEnabled(previewEnabled);
          questionPreviewEnabledRef.current = previewEnabled;
          console.log('👁️ Question preview enabled:', previewEnabled);
          
          // Store course context for AI question generation
          courseContextRef.current = {
            title: profile.course_title || '',
            topics: profile.course_topics || []
          };
          console.log('📚 Course context loaded:', courseContextRef.current);
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
        body: {
          ...detectionData,
          course_context: courseContextRef.current,
        },
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
        
        // Reset reliable timer after successful question send
        if (autoQuestionEnabled && reliableTimerRef.current) {
          reliableTimerRef.current.reset();
          intervalTranscriptRef.current = '';
          console.log('⏰ Timer reset after question sent');
        }
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

  // Auto-question generation (core logic)
  const handleAutoQuestionGeneration = async (): Promise<boolean> => {
    try {
      setIsSendingQuestion(true);
      
      // Refresh auth token before long-interval operations (prevents 401 after 20+ mins)
      console.log('🔑 Refreshing auth before auto-question generation');
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('❌ Auth refresh failed:', refreshError);
        toast({
          title: '⚠️ Session expired',
          description: 'Please refresh the page',
          variant: 'destructive',
        });
        return false;
      }
      
      // Use current interval transcript, with snapshot as backup
      const intervalTranscript = intervalTranscriptRef.current || intervalTranscriptSnapshotRef.current;

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
        .select('question_format_preference, coding_question_style')
        .eq('id', user.id)
        .single();

      const formatPreference = profile?.question_format_preference || 'multiple_choice';
      const codingStyle = profile?.coding_question_style || 'simple';

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
          coding_question_style: codingStyle,
          force_send: autoQuestionForceSend,
          strict_mode: true,
          slide_context: slideContextRef.current,
          course_context: courseContextRef.current,
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

      // Auto-generated questions always send directly - no preview
      await handleQuestionSend({
        question_text: data.question_text,
        suggested_type: data.suggested_type,
        confidence: data.confidence,
        expected_answer: data.expected_answer || "",
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

  // Auto-question generation with retry logic
  const handleAutoQuestionGenerationWithRetry = useCallback(async (): Promise<boolean> => {
    try {
      const success = await retryWithBackoff(
        async () => {
          const result = await handleAutoQuestionGeneration();
          if (!result) {
            throw new Error('Auto-question generation returned false');
          }
          return result;
        },
        {
          maxAttempts: 2,
          baseDelayMs: 2000,
          maxDelayMs: 5000,
          onRetry: (attempt, error, nextDelayMs) => {
            console.log(`🔄 Auto-question retry ${attempt}: ${error.message}. Waiting ${nextDelayMs}ms...`);
            toast({
              title: '⏳ Retrying...',
              description: `Attempt ${attempt + 1} to generate question`,
            });
          },
        }
      );

      if (success) {
        playNotificationSound().catch(() => {});
        console.log('✅ Auto-question sent successfully');
      }

      return success;
    } catch (error) {
      console.error('Auto-question failed after retries:', error);
      toast({
        title: '❌ Auto-question failed',
        description: 'Could not generate question. Will try again next interval.',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  // Keep callback ref updated (must be after the function definition)
  useEffect(() => {
    handleAutoQuestionGenerationWithRetryRef.current = handleAutoQuestionGenerationWithRetry;
  }, [handleAutoQuestionGenerationWithRetry]);

  // Reliable auto-question timer using Web Worker (throttle-resistant)
  useEffect(() => {
    if (!isRecording || !autoQuestionEnabled) {
      // Stop timer when not recording or auto-question disabled
      if (reliableTimerRef.current) {
        reliableTimerRef.current.stop();
      }
      return;
    }

    // Create reliable timer if it doesn't exist
    if (!reliableTimerRef.current) {
      console.log('⏰ Creating reliable timer (Web Worker-based)');
      reliableTimerRef.current = createReliableTimer({
        onTick: (secondsLeft, elapsedMs) => {
          setNextAutoQuestionIn(secondsLeft);

          // Broadcast to presenter views (use ref to avoid stale closure)
          broadcastRef.current?.('countdown_tick', {
            nextAutoQuestionIn: secondsLeft,
            autoQuestionEnabled: true,
            isRecording: true,
            studentCount: studentCountRef.current,
          });

          // Broadcast to student timer (less frequently to reduce traffic)
          if (studentTimerChannelRef.current && (secondsLeft % 5 === 0 || secondsLeft <= 10)) {
            try {
              // Only send if channel is in a good state
              if (studentTimerChannelRef.current.state === 'joined') {
                studentTimerChannelRef.current.send({
                  type: 'broadcast',
                  event: 'timer_update',
                  payload: {
                    nextQuestionIn: secondsLeft,
                    intervalMinutes: autoQuestionIntervalRef.current,
                    autoQuestionEnabled: true,
                    isRecording: true,
                  },
                });
              }
            } catch (err) {
              console.warn('⚠️ Failed to broadcast timer to students:', err);
              // Don't throw - timer should continue regardless
            }
          }
        },
        onIntervalComplete: async () => {
          if (isGeneratingAutoQuestionRef.current) {
            console.log('⏭️ Skipping auto-question: already generating');
            return;
          }

          console.log('⏰ Reliable timer: Interval complete, generating question');
          
          // Create snapshot of transcript BEFORE generation (prevents loss during processing)
          intervalTranscriptSnapshotRef.current = intervalTranscriptRef.current;
          console.log(`📸 Transcript snapshot created: ${intervalTranscriptSnapshotRef.current.length} chars`);
          
          isGeneratingAutoQuestionRef.current = true;

          try {
            // Reconnect broadcast channel if stale (fixes 20-min interval issues)
            if (studentTimerChannelRef.current) {
              const status = studentTimerChannelRef.current.state;
              if (status !== 'joined') {
                console.log('🔄 Reconnecting stale student timer channel (was:', status, ')');
                await supabase.removeChannel(studentTimerChannelRef.current);
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                  const channelName = `lecture-timer-${user.id}`;
                  studentTimerChannelRef.current = supabase.channel(channelName);
                  await studentTimerChannelRef.current.subscribe();
                  console.log('✅ Student timer channel reconnected');
                }
              }
            }
            
            const success = await handleAutoQuestionGenerationWithRetryRef.current?.() ?? false;
            if (success) {
              // Clear both transcript refs only after successful question
              intervalTranscriptRef.current = '';
              intervalTranscriptSnapshotRef.current = '';
            }
          } finally {
            isGeneratingAutoQuestionRef.current = false;
          }
        },
        onError: (error) => {
          console.error('Reliable timer error:', error);
        },
      });
    }

    // Start or continue the timer with current interval (won't reset if already running same interval)
    console.log(`⏰ Timer check: ${autoQuestionInterval} minutes`);
    // Only update snapshot if timer is actually starting fresh
    if (!reliableTimerRef.current.isRunning() || reliableTimerRef.current.getCurrentInterval() !== autoQuestionInterval) {
      intervalTranscriptSnapshotRef.current = intervalTranscriptRef.current || '';
    }
    reliableTimerRef.current.continueOrStart(autoQuestionInterval);

    return () => {
      if (reliableTimerRef.current) {
        reliableTimerRef.current.stop();
      }
    };
  }, [isRecording, autoQuestionEnabled, autoQuestionInterval]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (reliableTimerRef.current) {
        reliableTimerRef.current.terminate();
        reliableTimerRef.current = null;
      }
    };
  }, []);

  // Periodic channel health check (every 5 mins during recording)
  useEffect(() => {
    if (!isRecording) return;
    
    const healthCheckInterval = setInterval(async () => {
      console.log('🏥 Checking realtime channel health...');
      
      // Check student timer channel
      if (studentTimerChannelRef.current && studentTimerChannelRef.current.state !== 'joined') {
        console.log('🔄 Reconnecting stale student timer channel...');
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.removeChannel(studentTimerChannelRef.current);
          const channelName = `lecture-timer-${user.id}`;
          studentTimerChannelRef.current = supabase.channel(channelName);
          await studentTimerChannelRef.current.subscribe();
          console.log('✅ Student timer channel health restored');
        }
      }
      
      // Refresh auth proactively during long recordings
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        console.warn('⚠️ Proactive auth refresh failed:', error.message);
      } else {
        console.log('🔑 Auth token refreshed proactively');
      }
    }, 5 * 60 * 1000); // Every 5 minutes
    
    return () => clearInterval(healthCheckInterval);
  }, [isRecording]);

  // Reset state when recording stops
  useEffect(() => {
    if (!isRecording) {
      setNextAutoQuestionIn(0);
      intervalTranscriptRef.current = '';
      isGeneratingAutoQuestionRef.current = false;
      resetVoiceCommandCooldown();
      
      // Stop and cleanup timer
      if (reliableTimerRef.current) {
        reliableTimerRef.current.stop();
      }
    }
  }, [isRecording, resetVoiceCommandCooldown]);

  // Voice command detection - check transcriptChunks for commands
  useEffect(() => {
    if (!isRecording || transcriptChunks.length === 0) return;
    
    checkTranscriptForCommand(transcriptChunks);
  }, [isRecording, transcriptChunks, checkTranscriptForCommand]);

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
    
    const proxyUrl = import.meta.env.VITE_DEEPGRAM_PROXY_URL || 'wss://edvana-deepgram-proxy.fly.dev';
    
    deepgramClientRef.current = new DeepgramStreamingClient({
      proxyUrl,
      onTranscript: (data: DeepgramTranscript) => {
        if (data.isFinal && data.text.trim()) {
          console.log('📝 Deepgram final transcript:', data.text);
          
          // Append to rolling buffers
          transcriptBufferRef.current += ' ' + data.text;
          intervalTranscriptRef.current += ' ' + data.text;
          
          // Trim interval transcript if exceeding max length (keep most recent content)
          if (intervalTranscriptRef.current.length > TRANSCRIPT_MAX_LENGTH) {
            intervalTranscriptRef.current = intervalTranscriptRef.current.slice(-TRANSCRIPT_MAX_LENGTH);
            console.log('✂️ Trimmed interval transcript to max length');
          }
          
          // Update React state less frequently to reduce re-renders (every 5 chunks)
          transcriptChunkCountRef.current++;
          setLastTranscript(data.text);
          
          if (transcriptChunkCountRef.current % 5 === 0) {
            // Batch update - show last few transcripts for display
            const recentText = intervalTranscriptRef.current.slice(-2000);
            setTranscriptChunks([recentText]);
          }
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

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      isRecordingRef.current = true;
      setIsRecording(true);
      setTranscriptChunks([]);
      transcriptBufferRef.current = '';
      intervalTranscriptRef.current = '';
      setFailureCount(0);

      console.log('🌊 Using Deepgram WebSocket streaming via Fly.io proxy');
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
  }, [startDeepgramStreaming, broadcast, toast]);

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

    // Stop reliable timer
    if (reliableTimerRef.current) {
      reliableTimerRef.current.stop();
    }

    broadcast('recording_status', { isRecording: false });
    toast({ title: 'Recording stopped' });
  }, [broadcast, toast, stopDeepgramStreaming]);

  // Manual question send
  const handleManualQuestionSend = useCallback(async () => {
    if (isSendingQuestion) return;

    try {
      setIsSendingQuestion(true);

      // Wait briefly for transcript buffer to catch up (voice command itself was just transcribed)
      await new Promise(resolve => setTimeout(resolve, 500));

      const hasTranscript = transcriptBufferRef.current && transcriptBufferRef.current.length >= 20;
      const hasSlideContext = slideContextRef.current && slideContextRef.current.length >= 20;

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

      // If preview is enabled AND callback is provided, show preview dialog
      if (questionPreviewEnabledRef.current && onQuestionExtracted) {
        console.log('📋 Question extracted, opening preview dialog (preview enabled)');
        onQuestionExtracted({
          question_text: data.question_text,
          suggested_type: data.suggested_type || 'short_answer',
        });
        return;
      }

      // Preview disabled or no callback - send immediately
      console.log('📤 Sending question immediately (preview disabled or no callback)');
      await handleQuestionSend({
        question_text: data.question_text,
        suggested_type: data.suggested_type,
        confidence: 1.0,
        extraction_method: 'manual_button',
        source: 'manual_button',
      });

      // Timer reset is now handled in handleQuestionSend
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
  }, [isSendingQuestion, toast, onQuestionExtracted]);

  // Send an extracted question after user confirmation from preview dialog
  const sendExtractedQuestion = useCallback(async (extractedData: {
    question_text: string;
    suggested_type: string;
  }) => {
    try {
      setIsSendingQuestion(true);
      
      // Voice command or manual button - send with preview data
      await handleQuestionSend({
        question_text: extractedData.question_text,
        suggested_type: extractedData.suggested_type,
        confidence: 1.0,
        extraction_method: 'voice_command',
        source: 'voice_command',
      });
    } catch (error: any) {
      console.error('Send extracted question error:', error);
      toast({
        title: 'Failed',
        description: error.message || 'Could not send',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsSendingQuestion(false);
    }
  }, [toast]);

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
        .select('question_format_preference, coding_question_style')
        .eq('id', user.id)
        .single();

      const { data, error } = await supabase.functions.invoke('generate-interval-question', {
        body: {
          interval_transcript: intervalTranscript,
          interval_minutes: autoQuestionInterval,
          format_preference: profile?.question_format_preference || 'multiple_choice',
          coding_question_style: profile?.coding_question_style || 'simple',
          force_send: true,
          strict_mode: true,
          slide_context: slideContextRef.current,
          course_context: courseContextRef.current,
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
          
          // Stop reliable timer
          if (reliableTimerRef.current) {
            reliableTimerRef.current.stop();
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
    sendExtractedQuestion,
  };
}
