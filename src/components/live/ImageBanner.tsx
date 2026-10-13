import { useState, useEffect } from "react";
import { Sparkles, WandSparkles } from "lucide-react";
import type { ImageStatus } from "./useSessionState";

interface ImageBannerProps {
  imageUrl: string | null;
  imageStatus: ImageStatus;
}

export function ImageBanner({ imageUrl, imageStatus }: ImageBannerProps) {
  const [loaded, setLoaded] = useState(false);
  const prefersReduced = usePrefersReducedMotion();

  useEffect(() => {
    setLoaded(false);
  }, [imageUrl]);

  if (imageStatus === "failed") return null;

  const isPending = imageStatus === "pending" || !imageUrl;
  const isReady = imageStatus === "ready" && imageUrl && loaded;

  return (
    <div className="relative w-full h-[168px] overflow-hidden bg-[hsl(var(--emerald-50))]">
      {imageUrl && (
        <img
          src={imageUrl}
          alt="Generated illustration for this check-in"
          onLoad={() => setLoaded(true)}
          className={`w-full h-full object-cover transition-all ${
            prefersReduced ? "duration-0" : "duration-[1200ms]"
          } ease-[cubic-bezier(.4,0,.2,1)] ${
            isReady
              ? "blur-0 saturate-100 scale-100 opacity-100"
              : "blur-[14px] saturate-[.3] scale-[1.06] opacity-55"
          }`}
        />
      )}

      {!imageUrl && isPending && (
        <div className="w-full h-full bg-[hsl(var(--emerald-50))]" />
      )}

      <div className="absolute bottom-3 left-3">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-[12px] text-[11px] font-semibold text-[hsl(var(--ink))]">
          {isPending ? (
            <>
              <WandSparkles className="w-3.5 h-3.5" />
              Drawing from the last few minutes…
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              Generated for this check-in
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}
