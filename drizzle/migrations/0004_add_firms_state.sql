-- Add a state column so leads can be classified state-wise alongside city.
ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS state text;

COMMENT ON COLUMN public.firms.state IS 'Indian state / union territory — used for state-wise classification filters';

-- Backfill 1: state captured in the imported notes ("State: Maharashtra").
UPDATE public.firms
SET state = NULLIF(BTRIM(SUBSTRING(notes FROM 'State:[ \t]*([^\r\n]+)')), '')
WHERE state IS NULL AND notes IS NOT NULL AND notes LIKE '%State:%';

-- Backfill 2: derive state from a known city where the sheet had no state.
UPDATE public.firms
SET state = CASE BTRIM(city)
  WHEN 'Mumbai' THEN 'Maharashtra'
  WHEN 'Pune' THEN 'Maharashtra'
  WHEN 'Nagpur' THEN 'Maharashtra'
  WHEN 'Thane' THEN 'Maharashtra'
  WHEN 'Bengaluru' THEN 'Karnataka'
  WHEN 'Udupi' THEN 'Karnataka'
  WHEN 'Delhi' THEN 'Delhi'
  WHEN 'New Delhi' THEN 'Delhi'
  WHEN 'Delhi NCR' THEN 'Delhi'
  WHEN 'Hyderabad' THEN 'Telangana'
  WHEN 'Chennai' THEN 'Tamil Nadu'
  WHEN 'Coimbatore' THEN 'Tamil Nadu'
  WHEN 'Raipur' THEN 'Chhattisgarh'
  WHEN 'Gurugram' THEN 'Haryana'
  WHEN 'Faridabad' THEN 'Haryana'
  WHEN 'Karnal' THEN 'Haryana'
  WHEN 'Noida' THEN 'Uttar Pradesh'
  WHEN 'Lucknow' THEN 'Uttar Pradesh'
  WHEN 'Muzaffarnagar' THEN 'Uttar Pradesh'
  WHEN 'Kolkata' THEN 'West Bengal'
  WHEN 'Jaipur' THEN 'Rajasthan'
  WHEN 'Kota' THEN 'Rajasthan'
  WHEN 'Vadodara' THEN 'Gujarat'
  WHEN 'Ahmedabad' THEN 'Gujarat'
  WHEN 'Surat' THEN 'Gujarat'
  WHEN 'Rajkot' THEN 'Gujarat'
  WHEN 'Chandigarh' THEN 'Chandigarh'
  WHEN 'Bhopal' THEN 'Madhya Pradesh'
  WHEN 'Indore' THEN 'Madhya Pradesh'
  WHEN 'Patna' THEN 'Bihar'
  WHEN 'Chatra' THEN 'Jharkhand'
  WHEN 'Goa' THEN 'Goa'
  WHEN 'Bhubaneswar' THEN 'Odisha'
  WHEN 'Vijayawada' THEN 'Andhra Pradesh'
  WHEN 'Kochi' THEN 'Kerala'
  WHEN 'Perintalmanna' THEN 'Kerala'
  ELSE NULL
END
WHERE state IS NULL AND city IS NOT NULL;

CREATE INDEX IF NOT EXISTS firms_state_idx ON public.firms (state);
CREATE INDEX IF NOT EXISTS firms_city_idx ON public.firms (city);