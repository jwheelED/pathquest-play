import { useEffect, useRef, useCallback, useState } from 'react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

interface UseYouTubePlayerOptions {
  videoUrl: string;
  containerId: string;
  onTimeUpdate?: (time: number) => void;
  onDurationReady?: (duration: number) => void;
  onStateChange?: (isPlaying: boolean) => void;
  onReady?: () => void;
}

export function useYouTubePlayer({
  videoUrl,
  containerId,
  onTimeUpdate,
  onDurationReady,
  onStateChange,
  onReady,
}: UseYouTubePlayerOptions) {
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isAPIReady, setIsAPIReady] = useState(!!window.YT?.Player);

  // Extract video ID from URL
  const getVideoId = useCallback((url: string): string | null => {
    const match = url.match(/(?:v=|youtu\.be\/)([^&?#]+)/);
    return match ? match[1] : null;
  }, []);

  // Load YT IFrame API script once
  useEffect(() => {
    if (window.YT?.Player) {
      setIsAPIReady(true);
      return;
    }

    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (existingScript) {
      // Script exists but API not ready yet — wait for callback
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        setIsAPIReady(true);
      };
      return;
    }

    window.onYouTubeIframeAPIReady = () => {
      setIsAPIReady(true);
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // Create player when API is ready
  useEffect(() => {
    if (!isAPIReady) return;

    const videoId = getVideoId(videoUrl);
    if (!videoId) return;

    // Ensure container element exists
    const container = document.getElementById(containerId);
    if (!container) return;

    // Destroy previous player if exists
    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch {}
      playerRef.current = null;
    }

    playerRef.current = new window.YT.Player(containerId, {
      videoId,
      playerVars: {
        modestbranding: 1,
        rel: 0,
        controls: 0,        // Hide native YT controls — we use our own
        disablekb: 1,       // Disable keyboard shortcuts to prevent skipping
        fs: 0,              // Disable native fullscreen button
        iv_load_policy: 3,  // Hide annotations
        playsinline: 1,
      },
      events: {
        onReady: (event: any) => {
          const dur = event.target.getDuration();
          onDurationReady?.(dur);
          onReady?.();

          // Start polling for time updates
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = setInterval(() => {
            if (playerRef.current?.getCurrentTime) {
              const t = playerRef.current.getCurrentTime();
              onTimeUpdate?.(t);
            }
          }, 250); // Poll 4x per second
        },
        onStateChange: (event: any) => {
          // YT.PlayerState: PLAYING=1, PAUSED=2, ENDED=0, BUFFERING=3
          const playing = event.data === 1;
          onStateChange?.(playing);
        },
      },
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }
    };
    // Only re-create when URL or API readiness changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAPIReady, videoUrl, containerId]);

  const play = useCallback(() => {
    playerRef.current?.playVideo?.();
  }, []);

  const pause = useCallback(() => {
    playerRef.current?.pauseVideo?.();
  }, []);

  const seekTo = useCallback((seconds: number, allowSeekAhead = true) => {
    playerRef.current?.seekTo?.(seconds, allowSeekAhead);
  }, []);

  const getCurrentTime = useCallback((): number => {
    return playerRef.current?.getCurrentTime?.() || 0;
  }, []);

  const getDuration = useCallback((): number => {
    return playerRef.current?.getDuration?.() || 0;
  }, []);

  const setVolume = useCallback((vol: number) => {
    // YT API uses 0-100
    playerRef.current?.setVolume?.(vol * 100);
  }, []);

  const mute = useCallback(() => {
    playerRef.current?.mute?.();
  }, []);

  const unMute = useCallback(() => {
    playerRef.current?.unMute?.();
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    playerRef.current?.setPlaybackRate?.(rate);
  }, []);

  return {
    play,
    pause,
    seekTo,
    getCurrentTime,
    getDuration,
    setVolume,
    mute,
    unMute,
    setPlaybackRate,
    isAPIReady,
    playerRef,
  };
}
