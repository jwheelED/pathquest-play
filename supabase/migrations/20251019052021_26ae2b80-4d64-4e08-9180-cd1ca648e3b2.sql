-- Add tier system to achievements
ALTER TABLE achievements 
ADD COLUMN tier text NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum'));

-- Add category to achievements for better organization
ALTER TABLE achievements 
ADD COLUMN category text NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'practice', 'lecture', 'streak', 'mastery'));

-- Update existing achievements with tiers and categories
UPDATE achievements 
SET tier = 'bronze', category = 'practice'
WHERE requirement_type = 'problems_solved' AND requirement_value <= 10;

UPDATE achievements 
SET tier = 'silver', category = 'practice'
WHERE requirement_type = 'problems_solved' AND requirement_value > 10 AND requirement_value <= 50;

UPDATE achievements 
SET tier = 'gold', category = 'practice'
WHERE requirement_type = 'problems_solved' AND requirement_value > 50;

UPDATE achievements 
SET tier = 'bronze', category = 'lecture'
WHERE requirement_type = 'checkins_completed' AND requirement_value <= 5;

UPDATE achievements 
SET tier = 'silver', category = 'lecture'
WHERE requirement_type = 'checkins_completed' AND requirement_value > 5 AND requirement_value <= 15;

UPDATE achievements 
SET tier = 'gold', category = 'lecture'
WHERE requirement_type = 'checkins_completed' AND requirement_value > 15;

UPDATE achievements 
SET tier = 'silver', category = 'lecture'
WHERE requirement_type = 'perfect_checkins';

UPDATE achievements 
SET tier = 'gold', category = 'streak'
WHERE requirement_type = 'checkin_streak' AND requirement_value >= 5;

UPDATE achievements 
SET tier = 'platinum', category = 'streak'
WHERE requirement_type = 'checkin_streak' AND requirement_value >= 10;