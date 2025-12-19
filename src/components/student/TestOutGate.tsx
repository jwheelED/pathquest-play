import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';

interface TestOutGateProps {
  onTestOut: () => void;
}

export function TestOutGate({ onTestOut }: TestOutGateProps) {
  return (
    <div className="flex items-center justify-center py-4">
      <Button
        variant="outline"
        onClick={onTestOut}
        className="rounded-full px-6 gap-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/10 text-primary"
      >
        <Zap className="w-4 h-4" />
        Think you know this? Test Out
      </Button>
    </div>
  );
}
