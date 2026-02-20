-- Onboarding flow builder with step sequencing, required channel reads,
-- and optional role assignment on completion.

CREATE TABLE IF NOT EXISTS public.server_onboarding_flows (
  server_id UUID PRIMARY KEY REFERENCES public.servers(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  assign_role_on_complete TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.server_onboarding_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  step_type TEXT NOT NULL CHECK (step_type IN ('rules_acceptance', 'read_channel', 'custom_ack')),
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  description TEXT,
  required_channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (step_type = 'read_channel' AND required_channel_id IS NOT NULL)
    OR (step_type <> 'read_channel' AND required_channel_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.user_onboarding_step_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.server_onboarding_steps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(step_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_server_onboarding_steps_server_position
ON public.server_onboarding_steps(server_id, position ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_user_onboarding_progress_server_user
ON public.user_onboarding_step_progress(server_id, user_id, completed_at DESC);

ALTER TABLE public.server_onboarding_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_onboarding_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_onboarding_step_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view onboarding flow"
ON public.server_onboarding_flows
FOR SELECT
USING (public.is_server_member(auth.uid(), server_id));

CREATE POLICY "Managers can upsert onboarding flow"
ON public.server_onboarding_flows
FOR INSERT
WITH CHECK (public.has_server_permission(server_id, auth.uid(), 'manage_channels'));

CREATE POLICY "Managers can update onboarding flow"
ON public.server_onboarding_flows
FOR UPDATE
USING (public.has_server_permission(server_id, auth.uid(), 'manage_channels'))
WITH CHECK (public.has_server_permission(server_id, auth.uid(), 'manage_channels'));

CREATE POLICY "Members can view onboarding steps"
ON public.server_onboarding_steps
FOR SELECT
USING (public.is_server_member(auth.uid(), server_id));

CREATE POLICY "Managers can insert onboarding steps"
ON public.server_onboarding_steps
FOR INSERT
WITH CHECK (public.has_server_permission(server_id, auth.uid(), 'manage_channels'));

CREATE POLICY "Managers can update onboarding steps"
ON public.server_onboarding_steps
FOR UPDATE
USING (public.has_server_permission(server_id, auth.uid(), 'manage_channels'))
WITH CHECK (public.has_server_permission(server_id, auth.uid(), 'manage_channels'));

CREATE POLICY "Managers can delete onboarding steps"
ON public.server_onboarding_steps
FOR DELETE
USING (public.has_server_permission(server_id, auth.uid(), 'manage_channels'));

CREATE POLICY "Users can view own onboarding progress"
ON public.user_onboarding_step_progress
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own onboarding progress"
ON public.user_onboarding_step_progress
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND public.is_server_member(auth.uid(), server_id)
  AND EXISTS (
    SELECT 1
    FROM public.server_onboarding_steps sos
    WHERE sos.id = user_onboarding_step_progress.step_id
      AND sos.server_id = user_onboarding_step_progress.server_id
      AND sos.step_type = 'custom_ack'
  )
);

CREATE POLICY "Users can update own onboarding progress"
ON public.user_onboarding_step_progress
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_onboarding_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_server_onboarding_flows_updated_at ON public.server_onboarding_flows;
CREATE TRIGGER trg_update_server_onboarding_flows_updated_at
BEFORE UPDATE ON public.server_onboarding_flows
FOR EACH ROW
EXECUTE FUNCTION public.update_onboarding_updated_at();

DROP TRIGGER IF EXISTS trg_update_server_onboarding_steps_updated_at ON public.server_onboarding_steps;
CREATE TRIGGER trg_update_server_onboarding_steps_updated_at
BEFORE UPDATE ON public.server_onboarding_steps
FOR EACH ROW
EXECUTE FUNCTION public.update_onboarding_updated_at();

CREATE OR REPLACE FUNCTION public.onboarding_requirements_met(_server_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  flow_enabled BOOLEAN := true;
  missing_count INTEGER := 0;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.is_server_member(_user_id, _server_id) THEN
    RETURN false;
  END IF;

  SELECT sof.enabled
  INTO flow_enabled
  FROM public.server_onboarding_flows sof
  WHERE sof.server_id = _server_id;

  IF flow_enabled IS NULL OR flow_enabled = false THEN
    RETURN true;
  END IF;

  SELECT COUNT(1)
  INTO missing_count
  FROM public.server_onboarding_steps sos
  WHERE sos.server_id = _server_id
    AND sos.is_required = true
    AND (
      (sos.step_type = 'rules_acceptance' AND NOT EXISTS (
        SELECT 1
        FROM public.server_rule_acceptances sra
        WHERE sra.server_id = _server_id
          AND sra.user_id = _user_id
      ))
      OR
      (sos.step_type = 'read_channel' AND NOT EXISTS (
        SELECT 1
        FROM public.channel_reads cr
        WHERE cr.user_id = _user_id
          AND cr.channel_id = sos.required_channel_id
      ))
      OR
      (sos.step_type = 'custom_ack' AND NOT EXISTS (
        SELECT 1
        FROM public.user_onboarding_step_progress uosp
        WHERE uosp.server_id = _server_id
          AND uosp.step_id = sos.id
          AND uosp.user_id = _user_id
      ))
    );

  RETURN missing_count = 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_onboarding_for_current_user(
  _server_id UUID,
  _completed_custom_step_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _assign_role TEXT := NULL;
  _missing_count INTEGER := 0;
  _role_assigned BOOLEAN := false;
  _updated_count INTEGER := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_server_member(_uid, _server_id) THEN
    RAISE EXCEPTION 'Not a server member';
  END IF;

  IF _completed_custom_step_ids IS NOT NULL AND array_length(_completed_custom_step_ids, 1) > 0 THEN
    INSERT INTO public.user_onboarding_step_progress (server_id, step_id, user_id, completed_at)
    SELECT
      _server_id,
      sos.id,
      _uid,
      now()
    FROM public.server_onboarding_steps sos
    WHERE sos.server_id = _server_id
      AND sos.step_type = 'custom_ack'
      AND sos.id = ANY (_completed_custom_step_ids)
    ON CONFLICT (step_id, user_id) DO NOTHING;
  END IF;

  SELECT COUNT(1)
  INTO _missing_count
  FROM public.server_onboarding_steps sos
  WHERE sos.server_id = _server_id
    AND sos.is_required = true
    AND (
      (sos.step_type = 'rules_acceptance' AND NOT EXISTS (
        SELECT 1 FROM public.server_rule_acceptances sra
        WHERE sra.server_id = _server_id
          AND sra.user_id = _uid
      ))
      OR
      (sos.step_type = 'read_channel' AND NOT EXISTS (
        SELECT 1 FROM public.channel_reads cr
        WHERE cr.user_id = _uid
          AND cr.channel_id = sos.required_channel_id
      ))
      OR
      (sos.step_type = 'custom_ack' AND NOT EXISTS (
        SELECT 1 FROM public.user_onboarding_step_progress uosp
        WHERE uosp.server_id = _server_id
          AND uosp.step_id = sos.id
          AND uosp.user_id = _uid
      ))
    );

  IF _missing_count = 0 THEN
    SELECT sof.assign_role_on_complete
    INTO _assign_role
    FROM public.server_onboarding_flows sof
    WHERE sof.server_id = _server_id
      AND sof.enabled = true;

    IF _assign_role IS NOT NULL AND char_length(trim(_assign_role)) > 0 THEN
      IF EXISTS (
        SELECT 1
        FROM public.server_roles sr
        WHERE sr.server_id = _server_id
          AND lower(sr.name) = lower(_assign_role)
      ) THEN
        UPDATE public.server_members sm
        SET role = _assign_role
        WHERE sm.server_id = _server_id
          AND sm.user_id = _uid
          AND lower(sm.role) <> 'owner';
        GET DIAGNOSTICS _updated_count = ROW_COUNT;
        _role_assigned := _updated_count > 0;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'complete', _missing_count = 0,
    'missing_required_steps', _missing_count,
    'role_assigned', _role_assigned
  );
END;
$$;

INSERT INTO public.server_onboarding_flows (server_id, enabled)
SELECT s.id, true
FROM public.servers s
ON CONFLICT (server_id) DO NOTHING;

INSERT INTO public.server_onboarding_steps (server_id, position, step_type, title, description, is_required)
SELECT
  s.id,
  1,
  'rules_acceptance',
  'Accept server rules',
  'Review and accept server rules before participating.',
  true
FROM public.servers s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.server_onboarding_steps sos
  WHERE sos.server_id = s.id
);

DROP POLICY IF EXISTS "Members can send messages when not timed out or muted or banned" ON public.messages;

CREATE POLICY "Members can send messages when not timed out or muted or banned"
ON public.messages
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.channels c
    JOIN public.server_members sm
      ON sm.server_id = c.server_id
     AND sm.user_id = auth.uid()
    WHERE c.id = channel_id
      AND NOT public.is_server_banned(c.server_id, auth.uid())
      AND (sm.timed_out_until IS NULL OR sm.timed_out_until <= now())
      AND (sm.muted_until IS NULL OR sm.muted_until <= now())
      AND public.onboarding_requirements_met(c.server_id, auth.uid())
  )
);
