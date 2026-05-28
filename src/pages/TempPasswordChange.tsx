import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// TEMPORARY page — delete after use. Route: /temp-password
export default function TempPasswordChange() {
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handlePasswordChange = async () => {
    setLoading(true);
    setResult("");
    const { data, error } = await supabase.auth.updateUser({ password });
    console.log("Password update result:", { data, error });
    if (error) {
      setResult(`❌ ${error.message}`);
    } else {
      setResult(`✅ Password updated for ${data.user?.email ?? "user"}`);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4 border rounded-lg p-6 bg-card">
        <div>
          <h1 className="text-xl font-semibold">Temporary Password Update</h1>
          <p className="text-sm text-muted-foreground mt-1">
            You must already be signed in. Delete this page after use.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-pw">New password</Label>
          <Input
            id="new-pw"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            autoComplete="off"
          />
        </div>
        <Button
          onClick={handlePasswordChange}
          disabled={loading || password.length < 6}
          className="w-full"
        >
          {loading ? "Updating..." : "Update password"}
        </Button>
        {result && (
          <p className="text-sm break-words p-3 rounded bg-muted">{result}</p>
        )}
      </div>
    </div>
  );
}
