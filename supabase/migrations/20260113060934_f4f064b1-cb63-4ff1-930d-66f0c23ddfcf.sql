-- Add pricing model columns to subscription_tiers
ALTER TABLE subscription_tiers 
ADD COLUMN IF NOT EXISTS pricing_model TEXT DEFAULT 'flat_rate',
ADD COLUMN IF NOT EXISTS price_suffix TEXT DEFAULT '/semester';

-- Update the tiers with correct pricing info
UPDATE subscription_tiers 
SET price_cents = 1500, 
    pricing_model = 'per_seat', 
    price_suffix = '/seat/semester'
WHERE name = 'institutional';

UPDATE subscription_tiers 
SET pricing_model = 'flat_rate', 
    price_suffix = '/semester'
WHERE name = 'instructor';

UPDATE subscription_tiers 
SET pricing_model = 'free', 
    price_suffix = NULL
WHERE name = 'free';