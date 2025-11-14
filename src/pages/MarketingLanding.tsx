import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mic, Brain, BarChart3 } from "lucide-react";

const MarketingLanding = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Edvana
          </h1>
          <Button onClick={() => navigate("/")} variant="ghost" size="sm">
            Back to Home
          </Button>
        </div>
      </header>

      {/* Hero Section with Immediate CTA */}
      <section className="py-12 px-4">
        <div className="container mx-auto max-w-4xl text-center space-y-6">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
            Turn Every Lecture Into{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Actionable Insights
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            AI-powered lecture capture and real-time assessments that help instructors teach smarter and students learn better.
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
            <Button 
              size="lg" 
              onClick={() => navigate("/instructor-auth")}
              className="w-full sm:w-auto min-w-[200px]"
            >
              Get Started as Instructor
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              onClick={() => navigate("/auth")}
              className="w-full sm:w-auto min-w-[200px]"
            >
              Join as Student
            </Button>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="py-12 px-4 bg-muted/30">
        <div className="container mx-auto max-w-5xl">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="border-primary/20">
              <CardHeader className="pb-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <Mic className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Live Lecture Capture</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Automatically transcribe lectures in real-time so students never miss important content.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-primary/20">
              <CardHeader className="pb-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <Brain className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">AI-Powered Check-Ins</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Generate intelligent questions from lecture content to assess understanding instantly.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-primary/20">
              <CardHeader className="pb-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <BarChart3 className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Smart Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Track engagement and identify struggling students before it's too late.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 px-4 border-t border-border">
        <div className="container mx-auto text-center text-sm text-muted-foreground">
          <p>&copy; 2024 Edvana. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default MarketingLanding;
