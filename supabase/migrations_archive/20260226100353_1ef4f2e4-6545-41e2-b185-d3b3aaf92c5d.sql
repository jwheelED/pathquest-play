UPDATE subscription_tiers SET 
  description = 'Get started with Edvana — perfect for trying out live lectures and AI-powered questions.',
  features = '["Live Lectures", "AI-Powered Questions", "Manual Class Codes", "Basic Analytics"]'::jsonb,
  student_limit = NULL
WHERE name = 'free';

UPDATE subscription_tiers SET 
  features = '["Live Lectures", "AI-Powered Questions", "Auto-Grading", "Academic Integrity Monitoring", "Full Analytics Dashboard", "Unlimited Lecture Recordings", "Email Support", "Pilot Rebate Guarantee"]'::jsonb
WHERE name = 'instructor';

UPDATE subscription_tiers SET 
  description = 'Enterprise-grade features for your entire institution — LMS integration and org-wide insights.',
  features = '["LTI & LMS Integration", "Automatic Grade Sync", "Admin Dashboard", "Organization-Wide Analytics", "Priority Support"]'::jsonb
WHERE name = 'institutional';