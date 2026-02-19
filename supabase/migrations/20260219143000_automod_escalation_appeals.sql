-- AutoMod, escalation queue, and appeal workflow.

ALTER TABLE public.moderation_audit_logs
DROP CONSTRAINT IF EXISTS moderation_audit_logs_action_check;

ALTER TABLE public.moderation_audit_logs
ADD CONSTRAINT moderation_audit_logs_action_check
CHECK (
  action IN (
    'ban_user',
    'temp_ban_user',
    'unban_user',
    'edit_member_role',
    'delete_channel',
    'edit_ban_length',
    'timeout_user',
    'clear_timeout',
    'mute_user',
    'unmute_user',
    'warn_user',
    'add_mod_note',
    'automod_block',
    'assign_escalation',
    'update_escalation_status',
    'file_appeal',
    'approve_appeal',
    'reject_appeal'
  )
);

CREATE TABLE IF NOT EXISTS public.server_automod_rules (
  server_id UUID PRIMARY KEY REFERENCES public.servers(id) ON DELETE CASCADE,
  regex_patterns TEXT[] NOT NULL DEFAULT '{}'::text[],
  block_all_links BOOLEAN NOT NULL DEFAULT false,
  blocked_domains TEXT[] NOT NULL DEFAULT '{}'::text[],
  toxicity_enabled BOOLEAN NOT NULL DEFAULT true,
  toxicity_threshold INTEGER NOT NULL DEFAULT 2 CHECK (toxicity_threshold BETWEEN 1 AND 20),
  toxicity_terms TEXT[] NOT NULL DEFAULT ARRAY[
    'kill yourself',
    'kys',
    'nazi',
    'slur',
    'hate',
    'retard',
    'fag',
    'whore',
    'die'
  ]::text[],
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.moderation_escalation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('automod', 'manual_report', 'appeal')),
  source_ref_id UUID,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) > 0),
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_moderation_escalation_queue_server_status_created
ON public.moderation_escalation_queue(server_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.moderation_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  punishment_type TEXT NOT NULL CHECK (punishment_type IN ('ban', 'timeout')),
  punishment_ref_id UUID,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) > 0),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decision_note TEXT,
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_appeals_server_status_created
ON public.moderation_appeals(server_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_appeals_open_per_type
ON public.moderation_appeals(server_id, user_id, punishment_type)
WHERE status IN ('submitted', 'under_review');

ALTER TABLE public.server_automod_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_escalation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_appeals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with mod menu can view AutoMod rules"
ON public.server_automod_rules
FOR SELECT
USING (public.has_server_permission(server_id, auth.uid(), 'mod_menu'));

CREATE POLICY "Users with mod menu can insert AutoMod rules"
ON public.server_automod_rules
FOR INSERT
WITH CHECK (
  public.has_server_permission(server_id, auth.uid(), 'mod_menu')
  AND (updated_by IS NULL OR updated_by = auth.uid())
);

CREATE POLICY "Users with mod menu can update AutoMod rules"
ON public.server_automod_rules
FOR UPDATE
USING (public.has_server_permission(server_id, auth.uid(), 'mod_menu'))
WITH CHECK (
  public.has_server_permission(server_id, auth.uid(), 'mod_menu')
  AND (updated_by IS NULL OR updated_by = auth.uid())
);

CREATE POLICY "Users with mod menu can view escalation queue"
ON public.moderation_escalation_queue
FOR SELECT
USING (public.has_server_permission(server_id, auth.uid(), 'mod_menu'));

CREATE POLICY "Users with mod menu can insert escalation queue items"
ON public.moderation_escalation_queue
FOR INSERT
WITH CHECK (public.has_server_permission(server_id, auth.uid(), 'mod_menu'));

CREATE POLICY "Users with mod menu can update escalation queue items"
ON public.moderation_escalation_queue
FOR UPDATE
USING (public.has_server_permission(server_id, auth.uid(), 'mod_menu'))
WITH CHECK (public.has_server_permission(server_id, auth.uid(), 'mod_menu'));

CREATE POLICY "Users can view own appeals or mods can view all"
ON public.moderation_appeals
FOR SELECT
USING (
  auth.uid() = user_id
  OR public.has_server_permission(server_id, auth.uid(), 'mod_menu')
);

CREATE POLICY "Users can submit appeals for active punishments"
ON public.moderation_appeals
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    (
      punishment_type = 'ban'
      AND EXISTS (
        SELECT 1
        FROM public.server_bans sb
        WHERE sb.server_id = moderation_appeals.server_id
          AND sb.banned_user_id = auth.uid()
          AND (sb.expires_at IS NULL OR sb.expires_at > now())
      )
    )
    OR
    (
      punishment_type = 'timeout'
      AND EXISTS (
        SELECT 1
        FROM public.server_members sm
        WHERE sm.server_id = moderation_appeals.server_id
          AND sm.user_id = auth.uid()
          AND sm.timed_out_until IS NOT NULL
          AND sm.timed_out_until > now()
      )
    )
  )
);

CREATE POLICY "Users with mod menu can update appeals"
ON public.moderation_appeals
FOR UPDATE
USING (public.has_server_permission(server_id, auth.uid(), 'mod_menu'))
WITH CHECK (public.has_server_permission(server_id, auth.uid(), 'mod_menu'));

CREATE OR REPLACE FUNCTION public.touch_moderation_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_escalation_queue_updated_at ON public.moderation_escalation_queue;
CREATE TRIGGER trg_touch_escalation_queue_updated_at
BEFORE UPDATE ON public.moderation_escalation_queue
FOR EACH ROW
EXECUTE FUNCTION public.touch_moderation_updated_at();

DROP TRIGGER IF EXISTS trg_touch_appeals_updated_at ON public.moderation_appeals;
CREATE TRIGGER trg_touch_appeals_updated_at
BEFORE UPDATE ON public.moderation_appeals
FOR EACH ROW
EXECUTE FUNCTION public.touch_moderation_updated_at();

DROP TRIGGER IF EXISTS trg_touch_automod_rules_updated_at ON public.server_automod_rules;
CREATE TRIGGER trg_touch_automod_rules_updated_at
BEFORE UPDATE ON public.server_automod_rules
FOR EACH ROW
EXECUTE FUNCTION public.touch_moderation_updated_at();

CREATE OR REPLACE FUNCTION public.enqueue_new_appeal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_queue_id UUID;
BEGIN
  INSERT INTO public.moderation_escalation_queue (
    server_id,
    source_type,
    source_ref_id,
    status,
    priority,
    created_by,
    target_user_id,
    reason,
    context
  ) VALUES (
    NEW.server_id,
    'appeal',
    NEW.id,
    'open',
    'medium',
    NEW.user_id,
    NEW.user_id,
    format('New %s appeal submitted', NEW.punishment_type),
    jsonb_build_object(
      'appeal_id', NEW.id,
      'punishment_type', NEW.punishment_type
    )
  )
  RETURNING id INTO created_queue_id;

  INSERT INTO public.moderation_audit_logs (
    server_id,
    actor_id,
    target_user_id,
    action,
    metadata
  ) VALUES (
    NEW.server_id,
    NEW.user_id,
    NEW.user_id,
    'file_appeal',
    jsonb_build_object(
      'appeal_id', NEW.id,
      'queue_id', created_queue_id,
      'punishment_type', NEW.punishment_type
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_new_appeal ON public.moderation_appeals;
CREATE TRIGGER trg_enqueue_new_appeal
AFTER INSERT ON public.moderation_appeals
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_new_appeal();

CREATE OR REPLACE FUNCTION public.evaluate_automod_message(
  _server_id UUID,
  _user_id UUID,
  _content TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rules_row public.server_automod_rules%ROWTYPE;
  detected_domains TEXT[] := '{}'::text[];
  blocked_domains_found TEXT[] := '{}'::text[];
  regex_matches_found TEXT[] := '{}'::text[];
  toxicity_matches_found TEXT[] := '{}'::text[];
  toxicity_score INTEGER := 0;
  reasons JSONB := '[]'::jsonb;
  should_block BOOLEAN := false;
  queue_id UUID := NULL;
BEGIN
  IF _content IS NULL OR char_length(trim(_content)) = 0 THEN
    RETURN jsonb_build_object('blocked', false, 'reasons', reasons, 'toxicity_score', 0, 'queue_id', NULL);
  END IF;

  IF NOT public.is_server_member(_user_id, _server_id) THEN
    RETURN jsonb_build_object('blocked', false, 'reasons', reasons, 'toxicity_score', 0, 'queue_id', NULL);
  END IF;

  SELECT *
  INTO rules_row
  FROM public.server_automod_rules
  WHERE server_id = _server_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('blocked', false, 'reasons', reasons, 'toxicity_score', 0, 'queue_id', NULL);
  END IF;

  SELECT COALESCE(array_agg(rule_pattern), '{}'::text[])
  INTO regex_matches_found
  FROM unnest(rules_row.regex_patterns) AS rule_pattern
  WHERE char_length(trim(rule_pattern)) > 0
    AND _content ~* rule_pattern;

  IF array_length(regex_matches_found, 1) IS NOT NULL THEN
    reasons = reasons || jsonb_build_array(
      jsonb_build_object(
        'type', 'regex',
        'matches', regex_matches_found
      )
    );
  END IF;

  SELECT COALESCE(array_agg(DISTINCT lower((match_item)[1])), '{}'::text[])
  INTO detected_domains
  FROM regexp_matches(
    lower(_content),
    '(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9.-]*\.[a-z]{2,})',
    'g'
  ) AS match_item;

  IF rules_row.block_all_links AND array_length(detected_domains, 1) IS NOT NULL THEN
    reasons = reasons || jsonb_build_array(
      jsonb_build_object(
        'type', 'links',
        'mode', 'block_all_links',
        'domains', detected_domains
      )
    );
  END IF;

  IF array_length(detected_domains, 1) IS NOT NULL AND array_length(rules_row.blocked_domains, 1) IS NOT NULL THEN
    SELECT COALESCE(array_agg(domain_name), '{}'::text[])
    INTO blocked_domains_found
    FROM unnest(detected_domains) AS domain_name
    WHERE domain_name = ANY (rules_row.blocked_domains);

    IF array_length(blocked_domains_found, 1) IS NOT NULL THEN
      reasons = reasons || jsonb_build_array(
        jsonb_build_object(
          'type', 'domain_filter',
          'matches', blocked_domains_found
        )
      );
    END IF;
  END IF;

  IF rules_row.toxicity_enabled THEN
    SELECT COALESCE(array_agg(term), '{}'::text[])
    INTO toxicity_matches_found
    FROM unnest(rules_row.toxicity_terms) AS term
    WHERE char_length(trim(term)) > 0
      AND lower(_content) LIKE ('%' || lower(term) || '%');

    toxicity_score = COALESCE(array_length(toxicity_matches_found, 1), 0);

    IF toxicity_score >= rules_row.toxicity_threshold THEN
      reasons = reasons || jsonb_build_array(
        jsonb_build_object(
          'type', 'toxicity',
          'score', toxicity_score,
          'threshold', rules_row.toxicity_threshold,
          'matches', toxicity_matches_found
        )
      );
    END IF;
  END IF;

  should_block = jsonb_array_length(reasons) > 0;

  IF should_block THEN
    INSERT INTO public.moderation_escalation_queue (
      server_id,
      source_type,
      status,
      priority,
      created_by,
      target_user_id,
      reason,
      context
    ) VALUES (
      _server_id,
      'automod',
      'open',
      CASE WHEN toxicity_score >= rules_row.toxicity_threshold + 2 THEN 'high' ELSE 'medium' END,
      _user_id,
      _user_id,
      'AutoMod blocked a message',
      jsonb_build_object(
        'reasons', reasons,
        'toxicity_score', toxicity_score,
        'detected_domains', detected_domains
      )
    )
    RETURNING id INTO queue_id;

    INSERT INTO public.moderation_audit_logs (
      server_id,
      actor_id,
      target_user_id,
      action,
      metadata
    ) VALUES (
      _server_id,
      _user_id,
      _user_id,
      'automod_block',
      jsonb_build_object(
        'queue_id', queue_id,
        'reasons', reasons,
        'toxicity_score', toxicity_score
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'blocked', should_block,
    'reasons', reasons,
    'toxicity_score', toxicity_score,
    'queue_id', queue_id
  );
END;
$$;
