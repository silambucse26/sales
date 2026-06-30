
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'sales_head', 'sales_member');
CREATE TYPE public.commitment_status AS ENUM ('open', 'completed', 'missed', 'delayed');
CREATE TYPE public.intake_source AS ENUM ('text', 'voice', 'file', 'excel', 'whatsapp');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_head(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','sales_head'))
$$;

-- Profiles policies
CREATE POLICY "profiles_select_own_or_privileged" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin_or_head(auth.uid()));
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- user_roles policies
CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- Intakes
CREATE TABLE public.intakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source public.intake_source NOT NULL DEFAULT 'text',
  raw_text TEXT,
  file_name TEXT,
  extracted JSONB,
  status TEXT NOT NULL DEFAULT 'processed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intakes TO authenticated;
GRANT ALL ON public.intakes TO service_role;
ALTER TABLE public.intakes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intakes_select" ON public.intakes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_head(auth.uid()));
CREATE POLICY "intakes_insert" ON public.intakes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "intakes_update_own_or_admin" ON public.intakes FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- Commitments
CREATE TABLE public.commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intake_id UUID REFERENCES public.intakes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  customer TEXT,
  salesperson TEXT,
  product TEXT,
  expected_revenue NUMERIC(14,2) DEFAULT 0,
  promise_date DATE,
  next_action TEXT,
  risk_level TEXT,
  status public.commitment_status NOT NULL DEFAULT 'open',
  remarks TEXT,
  reminder_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commitments TO authenticated;
GRANT ALL ON public.commitments TO service_role;
ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commitments_select" ON public.commitments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_head(auth.uid()));
CREATE POLICY "commitments_insert" ON public.commitments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "commitments_update" ON public.commitments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_head(auth.uid()));
CREATE POLICY "commitments_delete_admin" ON public.commitments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER commitments_set_updated_at BEFORE UPDATE ON public.commitments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile + role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _name TEXT;
  _phone TEXT;
  _role public.app_role;
  _has_admin BOOLEAN;
BEGIN
  _name  := COALESCE(NEW.raw_user_meta_data->>'name', 'User');
  _phone := COALESCE(NEW.raw_user_meta_data->>'phone', NEW.email);

  INSERT INTO public.profiles (id, name, phone) VALUES (NEW.id, _name, _phone)
  ON CONFLICT (id) DO NOTHING;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO _has_admin;
  _role := CASE WHEN _has_admin THEN 'sales_member'::public.app_role ELSE 'admin'::public.app_role END;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-mark missed commitments helper (used in dashboards)
CREATE OR REPLACE VIEW public.commitments_with_status AS
SELECT c.*,
  CASE WHEN c.status = 'open' AND c.promise_date IS NOT NULL AND c.promise_date < CURRENT_DATE
       THEN 'missed'::public.commitment_status ELSE c.status END AS effective_status
FROM public.commitments c;
GRANT SELECT ON public.commitments_with_status TO authenticated;
