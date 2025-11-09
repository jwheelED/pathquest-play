import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, TrendingUp, ArrowRight } from "lucide-react";

const MarketingLanding = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            🎤 Edvana
          </h1>
          <Button onClick={() => navigate("/")} variant="ghost">
            Back to Home
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-6xl text-center space-y-6">
          <h2 className="text-5xl md:text-6xl font-bold text-foreground">
            Transform Your Classroom with{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              AI-Powered Learning
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Real-time lecture capture, intelligent assessments, and engagement analytics 
            that help instructors teach better and students learn faster.
          </p>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-16 px-4 bg-destructive/5">
        <div className="container mx-auto max-w-6xl">
          <div className="flex items-start gap-4 mb-8">
            <AlertCircle className="w-12 h-12 text-destructive flex-shrink-0" />
            <div>
              <h3 className="text-3xl font-bold text-foreground mb-4">The Problem</h3>
              <p className="text-lg text-muted-foreground mb-6">
                Traditional classrooms struggle with three critical challenges:
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="border-destructive/20">
              <CardHeader>
                <CardTitle className="text-lg">Lost Content</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Students miss important lecture content due to note-taking difficulties, 
                  distractions, or absence. No way to review what was actually said.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-destructive/20">
              <CardHeader>
                <CardTitle className="text-lg">Delayed Feedback</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Instructors can't gauge real-time understanding. By the time tests reveal 
                  gaps in knowledge, it's too late for timely intervention.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-destructive/20">
              <CardHeader>
                <CardTitle className="text-lg">Academic Integrity</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Limited visibility into student behavior during assessments makes it 
                  difficult to ensure fair evaluation and maintain academic standards.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="flex items-start gap-4 mb-8">
            <CheckCircle2 className="w-12 h-12 text-primary flex-shrink-0" />
            <div>
              <h3 className="text-3xl font-bold text-foreground mb-4">Our Solution</h3>
              <p className="text-lg text-muted-foreground mb-6">
                Edvana uses cutting-edge AI to capture, analyze, and enhance every moment of your classroom experience:
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
              <CardHeader>
                <div className="text-3xl mb-2">🎙️</div>
                <CardTitle>Live Lecture Capture</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Real-time audio transcription captures every word of your lecture. 
                  Students can focus on understanding instead of frantic note-taking.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
              <CardHeader>
                <div className="text-3xl mb-2">✅</div>
                <CardTitle>AI-Powered Check-Ins</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Automatically generates comprehension questions during lectures. 
                  Get instant feedback on student understanding while you teach.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
              <CardHeader>
                <div className="text-3xl mb-2">🔍</div>
                <CardTitle>Smart Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Track engagement patterns, detect struggling students early, and 
                  monitor academic integrity with intelligent behavior analysis.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 px-4 bg-primary/5">
        <div className="container mx-auto max-w-6xl">
          <div className="flex items-start gap-4 mb-8">
            <TrendingUp className="w-12 h-12 text-primary flex-shrink-0" />
            <div>
              <h3 className="text-3xl font-bold text-foreground mb-4">The Outcomes You'll Achieve</h3>
              <p className="text-lg text-muted-foreground mb-6">
                Real results that transform learning experiences and improve educational outcomes:
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="text-2xl font-semibold text-foreground">For Instructors</h4>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-foreground">Save 5+ hours per week</strong>
                    <p className="text-muted-foreground">Automatic content generation eliminates manual quiz creation</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-foreground">Identify at-risk students early</strong>
                    <p className="text-muted-foreground">Real-time analytics reveal who's struggling before it's too late</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-foreground">Increase engagement by 40%</strong>
                    <p className="text-muted-foreground">Interactive check-ins keep students actively participating</p>
                  </div>
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h4 className="text-2xl font-semibold text-foreground">For Students</h4>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-foreground">Never miss important content</strong>
                    <p className="text-muted-foreground">Complete lecture transcripts available for review anytime</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-foreground">Get instant feedback</strong>
                    <p className="text-muted-foreground">Know exactly where you stand with immediate assessment results</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-foreground">Learn at your own pace</strong>
                    <p className="text-muted-foreground">Gamified system with achievements makes learning engaging</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-primary">
        <div className="container mx-auto max-w-4xl text-center space-y-8">
          <h3 className="text-4xl md:text-5xl font-bold text-primary-foreground">
            Ready to Transform Your Classroom?
          </h3>
          <p className="text-xl text-primary-foreground/90">
            Join hundreds of instructors already using Edvana to create better learning experiences.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              onClick={() => navigate("/instructor/auth")}
              variant="secondary"
              size="xl"
              className="group"
            >
              Get Started as Instructor
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            
            <Button 
              onClick={() => navigate("/auth")}
              variant="outline"
              size="xl"
              className="bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground border-primary-foreground/20"
            >
              Join as Student
            </Button>
          </div>

          <p className="text-sm text-primary-foreground/70 pt-4">
            No credit card required • Free to start • Setup in under 5 minutes
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="container mx-auto max-w-6xl text-center text-sm text-muted-foreground">
          <p>&copy; 2024 Edvana. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default MarketingLanding;
