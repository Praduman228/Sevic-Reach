ALTER TABLE public.firms ALTER COLUMN stage SET DEFAULT 'backlog'::public.firm_stage;
CREATE OR REPLACE FUNCTION public.firm_has_outgoing_send(_firm_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM public.email_messages WHERE firm_id=_firm_id AND direction='out' AND (status IN ('sent','submitted','enqueued','delivered','read') OR provider_message_id IS NOT NULL)) OR EXISTS (SELECT 1 FROM public.whatsapp_messages WHERE firm_id=_firm_id AND direction='out' AND (status IN ('sent','submitted','enqueued','delivered','read') OR provider_message_id IS NOT NULL));
$$;
REVOKE ALL ON FUNCTION public.firm_has_outgoing_send(uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.enforce_firm_backlog() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.stage IN ('backlog','outreach') THEN
  IF public.firm_has_outgoing_send(NEW.id) THEN NEW.stage := 'outreach'; ELSE NEW.stage := 'backlog'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER firms_backlog BEFORE INSERT OR UPDATE OF stage ON public.firms FOR EACH ROW EXECUTE FUNCTION public.enforce_firm_backlog();
CREATE OR REPLACE FUNCTION public.promote_backlog_on_send() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.firm_id IS NOT NULL AND NEW.direction='out' AND NEW.status IN ('sent','submitted','enqueued','delivered','read') THEN
  UPDATE public.firms SET stage='outreach' WHERE id=NEW.firm_id AND stage='backlog';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER email_promote_backlog AFTER INSERT OR UPDATE OF status ON public.email_messages FOR EACH ROW EXECUTE FUNCTION public.promote_backlog_on_send();
CREATE TRIGGER whatsapp_promote_backlog AFTER INSERT OR UPDATE OF status ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.promote_backlog_on_send();
CREATE OR REPLACE FUNCTION public.message_set_stage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.stage IS NULL AND NEW.firm_id IS NOT NULL THEN
  SELECT CASE WHEN stage='backlog' THEN 'outreach'::public.firm_stage ELSE stage END INTO NEW.stage FROM public.firms WHERE id=NEW.firm_id;
 END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.stop_channel_sequences_on_stage_change() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.stage IS DISTINCT FROM OLD.stage THEN
  UPDATE public.sequence_channel_messages SET status='skipped',scheduled_at=NULL,result='Firm moved to another stage',updated_at=now() WHERE firm_id=NEW.id AND stage <> CASE WHEN NEW.stage='backlog' THEN 'outreach'::public.firm_stage ELSE NEW.stage END AND status IN ('draft','approved');
 END IF;
 RETURN NEW;
END;
$$;