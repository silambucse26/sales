DROP POLICY IF EXISTS app_settings_insert_bh ON public.app_settings;
DROP POLICY IF EXISTS app_settings_update_bh ON public.app_settings;

CREATE POLICY app_settings_insert_heads
ON public.app_settings
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_head(auth.uid()));

CREATE POLICY app_settings_update_heads
ON public.app_settings
FOR UPDATE
TO authenticated
USING (public.is_admin_or_head(auth.uid()))
WITH CHECK (public.is_admin_or_head(auth.uid()));
