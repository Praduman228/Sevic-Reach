ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS stage public.firm_stage, ADD COLUMN IF NOT EXISTS from_email text;
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS stage public.firm_stage;
CREATE UNIQUE INDEX IF NOT EXISTS email_messages_provider_id_key ON public.email_messages(provider_message_id);

CREATE OR REPLACE FUNCTION public.message_set_stage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stage IS NULL AND NEW.firm_id IS NOT NULL THEN
    SELECT stage INTO NEW.stage FROM public.firms WHERE id = NEW.firm_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS email_set_stage ON public.email_messages;
CREATE TRIGGER email_set_stage BEFORE INSERT ON public.email_messages FOR EACH ROW EXECUTE FUNCTION public.message_set_stage();
DROP TRIGGER IF EXISTS wa_set_stage ON public.whatsapp_messages;
CREATE TRIGGER wa_set_stage BEFORE INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.message_set_stage();

UPDATE public.email_messages m SET stage = f.stage FROM public.firms f WHERE m.firm_id = f.id AND m.stage IS NULL;
UPDATE public.whatsapp_messages m SET stage = f.stage FROM public.firms f WHERE m.firm_id = f.id AND m.stage IS NULL;