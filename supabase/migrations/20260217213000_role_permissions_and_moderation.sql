-- Add granular permission list to server roles.
ALTER TABLE public.server_roles
ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Moderation state on server memberships.
ALTER TABLE public.server_members
ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS timed_out_until TIMESTAMPTZ;

-- Ban records per server.
CREATE TABLE IF NOT EXISTS public.server_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  banned_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  banned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, banned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_server_bans_server_user
ON public.server_bans(server_id, banned_user_id);

ALTER TABLE public.server_bans ENABLE ROW LEVEL SECURITY;

-- Helper: evaluate whether a user has a specific permission in a server.
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
    );
$$;

-- Helper: check whether target user is actively banned from server.
CREATE OR REPLACE FUNCTION public.is_server_banned(_server_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.server_bans sb
    WHERE sb.server_id = _server_id
      AND sb.banned_user_id = _user_id
      AND (sb.expires_at IS NULL OR sb.expires_at > now())
  );
$$;

-- Seed useful defaults for existing role names when permissions are empty.
UPDATE public.server_roles
SET permissions = CASE lower(name)
  WHEN 'admin' THEN '["ban_users","kick_users","timeout_users","mute_users","pin_messages","delete_messages","manage_channels"]'::jsonb
  WHEN 'moderator' THEN '["kick_users","timeout_users","mute_users","pin_messages","delete_messages"]'::jsonb
  ELSE permissions
END
WHERE permissions = '[]'::jsonb;

-- Ensure default member role stays low-privilege.
UPDATE public.server_roles
SET permissions = '[]'::jsonb
WHERE lower(name) = 'member' AND permissions IS NULL;

-- Ban table policies.
CREATE POLICY "Members can view server bans"
ON public.server_bans
FOR SELECT
USING (public.is_server_member(auth.uid(), server_id));

CREATE POLICY "Users with ban permission can create bans"
ON public.server_bans
FOR INSERT
WITH CHECK (
  public.has_server_permission(server_id, auth.uid(), 'ban_users')
  AND banned_user_id <> auth.uid()
);

CREATE POLICY "Users with ban permission can remove bans"
ON public.server_bans
FOR DELETE
USING (public.has_server_permission(server_id, auth.uid(), 'ban_users'));

-- Channel/group management via manage_channels permission.
DROP POLICY IF EXISTS "Owners and admins can create channel groups" ON public.channel_groups;
DROP POLICY IF EXISTS "Owners and admins can update channel groups" ON public.channel_groups;
DROP POLICY IF EXISTS "Owners and admins can delete channel groups" ON public.channel_groups;
DROP POLICY IF EXISTS "Owners and admins can update channels" ON public.channels;
DROP POLICY IF EXISTS "Members can create channels" ON public.channels;
DROP POLICY IF EXISTS "Owners can delete channels" ON public.channels;

CREATE POLICY "Users with manage channels can create channel groups"
ON public.channel_groups FOR INSERT
WITH CHECK (public.has_server_permission(server_id, auth.uid(), 'manage_channels'));

CREATE POLICY "Users with manage channels can update channel groups"
ON public.channel_groups FOR UPDATE
USING (public.has_server_permission(server_id, auth.uid(), 'manage_channels'))
WITH CHECK (public.has_server_permission(server_id, auth.uid(), 'manage_channels'));

CREATE POLICY "Users with manage channels can delete channel groups"
ON public.channel_groups FOR DELETE
USING (public.has_server_permission(server_id, auth.uid(), 'manage_channels'));

CREATE POLICY "Users with manage channels can create channels"
ON public.channels FOR INSERT
WITH CHECK (public.has_server_permission(server_id, auth.uid(), 'manage_channels'));

CREATE POLICY "Users with manage channels can update channels"
ON public.channels FOR UPDATE
USING (public.has_server_permission(server_id, auth.uid(), 'manage_channels'))
WITH CHECK (public.has_server_permission(server_id, auth.uid(), 'manage_channels'));

CREATE POLICY "Users with manage channels can delete channels"
ON public.channels FOR DELETE
USING (public.has_server_permission(server_id, auth.uid(), 'manage_channels'));

-- Message moderation permissions.
DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete own messages" ON public.messages;
DROP POLICY IF EXISTS "Members can send messages" ON public.messages;

CREATE POLICY "Users can update own or pin with permission"
ON public.messages
FOR UPDATE
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = messages.channel_id
      AND public.has_server_permission(c.server_id, auth.uid(), 'pin_messages')
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = messages.channel_id
      AND public.has_server_permission(c.server_id, auth.uid(), 'pin_messages')
  )
);

CREATE POLICY "Users can delete own or moderate with permission"
ON public.messages
FOR DELETE
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = messages.channel_id
      AND public.has_server_permission(c.server_id, auth.uid(), 'delete_messages')
  )
);

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
  )
);

-- Moderate member state (kick/timeout/mute).
CREATE POLICY "Users with timeout or mute permissions can update member moderation state"
ON public.server_members
FOR UPDATE
USING (
  server_members.user_id <> auth.uid()
  AND (
    public.has_server_permission(server_members.server_id, auth.uid(), 'timeout_users')
    OR public.has_server_permission(server_members.server_id, auth.uid(), 'mute_users')
    OR EXISTS (
      SELECT 1
      FROM public.servers s
      WHERE s.id = server_members.server_id
        AND s.owner_id = auth.uid()
    )
  )
)
WITH CHECK (
  server_members.user_id <> auth.uid()
  AND (
    public.has_server_permission(server_members.server_id, auth.uid(), 'timeout_users')
    OR public.has_server_permission(server_members.server_id, auth.uid(), 'mute_users')
    OR EXISTS (
      SELECT 1
      FROM public.servers s
      WHERE s.id = server_members.server_id
        AND s.owner_id = auth.uid()
    )
  )
);

CREATE POLICY "Users with kick permission can remove members"
ON public.server_members
FOR DELETE
USING (
  server_members.user_id <> auth.uid()
  AND (
    public.has_server_permission(server_members.server_id, auth.uid(), 'kick_users')
    OR EXISTS (
      SELECT 1
      FROM public.servers s
      WHERE s.id = server_members.server_id
        AND s.owner_id = auth.uid()
    )
  )
);
