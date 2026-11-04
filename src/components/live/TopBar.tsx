import { Users, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import edvanaWordmark from "@/assets/edvana-wordmark.png";

interface TopBarProps {
  title: string;
  subtitle?: string;
  inRoom: number;
  isActive: boolean;
}

export function TopBar({ title, subtitle, inRoom, isActive }: TopBarProps) {
  const navigate = useNavigate();
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/join");
  };
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-6 py-3 bg-white/85 backdrop-blur-[16px] border-b border-[hsl(220_15%_88%)]">
      <button
        type="button"
        onClick={goBack}
        aria-label="Go back"
        className="flex items-center justify-center w-8 h-8 -ml-2 rounded-full text-[hsl(var(--ink))] hover:bg-[hsl(var(--slate-200))] transition-colors shrink-0"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>
      <img src={edvanaWordmark} alt="Edvana" className="h-[18px] w-auto shrink-0" />
      <div className="w-px h-6 bg-[hsl(220_15%_88%)]" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold tracking-[-0.01em] truncate text-[hsl(var(--ink))]">
          {title || "Live Session"}
        </p>
        {subtitle && (
          <p className="text-xs text-[hsl(var(--text-muted-live))] truncate">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="flex items-center gap-1.5 text-xs text-[hsl(var(--text-muted-live))]">
          <Users className="w-3.5 h-3.5" />
          {inRoom} in the room
        </span>
        {isActive ? (
          <Badge variant="destructive" className="text-xs font-semibold px-2.5 py-0.5 animate-pulse">
            Class is live
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs">
            Class ended
          </Badge>
        )}
      </div>
    </header>
  );
}
