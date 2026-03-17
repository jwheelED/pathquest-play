import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2 } from "lucide-react";
import edvanaLogo from "@/assets/edvana-icon-logo.png";

const CorporateEnterprise = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <img src={edvanaLogo} alt="Edvana" className="h-8" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
          <Building2 className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-4">Enterprise Dashboard</h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
          Organization-wide deployment, analytics, and team management for enterprise customers. Coming soon.
        </p>
        <Button onClick={() => navigate("/")} className="rounded-full px-8">
          Return Home
        </Button>
      </main>
    </div>
  );
};

export default CorporateEnterprise;
