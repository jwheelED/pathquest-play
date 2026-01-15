import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface JoinClassCardProps {
  onJoinClass: (classCode: string) => Promise<void>;
}

export default function JoinClassCard({ onJoinClass }: JoinClassCardProps) {
  const [classCode, setClassCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classCode.trim()) return;

    setLoading(true);
    try {
      await onJoinClass(classCode);
      setClassCode("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 border-2 border-primary-glow bg-gradient-to-br from-card to-primary/5">
      <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-4">
        👨‍🏫 Join a Class
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="classCode">Instructor Class Code</Label>
          <Input
            id="classCode"
            type="text"
            placeholder="Enter your instructor's class code"
            value={classCode}
            onChange={(e) => setClassCode(e.target.value)}
            disabled={loading}
          />
        </div>
        <Button
          type="submit"
          variant="retro"
          size="lg"
          className="w-full"
          disabled={loading || !classCode.trim()}
        >
          {loading ? "Connecting..." : "🚀 Connect to Instructor"}
        </Button>
      </form>
    </Card>
  );
}
