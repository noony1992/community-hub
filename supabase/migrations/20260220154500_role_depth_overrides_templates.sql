-- Role depth expansion:
-- 1) Channel/group permission overrides
-- 2) Temporary role grants with expiry
-- 3) Role templates (for import/export workflows)

-- Temporary role grants (attach extra roles to users until expiry).
CREATE TABLE IF NOT EXISTS public.server_temporary_role_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.server_roles(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  CHECK (expires_at IS NULL OR expires_at > created_at),
  UNIQUE (server_id, user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_server_temp_role_grants_server_user
ON public.server_temporary_role_grants (server_id, user_id);

CREATE INDEX IF NOT EXISTS idx_server_temp_role_grants_expires
ON public.server_temporary_role_grants (expires_at);

ALTER TABLE public.server_temporary_role_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view temporary role grants"
ON public.server_temporary_role_grants
FOR SELECT
USING (public.is_server_member(auth.uid(), server_id));

CREATE POLICY "Users with manage channels can create temporary role grants"
ON public.server_temporary_role_grants
FOR INSERT
WITH CHECK (
  public.has_server_permission(server_id, auth.uid(), 'manage_channels')
  OR EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = server_temporary_role_grants.server_id
      AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Users with manage channels can update temporary role grants"
ON public.server_temporary_role_grants
FOR UPDATE
USING (
  public.has_server_permission(server_id, auth.uid(), 'manage_channels')
  OR EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = server_temporary_role_grants.server_id
      AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  public.has_server_permission(server_id, auth.uid(), 'manage_channels')
  OR EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = server_temporary_role_grants.server_id
      AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Users with manage channels can delete temporary role grants"
ON public.server_temporary_role_grants
FOR DELETE
USING (
  public.has_server_permission(server_id, auth.uid(), 'manage_channels')
  OR EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = server_temporary_role_grants.server_id
      AND s.owner_id = auth.uid()
  )
);

-- Permission overrides scoped to a channel group or an individual channel.
CREATE TABLE IF NOT EXISTS public.role_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.server_roles(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('group', 'channel')),
  scope_id UUID NOT NULL,
  allow_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  deny_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role_id, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permission_overrides_server_scope
ON public.role_permission_overrides (server_id, scope_type, scope_id);

ALTER TABLE public.role_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view role permission overrides"
ON public.role_permission_overrides
FOR SELECT
USING (public.is_server_member(auth.uid(), server_id));

CREATE POLICY "Users with manage channels can create role permission overrides"
ON public.role_permission_overrides
FOR INSERT
WITH CHECK (
  public.has_server_permission(server_id, auth.uid(), 'manage_channels')
  OR EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = role_permission_overrides.server_id
      AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Users with manage channels can update role permission overrides"
ON public.role_permission_overrides
FOR UPDATE
USING (
  public.has_server_permission(server_id, auth.uid(), 'manage_channels')
  OR EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = role_permission_overrides.server_id
      AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  public.has_server_permission(server_id, auth.uid(), 'manage_channels')
  OR EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = role_permission_overrides.server_id
      AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Users with manage channels can delete role permission overrides"
ON public.role_permission_overrides
FOR DELETE
USING (
  public.has_server_permission(server_id, auth.uid(), 'manage_channels')
  OR EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = role_permission_overrides.server_id
      AND s.owner_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.touch_role_permission_overrides_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_role_permission_overrides_touch_updated_at
ON public.role_permission_overrides;

CREATE TRIGGER trg_role_permission_overrides_touch_updated_at
BEFORE UPDATE ON public.role_permission_overrides
FOR EACH ROW
EXECUTE FUNCTION public.touch_role_permission_overrides_updated_at();

CREATE OR REPLACE FUNCTION public.validate_role_permission_override_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  scope_server_id UUID;
  role_server_id UUID;
BEGIN
  SELECT sr.server_id
  INTO role_server_id
  FROM public.server_roles sr
  WHERE sr.id = NEW.role_id;

  IF role_server_id IS NULL OR role_server_id <> NEW.server_id THEN
    RAISE EXCEPTION 'Override role must belong to the same server.';
  END IF;

  IF NEW.scope_type = 'channel' THEN
    SELECT c.server_id INTO scope_server_id
    FROM public.channels c
    WHERE c.id = NEW.scope_id;
  ELSIF NEW.scope_type = 'group' THEN
    SELECT cg.server_id INTO scope_server_id
    FROM public.channel_groups cg
    WHERE cg.id = NEW.scope_id;
  ELSE
    RAISE EXCEPTION 'Invalid scope_type.';
  END IF;

  IF scope_server_id IS NULL OR scope_server_id <> NEW.server_id THEN
    RAISE EXCEPTION 'Override scope must belong to the same server.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_role_permission_overrides_validate_scope
ON public.role_permission_overrides;

CREATE TRIGGER trg_role_permission_overrides_validate_scope
BEFORE INSERT OR UPDATE ON public.role_permission_overrides
FOR EACH ROW
EXECUTE FUNCTION public.validate_role_permission_override_scope();

-- Server-level role templates for import/export workflows.
CREATE TABLE IF NOT EXISTS public.server_role_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (server_id, name)
);

CREATE INDEX IF NOT EXISTS idx_server_role_templates_server
ON public.server_role_templates (server_id, created_at DESC);

ALTER TABLE public.server_role_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view role templates"
ON public.server_role_templates
FOR SELECT
USING (public.is_server_member(auth.uid(), server_id));

CREATE POLICY "Users with manage channels can create role templates"
ON public.server_role_templates
FOR INSERT
WITH CHECK (
  public.has_server_permission(server_id, auth.uid(), 'manage_channels')
  OR EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = server_role_templates.server_id
      AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Users with manage channels can update role templates"
ON public.server_role_templates
FOR UPDATE
USING (
  public.has_server_permission(server_id, auth.uid(), 'manage_channels')
  OR EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = server_role_templates.server_id
      AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  public.has_server_permission(server_id, auth.uid(), 'manage_channels')
  OR EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = server_role_templates.server_id
      AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Users with manage channels can delete role templates"
ON public.server_role_templates
FOR DELETE
USING (
  public.has_server_permission(server_id, auth.uid(), 'manage_channels')
  OR EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = server_role_templates.server_id
      AND s.owner_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.touch_server_role_templates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_server_role_templates_touch_updated_at
ON public.server_role_templates;

CREATE TRIGGER trg_server_role_templates_touch_updated_at
BEFORE UPDATE ON public.server_role_templates
FOR EACH ROW
EXECUTE FUNCTION public.touch_server_role_templates_updated_at();

-- Extend server-level permission check with active temporary role grants.
CREATE OR REPLACE FUNCTION public.has_server_permission(_server_id UUID, _user_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.servers s
      WHERE s.id = _server_id
        AND s.owner_id = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.server_members sm
      JOIN public.server_roles sr
        ON sr.server_id = sm.server_id
       AND lower(sr.name) = lower(sm.role)
      WHERE sm.server_id = _server_id
        AND sm.user_id = _user_id
        AND COALESCE(sr.permissions, '[]'::jsonb) ? _permission
    )
    OR EXISTS (
      SELECT 1
      FROM public.server_temporary_role_grants trg
      JOIN public.server_roles sr
        ON sr.id = trg.role_id
       AND sr.server_id = trg.server_id
      JOIN public.server_members sm
        ON sm.server_id = trg.server_id
       AND sm.user_id = trg.user_id
      WHERE trg.server_id = _server_id
        AND trg.user_id = _user_id
        AND (trg.expires_at IS NULL OR trg.expires_at > now())
        AND COALESCE(sr.permissions, '[]'::jsonb) ? _permission
    );
$$;

-- Channel-scoped permission evaluation:
-- base (role + temporary grants) -> group overrides -> channel overrides.
CREATE OR REPLACE FUNCTION public.has_channel_permission(_channel_id UUID, _user_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  channel_server_id UUID;
  channel_group_id UUID;
  base_allowed BOOLEAN := false;
  group_allowed BOOLEAN := false;
  group_denied BOOLEAN := false;
  channel_allowed BOOLEAN := false;
  channel_denied BOOLEAN := false;
BEGIN
  SELECT c.server_id, c.group_id
  INTO channel_server_id, channel_group_id
  FROM public.channels c
  WHERE c.id = _channel_id;

  IF channel_server_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = channel_server_id
      AND s.owner_id = _user_id
  ) THEN
    RETURN TRUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.server_members sm
    WHERE sm.server_id = channel_server_id
      AND sm.user_id = _user_id
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    WITH active_role_ids AS (
      SELECT sr.id
      FROM public.server_members sm
      JOIN public.server_roles sr
        ON sr.server_id = sm.server_id
       AND lower(sr.name) = lower(sm.role)
      WHERE sm.server_id = channel_server_id
        AND sm.user_id = _user_id
      UNION
      SELECT trg.role_id
      FROM public.server_temporary_role_grants trg
      WHERE trg.server_id = channel_server_id
        AND trg.user_id = _user_id
        AND (trg.expires_at IS NULL OR trg.expires_at > now())
    )
    SELECT 1
    FROM active_role_ids ar
    JOIN public.server_roles sr ON sr.id = ar.id
    WHERE COALESCE(sr.permissions, '[]'::jsonb) ? _permission
  ) INTO base_allowed;

  IF channel_group_id IS NOT NULL THEN
    SELECT EXISTS (
      WITH active_role_ids AS (
        SELECT sr.id
        FROM public.server_members sm
        JOIN public.server_roles sr
          ON sr.server_id = sm.server_id
         AND lower(sr.name) = lower(sm.role)
        WHERE sm.server_id = channel_server_id
          AND sm.user_id = _user_id
        UNION
        SELECT trg.role_id
        FROM public.server_temporary_role_grants trg
        WHERE trg.server_id = channel_server_id
          AND trg.user_id = _user_id
          AND (trg.expires_at IS NULL OR trg.expires_at > now())
      )
      SELECT 1
      FROM public.role_permission_overrides rpo
      JOIN active_role_ids ar ON ar.id = rpo.role_id
      WHERE rpo.server_id = channel_server_id
        AND rpo.scope_type = 'group'
        AND rpo.scope_id = channel_group_id
        AND COALESCE(rpo.deny_permissions, '[]'::jsonb) ? _permission
    ) INTO group_denied;

    SELECT EXISTS (
      WITH active_role_ids AS (
        SELECT sr.id
        FROM public.server_members sm
        JOIN public.server_roles sr
          ON sr.server_id = sm.server_id
         AND lower(sr.name) = lower(sm.role)
        WHERE sm.server_id = channel_server_id
          AND sm.user_id = _user_id
        UNION
        SELECT trg.role_id
        FROM public.server_temporary_role_grants trg
        WHERE trg.server_id = channel_server_id
          AND trg.user_id = _user_id
          AND (trg.expires_at IS NULL OR trg.expires_at > now())
      )
      SELECT 1
      FROM public.role_permission_overrides rpo
      JOIN active_role_ids ar ON ar.id = rpo.role_id
      WHERE rpo.server_id = channel_server_id
        AND rpo.scope_type = 'group'
        AND rpo.scope_id = channel_group_id
        AND COALESCE(rpo.allow_permissions, '[]'::jsonb) ? _permission
    ) INTO group_allowed;
  END IF;

  SELECT EXISTS (
    WITH active_role_ids AS (
      SELECT sr.id
      FROM public.server_members sm
      JOIN public.server_roles sr
        ON sr.server_id = sm.server_id
       AND lower(sr.name) = lower(sm.role)
      WHERE sm.server_id = channel_server_id
        AND sm.user_id = _user_id
      UNION
      SELECT trg.role_id
      FROM public.server_temporary_role_grants trg
      WHERE trg.server_id = channel_server_id
        AND trg.user_id = _user_id
        AND (trg.expires_at IS NULL OR trg.expires_at > now())
    )
    SELECT 1
    FROM public.role_permission_overrides rpo
    JOIN active_role_ids ar ON ar.id = rpo.role_id
    WHERE rpo.server_id = channel_server_id
      AND rpo.scope_type = 'channel'
      AND rpo.scope_id = _channel_id
      AND COALESCE(rpo.deny_permissions, '[]'::jsonb) ? _permission
  ) INTO channel_denied;

  SELECT EXISTS (
    WITH active_role_ids AS (
      SELECT sr.id
      FROM public.server_members sm
      JOIN public.server_roles sr
        ON sr.server_id = sm.server_id
       AND lower(sr.name) = lower(sm.role)
      WHERE sm.server_id = channel_server_id
        AND sm.user_id = _user_id
      UNION
      SELECT trg.role_id
      FROM public.server_temporary_role_grants trg
      WHERE trg.server_id = channel_server_id
        AND trg.user_id = _user_id
        AND (trg.expires_at IS NULL OR trg.expires_at > now())
    )
    SELECT 1
    FROM public.role_permission_overrides rpo
    JOIN active_role_ids ar ON ar.id = rpo.role_id
    WHERE rpo.server_id = channel_server_id
      AND rpo.scope_type = 'channel'
      AND rpo.scope_id = _channel_id
      AND COALESCE(rpo.allow_permissions, '[]'::jsonb) ? _permission
  ) INTO channel_allowed;

  RETURN (((base_allowed AND NOT group_denied) OR group_allowed) AND NOT channel_denied) OR channel_allowed;
END;
$$;

-- Use channel-aware permission checks for message moderation actions.
DROP POLICY IF EXISTS "Users can update own or pin with permission" ON public.messages;
CREATE POLICY "Users can update own or pin with permission"
ON public.messages
FOR UPDATE
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = messages.channel_id
      AND public.has_channel_permission(c.id, auth.uid(), 'pin_messages')
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = messages.channel_id
      AND public.has_channel_permission(c.id, auth.uid(), 'pin_messages')
  )
);

DROP POLICY IF EXISTS "Users can delete own or moderate with permission" ON public.messages;
CREATE POLICY "Users can delete own or moderate with permission"
ON public.messages
FOR DELETE
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = messages.channel_id
      AND public.has_channel_permission(c.id, auth.uid(), 'delete_messages')
  )
);
