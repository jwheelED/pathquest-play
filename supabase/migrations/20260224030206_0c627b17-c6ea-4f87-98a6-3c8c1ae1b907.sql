UPDATE subscription_tiers SET
  description = 'Get started with Edvana — perfect for trying out live lectures and basic question tools.',
  features = '["Live Lectures", "Basic Question Generation", "Manual Class Codes", "Basic Analytics"]'::jsonb
WHERE name = 'free';

UPDATE subscription_tiers SET
  description = 'Everything you need to run an engaging, AI-powered classroom — with a pilot rebate guarantee.',
  features = '["Live Lectures", "AI-Powered Questions", "Auto-Grading", "Academic Integrity Monitoring", "Full Analytics Dashboard", "Personalized Study Paths", "Unlimited Lecture Recordings", "Email Support", "Pilot Rebate Guarantee"]'::jsonb
WHERE name = 'instructor';

UPDATE subscription_tiers SET
  description = 'Enterprise-grade features for your entire institution — SSO, LMS integration, and org-wide insights.',
  features = '["Live Lectures", "AI-Powered Questions", "Auto-Grading", "Academic Integrity Monitoring", "Full Analytics Dashboard", "Personalized Study Paths", "Unlimited Lecture Recordings", "SSO / SAML Authentication", "LTI & LMS Integration", "Automatic Grade Sync", "Admin Dashboard", "Organization-Wide Analytics", "Priority Support"]'::jsonb
WHERE name = 'institutional';