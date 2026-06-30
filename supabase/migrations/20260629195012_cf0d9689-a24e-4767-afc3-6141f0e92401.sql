
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.app_settings TO authenticated;
GRANT INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_settings_select ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY app_settings_insert_bh ON public.app_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'business_head'));
CREATE POLICY app_settings_update_bh ON public.app_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'business_head')) WITH CHECK (public.has_role(auth.uid(), 'business_head'));
INSERT INTO public.app_settings(key, value) VALUES ('monthly_target_per_rep', to_jsonb(5000000)) ON CONFLICT DO NOTHING;
