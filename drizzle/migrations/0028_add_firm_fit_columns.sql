-- Store the research brief's fit verdict on the firm so pipeline cards can show it without loading briefs.

ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS fit_score numeric(4,1),
  ADD COLUMN IF NOT EXISTS fit_max smallint,
  ADD COLUMN IF NOT EXISTS fit_tier text;

COMMENT ON COLUMN public.firms.fit_score IS 'Fit score quoted by the latest research brief summary, on the same scale as fit_max. NULL when the brief has no score.';
COMMENT ON COLUMN public.firms.fit_max IS 'Scale of fit_score (5 or 10), taken from the brief text.';
COMMENT ON COLUMN public.firms.fit_tier IS 'Fit tier A-D quoted by the latest research brief summary.';

-- Reads "fit score 2/5", "Fit score: 8/10", "Fit: 4/10", "Tier C" out of a brief summary.
CREATE OR REPLACE FUNCTION public.parse_firm_fit(summary text)
RETURNS TABLE(fit_score numeric, fit_max smallint, fit_tier text)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    CASE WHEN g IS NULL THEN NULL ELSE LEAST(10::numeric, GREATEST(0::numeric, g[1]::numeric)) END,
    CASE WHEN g IS NULL THEN NULL ELSE g[2]::smallint END,
    (regexp_match(summary, '(?i)\btier\b[^A-Za-z]{0,3}([A-D])\b'))[1]
  FROM (SELECT regexp_match(summary, '(?i)\bfit(?:\s+score)?\s*[:\-]?\s*([0-9]{1,2}(?:\.[0-9])?)\s*/\s*(5|10)\b') AS g) t;
$$;

CREATE OR REPLACE FUNCTION public.sync_firm_fit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score numeric;
  v_max smallint;
  v_tier text;
BEGIN
  SELECT p.fit_score, p.fit_max, p.fit_tier
    INTO v_score, v_max, v_tier
    FROM public.parse_firm_fit(NEW.brief->>'summary') AS p;
  UPDATE public.firms
     SET fit_score = v_score,
         fit_max = v_max,
         fit_tier = v_tier
   WHERE id = NEW.firm_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS firm_research_sync_fit ON public.firm_research;
CREATE TRIGGER firm_research_sync_fit
AFTER INSERT OR UPDATE OF brief ON public.firm_research
FOR EACH ROW EXECUTE FUNCTION public.sync_firm_fit();

-- Backfill firms whose brief was written before this trigger existed.
UPDATE public.firms f
   SET fit_score = s.fit_score,
       fit_max = s.fit_max,
       fit_tier = s.fit_tier
  FROM (
    SELECT DISTINCT ON (r.firm_id) r.firm_id, p.fit_score, p.fit_max, p.fit_tier
      FROM public.firm_research r
      CROSS JOIN LATERAL public.parse_firm_fit(r.brief->>'summary') AS p
     ORDER BY r.firm_id, r.created_at DESC
  ) s
 WHERE f.id = s.firm_id;

GRANT SELECT ON public.firms TO authenticated;
GRANT ALL ON public.firms TO service_role;