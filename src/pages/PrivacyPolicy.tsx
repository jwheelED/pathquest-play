import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowLeft, Shield } from "lucide-react";
import edvanaLogo from "@/assets/edvana-icon-logo.png";

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <img src={edvanaLogo} alt="Edvana" className="h-8 cursor-pointer" onClick={() => navigate("/")} />
          <Button onClick={() => navigate("/")} variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
            <p className="text-muted-foreground">Last updated: January 6, 2025</p>
          </div>
        </div>

        <Card className="mb-8">
          <CardContent className="pt-6">
            <p className="text-muted-foreground leading-relaxed">
              Edvana ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we
              collect, use, disclose, and safeguard your information when you use our educational technology
              platform. Please read this policy carefully to understand our practices regarding your personal data.
            </p>
          </CardContent>
        </Card>

        <Accordion type="single" collapsible className="space-y-4">
          <AccordionItem value="information-collected" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">1. Information We Collect</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <div>
                <h4 className="font-medium text-foreground mb-2">Account Information</h4>
                <p>
                  When you create an account, we collect your name, email address, and role (student, instructor, or
                  administrator). If you sign up through your institution, we may also collect your organizational
                  affiliation.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Educational Content</h4>
                <p>
                  We collect and process lecture transcriptions, study materials you upload, answer keys (for
                  instructors), and any content you create or submit through the platform.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Learning Analytics</h4>
                <p>
                  We track your responses to questions, performance metrics, confidence levels, time spent on
                  activities, and learning progress to personalize your experience and provide insights.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Usage Data</h4>
                <p>
                  We automatically collect information about how you interact with our platform, including pages
                  visited, features used, session duration, and device information.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Academic Integrity Signals</h4>
                <p>
                  To support academic integrity, we may collect behavioral data such as tab switching patterns, typing
                  behavior, and copy-paste activity during assessments. This data is used solely to provide transparency
                  to instructors and is not used to automatically penalize students.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="how-we-use" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">2. How We Use Your Information</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide lecture transcription and real-time comprehension check-ins</li>
                <li>Generate personalized questions and adaptive learning experiences</li>
                <li>Track and display your learning progress, achievements, and streaks</li>
                <li>Enable instructors to monitor class engagement and identify students who may need support</li>
                <li>Improve our platform through aggregated, anonymized analytics</li>
                <li>Communicate with you about your account, updates, and educational content</li>
                <li>Ensure the security and integrity of our platform</li>
                <li>Comply with legal obligations</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="information-sharing" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">3. Information Sharing</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <div>
                <h4 className="font-medium text-foreground mb-2">With Instructors</h4>
                <p>
                  If you are a student, your instructors can view your performance data, responses, and engagement
                  metrics for their classes.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">With Institutional Administrators</h4>
                <p>
                  If your institution uses Edvana, administrators may have access to aggregate metrics and usage data
                  for their organization.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Service Providers</h4>
                <p>
                  We work with trusted third-party service providers for AI processing (including transcription and
                  question generation), cloud hosting, and analytics. These providers are contractually obligated to
                  protect your data.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Legal Requirements</h4>
                <p>
                  We may disclose your information if required by law, court order, or to protect the rights, property,
                  or safety of Edvana, our users, or others.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">We Do Not Sell Your Data</h4>
                <p>We do not sell, rent, or trade your personal information to third parties for marketing purposes.</p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="data-security" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">4. Data Security</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <p>We implement industry-standard security measures to protect your data:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>All data is transmitted using TLS/SSL encryption</li>
                <li>Data is stored on secure, SOC 2 compliant cloud infrastructure</li>
                <li>We implement row-level security policies to ensure users can only access authorized data</li>
                <li>Regular security audits and vulnerability assessments</li>
                <li>Access controls and authentication requirements for all accounts</li>
              </ul>
              <p className="mt-4">
                While we strive to protect your information, no method of transmission over the Internet is 100% secure.
                We encourage you to use strong passwords and protect your account credentials.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="your-rights" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">5. Your Rights</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <p>Depending on your location, you may have the following rights:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Access:</strong> Request a copy of your personal data
                </li>
                <li>
                  <strong>Correction:</strong> Request correction of inaccurate data
                </li>
                <li>
                  <strong>Deletion:</strong> Request deletion of your account and associated data
                </li>
                <li>
                  <strong>Portability:</strong> Request your data in a portable format
                </li>
                <li>
                  <strong>Opt-out:</strong> Opt out of certain data collection features
                </li>
              </ul>
              <p className="mt-4">
                To exercise these rights, please contact us at privacy@edvana.io. We will respond to your request within
                30 days.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="educational-privacy" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">6. Educational Privacy Compliance</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <div>
                <h4 className="font-medium text-foreground mb-2">FERPA</h4>
                <p>
                  For users at U.S. educational institutions, we comply with the Family Educational Rights and Privacy
                  Act (FERPA). Educational records are protected and only shared as permitted under FERPA.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">COPPA</h4>
                <p>
                  Edvana is designed for higher education and is not intended for children under 13. We do not knowingly
                  collect personal information from children under 13. If you believe we have inadvertently collected
                  such information, please contact us immediately.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">International Users</h4>
                <p>
                  If you are accessing Edvana from outside the United States, please be aware that your data may be
                  transferred to and processed in the United States. By using our service, you consent to this transfer.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="data-retention" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">7. Data Retention</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <p>
                We retain your personal data for as long as your account is active or as needed to provide you with our
                services. If you delete your account, we will delete or anonymize your personal data within 90 days,
                except where we are required to retain it for legal or legitimate business purposes.
              </p>
              <p>
                Aggregated, anonymized data that cannot identify you may be retained indefinitely for research and
                platform improvement purposes.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="cookies" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">8. Cookies and Tracking</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <p>We use cookies and similar technologies to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Keep you signed in to your account</li>
                <li>Remember your preferences</li>
                <li>Understand how you use our platform</li>
                <li>Improve our services</li>
              </ul>
              <p className="mt-4">
                You can control cookies through your browser settings, but disabling cookies may affect your ability to
                use certain features of our platform.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="changes" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">9. Changes to This Policy</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <p>
                We may update this Privacy Policy from time to time. We will notify you of material changes by posting
                the updated policy on our platform and updating the "Last updated" date. Your continued use of Edvana
                after such changes constitutes your acceptance of the updated policy.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="contact" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">10. Contact Us</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <p>
                If you have questions or concerns about this Privacy Policy or our data practices, please contact us at:
              </p>
              <div className="bg-muted/50 rounded-lg p-4 mt-2">
                <p className="font-medium text-foreground">Edvana Privacy Team</p>
                <p>Email: johnathan@edvana.dev</p>
                <p>Phone: (516) 736-2517</p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </main>

      {/* Footer */}
      <footer className="py-6 px-4 border-t border-border mt-12">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-muted-foreground">
          <span>&copy; 2025 Edvana</span>
          <span className="hidden sm:inline">•</span>
          <button onClick={() => navigate("/terms")} className="hover:text-foreground transition-colors">
            Terms of Service
          </button>
        </div>
      </footer>
    </div>
  );
};

export default PrivacyPolicy;
