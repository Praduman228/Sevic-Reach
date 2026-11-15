ALTER TABLE public.firm_contacts ADD COLUMN designation text;
COMMENT ON COLUMN public.firm_contacts.designation IS 'Job title of the named contact, e.g. Principal Architect';