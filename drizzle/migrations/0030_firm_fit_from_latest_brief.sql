-- The stored fit verdict must come from the firm's most recent brief, whichever row fired the trigger.

CREATE OR REPLACE FUNCTION public.sync_firm_fit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_firm uuid;
  v_score numeric;
  v_max smallint;
  v_tier text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_firm := OLD.firm_id;
  ELSE
    v_firm := NEW.firm_id;
  END IF;

  SELECT p.fit_score, p.fit_max, p.fit_tier
    INTO v_score, v_max, v_tier
    FROM public.firm_research r
    CROSS JOIN LATERAL public.parse_firm_fit(r.brief->>'summary') AS p
   WHERE r.firm_id = v_firm
   ORDER BY r.created_at DESC, r.id DESC
   LIMIT 1;

  UPDATE public.firms
     SET fit_score = v_score,
         fit_max = v_max,
         fit_tier = v_tier
   WHERE id = v_firm;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS firm_research_sync_fit ON public.firm_research;
CREATE TRIGGER firm_research_sync_fit
AFTER INSERT OR UPDATE OF brief OR DELETE ON public.firm_research
FOR EACH ROW EXECUTE FUNCTION public.sync_firm_fit();

-- Repair firms whose stored verdict was taken from an older brief.
UPDATE public.firms f
   SET fit_score = s.fit_score,
       fit_max = s.fit_max,
       fit_tier = s.fit_tier
  FROM (
    SELECT DISTINCT ON (r.firm_id) r.firm_id, p.fit_score, p.fit_max, p.fit_tier
      FROM public.firm_research r
      CROSS JOIN LATERAL public.parse_firm_fit(r.brief->>'summary') AS p
     ORDER BY r.firm_id, r.created_at DESC, r.id DESC
  ) s
 WHERE f.id = s.firm_id
   AND (f.fit_score IS DISTINCT FROM s.fit_score
        OR f.fit_max IS DISTINCT FROM s.fit_max
        OR f.fit_tier IS DISTINCT FROM s.fit_tier);