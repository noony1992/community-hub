-- Allow custom role names on server_members.
ALTER TABLE public.server_members
DROP CONSTRAINT IF EXISTS server_members_role_check;

-- Per-server role catalog.
CREATE TABLE IF NOT EXISTS public.server_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#9CA3AF',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_server_roles_server_name_unique
ON public.server_roles (server_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_server_roles_server_position
ON public.server_roles (server_id, position DESC, created_at ASC);

ALTER TABLE public.server_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view server roles"
ON public.server_roles
FOR SELECT
USING (public.is_server_member(auth.uid(), server_id));

CREATE POLICY "Owners can create server roles"
ON public.server_roles
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = server_roles.server_id
      AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can update server roles"
ON public.server_roles
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = server_roles.server_id
      AND s.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = server_roles.server_id
      AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can delete server roles"
ON public.server_roles
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.servers s
    WHERE s.id = server_roles.server_id
      AND s.owner_id = auth.uid()
  )
);

-- Seed initial roles from existing memberships.
INSERT INTO public.server_roles (server_id, name, color, position)
SELECT DISTINCT sm.server_id, sm.role, '#9CA3AF', 0
FROM public.server_members sm
WHERE sm.role <> 'owner'
  AND NOT EXISTS (
    SELECT 1
    FROM public.server_roles sr
    WHERE sr.server_id = sm.server_id
      AND lower(sr.name) = lower(sm.role)
  );

-- Ensure at least one assignable role exists per server.
INSERT INTO public.server_roles (server_id, name, color, position)
SELECT s.id, 'member', '#9CA3AF', 0
FROM public.servers s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.server_roles sr
  WHERE sr.server_id = s.id
);
