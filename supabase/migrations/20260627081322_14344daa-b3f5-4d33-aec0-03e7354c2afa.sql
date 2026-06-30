
-- Drop dependent policies and functions first
DROP POLICY IF EXISTS commitments_delete_admin ON public.commitments;
DROP POLICY IF EXISTS intakes_update_own_or_admin ON public.intakes;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS user_roles_select_self_or_admin ON public.user_roles;
DROP POLICY IF EXISTS commitments_select ON public.commitments;
DROP POLICY IF EXISTS commitments_update ON public.commitments;
DROP POLICY IF EXISTS intakes_select ON public.intakes;
DROP POLICY IF EXISTS profiles_select_own_or_privileged ON public.profiles;

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_admin_or_head(uuid);

-- Swap enum
ALTER TYPE public.app_role RENAME TO app_role_old;
CREATE TYPE public.app_role AS ENUM ('business_head', 'sales_head', 'sales_member');

ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role
  USING (
    CASE role::text
      WHEN 'admin' THEN 'business_head'
      ELSE role::text
    END
  )::public.app_role;

DROP TYPE public.app_role_old;

-- Recreate helpers
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_admin_or_head(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('business_head','sales_head')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_business_head(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'business_head') $$;

-- handle_new_user trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _name TEXT; _phone TEXT; _role public.app_role; _has_head BOOLEAN;
BEGIN
  _name  := COALESCE(NEW.raw_user_meta_data->>'name', 'User');
  _phone := COALESCE(NEW.raw_user_meta_data->>'phone', NEW.email);
  INSERT INTO public.profiles (id, name, phone) VALUES (NEW.id, _name, _phone)
    ON CONFLICT (id) DO NOTHING;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'business_head') INTO _has_head;
  _role := CASE WHEN _has_head THEN 'sales_member'::public.app_role ELSE 'business_head'::public.app_role END;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $function$;

-- Recreate all policies on the new enum
CREATE POLICY commitments_select ON public.commitments
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR public.is_admin_or_head(auth.uid()));

CREATE POLICY commitments_update ON public.commitments
  FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()) OR public.is_admin_or_head(auth.uid()));

CREATE POLICY commitments_delete_business_head ON public.commitments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'business_head'));

CREATE POLICY intakes_select ON public.intakes
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR public.is_admin_or_head(auth.uid()));

CREATE POLICY intakes_update_own_or_business_head ON public.intakes
  FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'business_head'));

CREATE POLICY profiles_select_own_or_privileged ON public.profiles
  FOR SELECT TO authenticated
  USING ((id = auth.uid()) OR public.is_admin_or_head(auth.uid()));

CREATE POLICY profiles_update_own_or_business_head ON public.profiles
  FOR UPDATE TO authenticated
  USING ((id = auth.uid()) OR public.has_role(auth.uid(), 'business_head'));

CREATE POLICY user_roles_select_self_or_business_head ON public.user_roles
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'business_head'));

CREATE POLICY user_roles_business_head_manage ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'business_head'))
  WITH CHECK (public.has_role(auth.uid(), 'business_head'));

-- New commitment fields
ALTER TABLE public.commitments
  ADD COLUMN IF NOT EXISTS missed_reason TEXT,
  ADD COLUMN IF NOT EXISTS ai_note TEXT;
