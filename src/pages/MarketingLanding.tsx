import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mic, Brain, BarChart3, FileText, GraduationCap, Presentation } from "lucide-react";
import edvanaLogo from "@/assets/edvana-icon-logo.png";


const MarketingLanding = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Learn more about Edvana — lecture capture for educators</title>
        <meta name="description" content="See how Edvana turns every lecture into actionable insights with real-time transcription, AI check-ins, and analytics for instructors and students." />
        <link rel="canonical" href="https://edvana.dev/learn-more" />
        <meta property="og:title" content="Learn more about Edvana — lecture capture for educators" />
        <meta property="og:description" content="See how Edvana turns every lecture into actionable insights with real-time transcription, AI check-ins, and analytics." />
        <meta property="og:url" content="https://edvana.dev/learn-more" />
      </Helmet>
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <img src={edvanaLogo} alt="Edvana logo" className="h-8" />
          <Button onClick={() => navigate("/")} variant="ghost" size="sm">
            Back to Home
          </Button>
        </div>
      </header>

      {/* Hero Section with Immediate CTA */}
      <section className="py-12 px-4">
        <div className="container mx-auto max-w-4xl text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
            Turn Every Lecture Into{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Actionable Insights
            </span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Smart lecture capture and real-time assessments that help instructors teach smarter and students learn better.
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
            <Button 
              size="xl" 
              onClick={() => navigate("/instructor/auth")}
              className="w-full sm:w-auto min-w-[240px] shadow-glow hover:shadow-neon transform hover:scale-105 transition-all"
            >
              <Presentation className="w-5 h-5" />
              Instructor Sign In
            </Button>
            <Button 
              size="xl" 
              variant="secondary"
              onClick={() => navigate("/auth")}
              className="w-full sm:w-auto min-w-[240px] shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
            >
              <GraduationCap className="w-5 h-5" />
              Student Sign In
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
                  Capture every teaching moment automatically, so your students never fall behind.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-primary/20">
              <CardHeader className="pb-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <Brain className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Smart Check-Ins</CardTitle>
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

      {/* Testimonials */}
      <section className="py-12 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="border-primary/20">
              <CardContent className="pt-6">
                <p className="text-foreground italic mb-4">
                  "I demoed this. It has tremendous promise for student engagement."
                </p>
                <p className="text-sm text-muted-foreground">— Professor</p>
              </CardContent>
            </Card>

            <Card className="border-primary/20">
              <CardContent className="pt-6">
                <p className="text-foreground italic mb-4">
                  "It was quite refreshing to have quick questions about what was said a few minutes ago"
                </p>
                <p className="text-sm text-muted-foreground">— Student</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Booth Flyer */}
      <section className="py-12 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl text-center space-y-4">
          <h3 className="text-xl font-semibold text-foreground">Event Materials</h3>
          <p className="text-muted-foreground">View our booth flyer for your reference.</p>
          <Button variant="outline" size="lg" className="gap-2" onClick={() => navigate("/flyer")}>
            <FileText className="w-4 h-4" />
            View Booth Flyer
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 px-4 border-t border-border">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-muted-foreground">
          <span>&copy; 2025 Edvana</span>
          <span className="hidden sm:inline">•</span>
          <button onClick={() => navigate("/privacy")} className="hover:text-foreground transition-colors">
            Privacy Policy
          </button>
          <span className="hidden sm:inline">•</span>
          <button onClick={() => navigate("/terms")} className="hover:text-foreground transition-colors">
            Terms of Service
          </button>
        </div>
      </footer>
    </div>
  );
};

export default MarketingLanding;
