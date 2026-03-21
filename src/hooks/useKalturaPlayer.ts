import { useEffect, useRef, useCallback, useState } from 'react';

declare global {
  interface Window {
    KalturaPlayer: any;
  }
}

interface UseKalturaPlayerOptions {
  videoUrl: string;
  containerId: string;
  partnerId: string;
  uiConfId: string;
  onTimeUpdate?: (time: number) => void;
  onDurationReady?: (duration: number) => void;
  onStateChange?: (isPlaying: boolean) => void;
  onReady?: () => void;
}

/**
 * Extract Kaltura entry ID from various URL formats:
 * - mediaspace.{school}.edu/media/{title}/{entry_id}
 * - kaltura.com/...entry_id={id}
 * - /id/{entry_id}
 */
function extractKalturaEntryId(url: string): string | null {
  // MediaSpace: /media/{title}/{entry_id}  (entry_id starts with 0_ or 1_)
  const mediaSpaceMatch = url.match(/\/media\/[^/]+\/([01]_[a-zA-Z0-9]+)/);
  if (mediaSpaceMatch) return mediaSpaceMatch[1];

  // URL param: entry_id=xxx
  const paramMatch = url.match(/entry_id[=:]([01]_[a-zA-Z0-9]+)/);
  if (paramMatch) return paramMatch[1];

  // /id/{entry_id}
  const idMatch = url.match(/\/id\/([01]_[a-zA-Z0-9]+)/);
  if (idMatch) return idMatch[1];

  // Generic: look for Kaltura entry ID pattern anywhere in URL
  const genericMatch = url.match(/([01]_[a-zA-Z0-9]{8,})/);
  if (genericMatch) return genericMatch[1];

  return null;
}

export function useKalturaPlayer({
  videoUrl,
  containerId,
  partnerId,
  uiConfId,
  onTimeUpdate,
  onDurationReady,
  onStateChange,
  onReady,
}: UseKalturaPlayerOptions) {
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isSDKReady, setIsSDKReady] = useState(false);

  // Load Kaltura Player SDK script
  useEffect(() => {
    if (!partnerId || !uiConfId) return;

    if (window.KalturaPlayer) {
      setIsSDKReady(true);
      return;
    }

    const scriptSrc = `https://cdnapisec.kaltura.com/p/${partnerId}/embedPlaykitJs/uiconf_id/${uiConfId}`;
    const existingScript = document.querySelector(`script[src="${scriptSrc}"]`);
    
    if (existingScript) {
      // Script already loading — poll for readiness
      const poll = setInterval(() => {
        if (window.KalturaPlayer) {
          setIsSDKReady(true);
          clearInterval(poll);
        }
      }, 200);
      return () => clearInterval(poll);
    }

    const script = document.createElement('script');
    script.src = scriptSrc;
    script.async = true;
    script.onload = () => {
      // SDK might need a tick to initialize
      setTimeout(() => setIsSDKReady(true), 100);
    };
    script.onerror = () => {
      console.error('Failed to load Kaltura Player SDK');
    };
    document.head.appendChild(script);
  }, [partnerId, uiConfId]);

  // Create player when SDK is ready
  useEffect(() => {
    if (!isSDKReady || !window.KalturaPlayer) return;

    const entryId = extractKalturaEntryId(videoUrl);
    if (!entryId) {
      console.error('Could not extract Kaltura entry ID from URL:', videoUrl);
      return;
    }

    const container = document.getElementById(containerId);
    if (!container) return;

    // Destroy previous player
    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch {}
      playerRef.current = null;
    }

    try {
      const player = window.KalturaPlayer.setup({
        targetId: containerId,
        provider: {
          partnerId: parseInt(partnerId, 10),
          uiConfId: parseInt(uiConfId, 10),
        },
        playback: {
          autoplay: false,
        },
        // Disable native UI controls — we use our own
        ui: {
          disable: true,
        },
      });

      player.loadMedia({ entryId });

      // Listen for events
      player.addEventListener(player.Event.PLAYING, () => {
        onStateChange?.(true);
      });
      player.addEventListener(player.Event.PAUSE, () => {
        onStateChange?.(false);
      });
      player.addEventListener(player.Event.ENDED, () => {
        onStateChange?.(false);
      });
      player.addEventListener(player.Event.LOADED_METADATA, () => {
        const dur = player.duration;
        if (dur) onDurationReady?.(dur);
        onReady?.();
      });

      // Start polling for time updates
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        if (playerRef.current) {
          try {
            const t = playerRef.current.currentTime;
            if (typeof t === 'number') onTimeUpdate?.(t);
          } catch {}
        }
      }, 250);

      playerRef.current = player;
    } catch (err) {
      console.error('Kaltura Player setup failed:', err);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSDKReady, videoUrl, containerId, partnerId, uiConfId]);

  const play = useCallback(() => {
    playerRef.current?.play?.();
  }, []);

  const pause = useCallback(() => {
    playerRef.current?.pause?.();
  }, []);

  const seekTo = useCallback((seconds: number) => {
    if (playerRef.current) {
      playerRef.current.currentTime = seconds;
    }
  }, []);

  const getCurrentTime = useCallback((): number => {
    return playerRef.current?.currentTime || 0;
  }, []);

  const getDuration = useCallback((): number => {
    return playerRef.current?.duration || 0;
  }, []);

  const setVolume = useCallback((vol: number) => {
    if (playerRef.current) {
      playerRef.current.volume = vol;
    }
  }, []);

  const mute = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.muted = true;
    }
  }, []);

  const unMute = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.muted = false;
    }
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    if (playerRef.current) {
      playerRef.current.playbackRate = rate;
    }
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
    isSDKReady,
    playerRef,
  };
}

export { extractKalturaEntryId };
