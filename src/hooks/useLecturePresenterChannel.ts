import { useEffect, useRef, useCallback } from 'react';

export interface PresenterBroadcastData {
  isRecording?: boolean;
  autoQuestionEnabled?: boolean;
  autoQuestionInterval?: number; // in minutes
  nextAutoQuestionIn?: number; // countdown in seconds
  lastQuestionSent?: {
    question: string;
    type: string;
    timestamp: string;
  };
  transcriptLength?: number;
  contentQualityScore?: number;
  studentCount?: number;
  recordingDuration?: number;
}

export interface PresenterBroadcast {
  type: 'state_update' | 'question_sent' | 'recording_status' | 'countdown_tick';
  data: PresenterBroadcastData;
}

const CHANNEL_NAME = 'lecture-presenter';

/**
 * Hook for broadcasting presenter state from LectureTranscription
 */
export const usePresenterBroadcast = () => {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    try {
      channelRef.current = new BroadcastChannel(CHANNEL_NAME);
      console.log('📡 Presenter broadcast channel opened');
    } catch (error) {
      console.error('Failed to create broadcast channel:', error);
    }

    return () => {
      channelRef.current?.close();
      channelRef.current = null;
      console.log('📡 Presenter broadcast channel closed');
    };
  }, []);

  const broadcast = useCallback((type: PresenterBroadcast['type'], data: PresenterBroadcastData) => {
    if (channelRef.current) {
      const message: PresenterBroadcast = { type, data };
      channelRef.current.postMessage(message);
    }
  }, []);

  return { broadcast };
};

/**
 * Hook for receiving presenter broadcasts in PresenterView
 */
export const usePresenterReceiver = (
  onMessage: (broadcast: PresenterBroadcast) => void
) => {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    try {
      channelRef.current = new BroadcastChannel(CHANNEL_NAME);
      console.log('📻 Presenter receiver channel opened');

      channelRef.current.onmessage = (event: MessageEvent<PresenterBroadcast>) => {
        onMessage(event.data);
      };
    } catch (error) {
      console.error('Failed to create broadcast channel:', error);
    }

    return () => {
      if (channelRef.current) {
        channelRef.current.onmessage = null;
        channelRef.current.close();
        channelRef.current = null;
        console.log('📻 Presenter receiver channel closed');
      }
    };
  }, [onMessage]);
};
