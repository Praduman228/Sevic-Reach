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
   SELECT value INTO msg FROM jsonb_array_elements(coalesce(r.output->'messages','[]'::jsonb)) WHERE value->>'touch_id' = NEW.ai_touch_id;
   IF msg IS NULL THEN RAISE EXCEPTION 'No generated message for this touch'; END IF;
   IF ch = 'whatsapp' AND coalesce((msg->'whatsapp'->>'eligible')::boolean,false) = false THEN RAISE EXCEPTION 'WhatsApp is not eligible for this message'; END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
COMMENT ON COLUMN public.ai_draft_runs.acknowledged_at IS 'DEPRECATED: draft warnings no longer require acknowledgement; retained for historical records.';