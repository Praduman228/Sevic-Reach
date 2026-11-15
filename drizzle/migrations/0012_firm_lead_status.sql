CREATE TYPE public.lead_status AS ENUM ('hot', 'cold', 'junk');
ALTER TABLE public.firms ADD COLUMN lead_status public.lead_status;
COMMENT ON COLUMN public.firms.lead_status IS 'Lead qualification independent of sales stage; NULL means not classified yet.';