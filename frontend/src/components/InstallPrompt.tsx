import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function InstallPrompt() {
  const { isInstallable, promptInstall, dismissPrompt } = useInstallPrompt();
  const [isDismissed, setIsDismissed] = useState(false);
  const [visitCount, setVisitCount] = useState(0);

  useEffect(() => {
    // Track visit count
    const count = parseInt(localStorage.getItem("edvana-visit-count") || "0");
    const newCount = count + 1;
    setVisitCount(newCount);
    localStorage.setItem("edvana-visit-count", newCount.toString());

    // Check if previously dismissed
    const dismissed = localStorage.getItem("edvana-install-dismissed");
    if (dismissed) {
      setIsDismissed(true);
    }
  }, []);

  const handleInstall = async () => {
    const success = await promptInstall();
    if (success) {
      setIsDismissed(true);
    }
  };

  const handleDismiss = () => {
    dismissPrompt();
    setIsDismissed(true);
    localStorage.setItem("edvana-install-dismissed", "true");
  };

  // Only show after 2+ visits, if installable, and not dismissed
  if (!isInstallable || isDismissed || visitCount < 2) {
    return null;
  }

  return (
    <Card className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 p-4 shadow-lg border-primary/20 bg-card">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Download className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm mb-1">Install Edvana</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Get faster access and work offline. Install our app for the best experience.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleInstall} className="flex-1">
              Install
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDismiss}>
              Not now
            </Button>
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="flex-shrink-0 h-6 w-6"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
