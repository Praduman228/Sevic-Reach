-- Parse the fit verdict with patterns that actually match the briefs (Postgres regex without inline (?i) flags).

CREATE OR REPLACE FUNCTION public.parse_firm_fit(summary text)
RETURNS TABLE(fit_score numeric, fit_max smallint, fit_tier text)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    CASE WHEN g IS NULL THEN NULL
         ELSE LEAST(g[4]::numeric, GREATEST(0::numeric, g[2]::numeric)) END,
    CASE WHEN g IS NULL THEN NULL ELSE g[4]::smallint END,
    upper((regexp_match(summary, '(^|[^a-z])tier[^A-Za-z0-9]{0,3}([A-D]|[1-4])([^0-9/]|$)', 'i'))[2])
  FROM (SELECT regexp_match(summary, '(^|[^a-z])fit[^0-9]{0,10}([0-9]{1,3}([.][0-9]){0,1})[[:space:]]*/[[:space:]]*(5|10|100)([^0-9]|$)', 'i') AS g) t;
$$;

-- Re-derive stored values with the corrected parser.
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