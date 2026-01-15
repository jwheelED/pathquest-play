-- Remove the restrictive constraint
ALTER TABLE profiles DROP CONSTRAINT profiles_daily_question_limit_check;

-- Add a more permissive constraint (just must be positive)
ALTER TABLE profiles ADD CONSTRAINT profiles_daily_question_limit_check CHECK (daily_question_limit > 0);

-- Update your limit to 1000
UPDATE profiles SET daily_question_limit = 1000 WHERE id = 'b1630e40-8804-49da-96dd-7280661d03ef';