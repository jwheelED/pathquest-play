import { useState } from "react";
import { MessageSquare, Video, CheckSquare, Plug, CreditCard } from "lucide-react";
import { QuestionFormatSettings } from "@/components/instructor/QuestionFormatSettings";
import { AutoGradeSettings } from "@/components/instructor/AutoGradeSettings";
import { QuestionDifficultySettings } from "@/components/instructor/QuestionDifficultySettings";
import { LMSIntegrationSettings } from "@/components/instructor/LMSIntegrationSettings";
import { AdaptiveTutoringSettings } from "@/components/instructor/AdaptiveTutoringSettings";
import { QuestionPreviewSettings } from "@/components/instructor/QuestionPreviewSettings";
import { BillingSettings } from "@/components/instructor/BillingSettings";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const TABS = [
  { key: "questions", label: "Question Generation", icon: MessageSquare },
  { key: "pre-recorded", label: "Pre-Recorded Lectures", icon: Video },
  { key: "grading", label: "Grading", icon: CheckSquare },
  { key: "integrations", label: "Integrations", icon: Plug },
] as const;

const ACCOUNT_TABS = [
  { key: "billing", label: "Plan & Billing", icon: CreditCard },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface SettingsPanelProps {
  currentUserId: string;
  professorType?: "stem" | "humanities" | "medical" | null;
}

export function SettingsPanel({ currentUserId, professorType }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("questions");
  const isMobile = useIsMobile();

  const renderNavItem = (item: { key: string; label: string; icon: React.ComponentType<{ className?: string }> }, isActive: boolean) => (
    <button
      key={item.key}
      onClick={() => setActiveTab(item.key as TabKey)}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left w-full",
        "hover:bg-accent/50",
        isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"
      )}
    >
      <item.icon className="h-4 w-4 flex-shrink-0" />
      <span>{item.label}</span>
    </button>
  );

  const renderMobileNavItem = (item: { key: string; label: string; icon: React.ComponentType<{ className?: string }> }, isActive: boolean) => (
    <button
      key={item.key}
      onClick={() => setActiveTab(item.key as TabKey)}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0",
        "hover:bg-accent/50",
        isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"
      )}
    >
      <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
      <span>{item.label}</span>
    </button>
  );

  const renderContent = () => {
    switch (activeTab) {
      case "questions":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Question Generation</h2>
              <p className="text-sm text-muted-foreground mt-1">Configure how questions are generated, previewed, and what difficulty level to use.</p>
            </div>
            <QuestionFormatSettings instructorId={currentUserId} professorType={professorType} />
            <QuestionPreviewSettings />
            <QuestionDifficultySettings />
          </div>
        );
      case "pre-recorded":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Pre-Recorded Lectures</h2>
              <p className="text-sm text-muted-foreground mt-1">Control question presets, difficulty mix, and style balance for pre-recorded content.</p>
            </div>
            <AdaptiveTutoringSettings />
          </div>
        );
      case "grading":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Grading</h2>
              <p className="text-sm text-muted-foreground mt-1">Configure auto-grading behavior for short answers, coding questions, and multiple choice.</p>
            </div>
            <AutoGradeSettings />
          </div>
        );
      case "integrations":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Integrations</h2>
              <p className="text-sm text-muted-foreground mt-1">Connect external platforms like your LMS to sync grades and content.</p>
            </div>
            <LMSIntegrationSettings />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Mobile: horizontal tab bar */}
      {isMobile && (
        <div className="rounded-lg border bg-card/30">
          <ScrollArea className="w-full">
            <div className="flex items-center gap-1 px-3 py-2">
              {TABS.map((item) => renderMobileNavItem(item, activeTab === item.key))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}

      <div className="flex gap-8 overflow-hidden">
        {/* Desktop sidebar */}
        {!isMobile && (
          <nav className="w-56 flex-shrink-0">
            <div className="sticky top-24 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">Teaching</p>
              {TABS.map((item) => renderNavItem(item, activeTab === item.key))}
            </div>
          </nav>
        )}

        {/* Content panel */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
