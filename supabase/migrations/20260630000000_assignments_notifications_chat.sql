ALTER TABLE public.commitments
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.commitments
SET assigned_to = user_id
WHERE assigned_to IS NULL;

DROP POLICY IF EXISTS commitments_select ON public.commitments;
DROP POLICY IF EXISTS commitments_update ON public.commitments;

CREATE POLICY commitments_select ON public.commitments
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR assigned_to = auth.uid()
    OR public.is_admin_or_head(auth.uid())
  );

CREATE POLICY commitments_update ON public.commitments
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR assigned_to = auth.uid()
    OR public.is_admin_or_head(auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  commitment_id uuid REFERENCES public.commitments(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'assignment',
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON public.notifications;
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
DROP POLICY IF EXISTS notifications_update ON public.notifications;

CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_head(auth.uid()));

CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin_or_head(auth.uid()));

CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.sales_team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_team_messages TO authenticated;
GRANT ALL ON public.sales_team_messages TO service_role;
ALTER TABLE public.sales_team_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_team_messages_select ON public.sales_team_messages;
DROP POLICY IF EXISTS sales_team_messages_insert ON public.sales_team_messages;

CREATE POLICY sales_team_messages_select ON public.sales_team_messages
  FOR SELECT TO authenticated
  USING (member_id = auth.uid() OR sender_id = auth.uid() OR public.is_admin_or_head(auth.uid()));

CREATE POLICY sales_team_messages_insert ON public.sales_team_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND (member_id = auth.uid() OR public.is_admin_or_head(auth.uid())));

ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_team_messages;
