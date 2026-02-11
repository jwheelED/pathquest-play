import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowLeft, FileText } from "lucide-react";
import edvanaLogo from "@/assets/edvana-icon-logo.png";

const TermsOfService = () => {
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
            <FileText className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Terms of Service</h1>
            <p className="text-muted-foreground">Last updated: January 6, 2025</p>
          </div>
        </div>

        <Card className="mb-8">
          <CardContent className="pt-6">
            <p className="text-muted-foreground leading-relaxed">
              Welcome to Edvana. These Terms of Service ("Terms") govern your access to and use of the Edvana platform,
              including our website, applications, and services (collectively, the "Service"). By accessing or using the
              Service, you agree to be bound by these Terms. If you do not agree, please do not use the Service.
            </p>
          </CardContent>
        </Card>

        <Accordion type="single" collapsible className="space-y-4">
          <AccordionItem value="acceptance" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">1. Acceptance of Terms</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <p>
                By creating an account or using Edvana, you confirm that you are at least 18 years old (or the age of
                majority in your jurisdiction) or have parental/guardian consent. If you are using the Service on behalf
                of an institution, you represent that you have authority to bind that institution to these Terms.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="service-description" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">2. Description of Service</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <p>Edvana is an educational technology platform that provides:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Live lecture transcription and capture</li>
                <li>Real-time comprehension check-ins and assessments</li>
                <li>Personalized questions generated from your content</li>
                <li>Learning analytics and progress tracking</li>
                <li>Study material management</li>
                <li>Instructor dashboards and student engagement tools</li>
              </ul>
              <p className="mt-4">
                We reserve the right to modify, suspend, or discontinue any part of the Service at any time with
                reasonable notice.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="accounts" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">3. User Accounts</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <div>
                <h4 className="font-medium text-foreground mb-2">Account Creation</h4>
                <p>
                  You must provide accurate and complete information when creating an account. You are responsible for
                  maintaining the security of your account credentials.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Account Security</h4>
                <p>
                  You are responsible for all activities that occur under your account. Notify us immediately if you
                  suspect unauthorized access to your account.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">One Account Per Person</h4>
                <p>
                  Each user may only maintain one account. Creating multiple accounts to circumvent restrictions or for
                  any deceptive purpose is prohibited.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="user-roles" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">4. User Roles and Responsibilities</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <div>
                <h4 className="font-medium text-foreground mb-2">Students</h4>
                <ul className="list-disc pl-6 space-y-1">
                  <li>
                    Use the platform honestly and in accordance with your institution's academic integrity policies
                  </li>
                  <li>Submit only your own work</li>
                  <li>Respect the learning environment and other users</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Instructors</h4>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Use student data responsibly and in accordance with applicable privacy laws</li>
                  <li>Ensure uploaded content does not infringe on third-party rights</li>
                  <li>Provide accurate course information</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Administrators</h4>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Manage organizational settings appropriately</li>
                  <li>Ensure compliance with institutional policies</li>
                  <li>Handle user data in accordance with applicable regulations</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="acceptable-use" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">5. Acceptable Use Policy</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <p>You agree NOT to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Use the Service for any unlawful purpose</li>
                <li>Engage in academic dishonesty, including cheating, plagiarism, or unauthorized collaboration</li>
                <li>Harass, abuse, or harm other users</li>
                <li>Attempt to gain unauthorized access to the Service or other accounts</li>
                <li>Upload malicious code, viruses, or harmful content</li>
                <li>Interfere with the proper functioning of the Service</li>
                <li>Scrape, copy, or extract data from the Service without authorization</li>
                <li>Use the Service to compete with Edvana</li>
                <li>Share your account credentials with others</li>
                <li>Misrepresent your identity or affiliation</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="intellectual-property" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">6. Intellectual Property</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <div>
                <h4 className="font-medium text-foreground mb-2">Edvana's Rights</h4>
                <p>
                  The Service, including its design, features, and content created by Edvana, is protected by
                  intellectual property laws. You may not copy, modify, or distribute our proprietary materials without
                  permission.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Your Content</h4>
                <p>
                  You retain ownership of content you upload to Edvana (such as lecture materials, study guides, and
                  answer keys). By uploading content, you grant Edvana a limited license to process, store, and display
                  that content to provide the Service.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">AI-Generated Content</h4>
                <p>
                  Questions, explanations, and other content generated by our AI based on your inputs may be used freely
                  within the platform. We do not claim ownership of AI-generated educational content.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="subscriptions" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">7. Subscriptions and Payments</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <div>
                <h4 className="font-medium text-foreground mb-2">Free Tier</h4>
                <p>
                  Edvana offers a free tier with limited features. Usage limits and available features are subject to
                  change.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Paid Subscriptions</h4>
                <p>
                  Paid plans provide additional features and capacity. Subscription fees are billed in advance and are
                  non-refundable except as required by law or as specified in our refund policy.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Institutional Licensing</h4>
                <p>
                  Institutions may enter into separate licensing agreements. Contact us for enterprise pricing and
                  terms.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Cancellation</h4>
                <p>
                  You may cancel your subscription at any time. Cancellation takes effect at the end of your current
                  billing period.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="disclaimers" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">8. Disclaimers</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <p>
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
                WE DO NOT WARRANT THAT:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>The Service will be uninterrupted, error-free, or secure</li>
                <li>AI-generated content will be accurate or appropriate for all purposes</li>
                <li>Using the Service will result in specific educational outcomes</li>
                <li>The Service will meet all of your requirements</li>
              </ul>
              <p className="mt-4">
                Edvana is a supplementary educational tool. It is not a substitute for professional instruction, and we
                do not guarantee academic success.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="liability" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">9. Limitation of Liability</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, EDVANA AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL
                NOT BE LIABLE FOR:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Any indirect, incidental, special, consequential, or punitive damages</li>
                <li>Loss of profits, data, or goodwill</li>
                <li>Any damages exceeding the amount you paid to Edvana in the 12 months prior to the claim</li>
              </ul>
              <p className="mt-4">
                Some jurisdictions do not allow limitation of liability, so these limitations may not apply to you.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="termination" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">10. Termination</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <div>
                <h4 className="font-medium text-foreground mb-2">Termination by You</h4>
                <p>You may delete your account at any time through your account settings or by contacting us.</p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Termination by Us</h4>
                <p>
                  We may suspend or terminate your account if you violate these Terms, engage in fraudulent activity, or
                  for any other reason with reasonable notice (except in cases of severe violations).
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Effect of Termination</h4>
                <p>
                  Upon termination, your right to use the Service ends immediately. We may delete your data in
                  accordance with our Privacy Policy.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="governing-law" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">11. Governing Law and Disputes</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <p>
                These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict
                of law principles.
              </p>
              <p className="mt-2">
                Any disputes arising from these Terms or the Service shall be resolved through binding arbitration in
                accordance with the rules of the American Arbitration Association, except that you may bring claims in
                small claims court if eligible.
              </p>
              <p className="mt-2">
                You agree to waive any right to participate in class action lawsuits against Edvana.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="changes" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">12. Changes to These Terms</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <p>
                We may update these Terms from time to time. We will notify you of material changes by posting the
                updated Terms and updating the "Last updated" date. For significant changes, we may also notify you via
                email or through the Service.
              </p>
              <p className="mt-2">
                Your continued use of the Service after changes take effect constitutes your acceptance of the revised
                Terms.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="contact" className="border rounded-lg px-4">
            <AccordionTrigger className="text-lg font-semibold">13. Contact Us</AccordionTrigger>
            <AccordionContent className="text-muted-foreground space-y-4 pb-4">
              <p>If you have questions about these Terms, please contact us at:</p>
              <div className="bg-muted/50 rounded-lg p-4 mt-2">
                <p className="font-medium text-foreground">Edvana Legal Team</p>
                <p>Email: Nigel@Edvana.dev</p>
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
          <button onClick={() => navigate("/privacy")} className="hover:text-foreground transition-colors">
            Privacy Policy
          </button>
        </div>
      </footer>
    </div>
  );
};

export default TermsOfService;
