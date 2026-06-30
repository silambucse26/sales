
-- Recreate view with security_invoker so RLS applies to the caller
DROP VIEW IF EXISTS public.commitments_with_status;
CREATE VIEW public.commitments_with_status WITH (security_invoker = true) AS
SELECT c.*,
  CASE WHEN c.status = 'open' AND c.promise_date IS NOT NULL AND c.promise_date < CURRENT_DATE
       THEN 'missed'::public.commitment_status ELSE c.status END AS effective_status
FROM public.commitments c;
GRANT SELECT ON public.commitments_with_status TO authenticated;

-- Lock down SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_head(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_head(uuid) TO authenticated;

-- Set search_path on set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
