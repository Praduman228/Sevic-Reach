CREATE TABLE public.offer_catalog_settings (
 id text PRIMARY KEY DEFAULT 'default',
 catalog jsonb NOT NULL DEFAULT '[]'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.offer_catalog_settings TO authenticated;
GRANT ALL ON public.offer_catalog_settings TO service_role;
ALTER TABLE public.offer_catalog_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_team_read ON public.offer_catalog_settings FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY catalog_admin_insert ON public.offer_catalog_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY catalog_admin_update ON public.offer_catalog_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TABLE public.ai_draft_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
 contact_id uuid REFERENCES public.firm_contacts(id) ON DELETE CASCADE,
 stage public.firm_stage NOT NULL,
 kind text NOT NULL,
 offer_card text NOT NULL DEFAULT '',
 offer_plan jsonb NOT NULL,
 output jsonb NOT NULL DEFAULT '{}'::jsonb,
 needs_input jsonb NOT NULL DEFAULT '[]'::jsonb,
 warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
 acknowledged_at timestamptz,
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_draft_runs TO authenticated;
GRANT UPDATE (acknowledged_at) ON public.ai_draft_runs TO authenticated;
GRANT ALL ON public.ai_draft_runs TO service_role;
ALTER TABLE public.ai_draft_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY draft_runs_team_read ON public.ai_draft_runs FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY draft_runs_team_ack ON public.ai_draft_runs FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));
ALTER TABLE public.sequence_messages ADD COLUMN email_ai_run_id uuid REFERENCES public.ai_draft_runs(id), ADD COLUMN whatsapp_ai_run_id uuid REFERENCES public.ai_draft_runs(id), ADD COLUMN ai_touch_id text;
ALTER TABLE public.contact_sequence_messages ADD COLUMN email_ai_run_id uuid REFERENCES public.ai_draft_runs(id), ADD COLUMN whatsapp_ai_run_id uuid REFERENCES public.ai_draft_runs(id), ADD COLUMN ai_touch_id text;
CREATE INDEX ai_draft_runs_firm_stage ON public.ai_draft_runs(firm_id, stage, created_at DESC);
CREATE OR REPLACE FUNCTION public.validate_ai_sequence_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ch text; run_id uuid; r public.ai_draft_runs; msg jsonb; next_status text; old_status text;
BEGIN
 IF current_user <> 'service_role' AND coalesce(auth.role(), '') <> 'service_role' THEN
  IF TG_OP = 'INSERT' THEN
   IF NEW.email_ai_run_id IS NOT NULL OR NEW.whatsapp_ai_run_id IS NOT NULL OR NEW.ai_touch_id IS NOT NULL THEN RAISE EXCEPTION 'AI metadata is written only by the drafting service'; END IF;
  ELSE
   IF NEW.email_ai_run_id IS DISTINCT FROM OLD.email_ai_run_id OR NEW.whatsapp_ai_run_id IS DISTINCT FROM OLD.whatsapp_ai_run_id OR NEW.ai_touch_id IS DISTINCT FROM OLD.ai_touch_id THEN RAISE EXCEPTION 'AI review metadata cannot be changed'; END IF;
  END IF;
 END IF;
 FOREACH ch IN ARRAY ARRAY['email','whatsapp'] LOOP
  run_id := CASE WHEN ch = 'email' THEN NEW.email_ai_run_id ELSE NEW.whatsapp_ai_run_id END;
  next_status := CASE WHEN ch = 'email' THEN NEW.email_status ELSE NEW.whatsapp_status END;
  old_status := CASE WHEN TG_OP = 'INSERT' THEN 'draft' WHEN ch = 'email' THEN OLD.email_status ELSE OLD.whatsapp_status END;
  IF run_id IS NOT NULL AND next_status IN ('approved','sending') AND next_status IS DISTINCT FROM old_status THEN
   SELECT * INTO r FROM public.ai_draft_runs WHERE id = run_id;
   IF NOT FOUND OR r.firm_id <> NEW.firm_id OR r.stage <> NEW.stage OR r.contact_id IS DISTINCT FROM (to_jsonb(NEW)->>'contact_id')::uuid THEN RAISE EXCEPTION 'AI review does not belong to this sequence'; END IF;
   IF r.offer_plan->>'status' = 'do_not_pitch' THEN RAISE EXCEPTION 'Do not pitch: no AI messages can be approved'; END IF;
   IF (jsonb_array_length(r.needs_input) > 0 OR jsonb_array_length(r.warnings) > 0) AND r.acknowledged_at IS NULL THEN RAISE EXCEPTION 'Review and acknowledge missing input and warnings first'; END IF;
   SELECT value INTO msg FROM jsonb_array_elements(coalesce(r.output->'messages','[]'::jsonb)) WHERE value->>'touch_id' = NEW.ai_touch_id;
   IF msg IS NULL THEN RAISE EXCEPTION 'No generated message for this touch'; END IF;
   IF ch = 'whatsapp' AND coalesce((msg->'whatsapp'->>'eligible')::boolean,false) = false THEN RAISE EXCEPTION 'WhatsApp is not eligible for this message'; END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER sequence_ai_review BEFORE INSERT OR UPDATE ON public.sequence_messages FOR EACH ROW EXECUTE FUNCTION public.validate_ai_sequence_review();
CREATE TRIGGER contact_sequence_ai_review BEFORE INSERT OR UPDATE ON public.contact_sequence_messages FOR EACH ROW EXECUTE FUNCTION public.validate_ai_sequence_review();