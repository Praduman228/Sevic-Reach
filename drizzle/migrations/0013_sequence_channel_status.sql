ALTER TABLE public.sequence_messages
  ADD COLUMN email_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN whatsapp_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN email_sent_at timestamptz,
  ADD COLUMN whatsapp_sent_at timestamptz;
UPDATE public.sequence_messages SET
  email_status = CASE WHEN status = 'sending' THEN 'approved' WHEN status = 'sent' THEN CASE WHEN coalesce(result,'') LIKE '%Email sent%' THEN 'sent' ELSE 'skipped' END ELSE status END,
  whatsapp_status = CASE WHEN status = 'sending' THEN 'approved' WHEN status = 'sent' THEN CASE WHEN coalesce(result,'') LIKE '%WhatsApp sent%' THEN 'sent' ELSE 'skipped' END ELSE status END,
  email_sent_at = CASE WHEN status = 'sent' AND coalesce(result,'') LIKE '%Email sent%' THEN sent_at END,
  whatsapp_sent_at = CASE WHEN status = 'sent' AND coalesce(result,'') LIKE '%WhatsApp sent%' THEN sent_at END;
COMMENT ON COLUMN public.sequence_messages.status IS 'Summary of email_status/whatsapp_status, kept for compatibility';
CREATE INDEX sequence_messages_email_due ON public.sequence_messages (email_status, scheduled_at);
CREATE INDEX sequence_messages_whatsapp_due ON public.sequence_messages (whatsapp_status, scheduled_at);