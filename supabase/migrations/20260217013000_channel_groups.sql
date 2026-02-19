-- Channel groups (Discord-like categories)
CREATE TABLE public.channel_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.channel_groups ENABLE ROW LEVEL SECURITY;

-- Members can read groups in servers they belong to.
CREATE POLICY "Members can view channel groups"
ON public.channel_groups FOR SELECT
USING (public.is_server_member(auth.uid(), server_id));

-- Owners/admins can manage groups.
CREATE POLICY "Owners and admins can create channel groups"
ON public.channel_groups FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.server_members sm
    WHERE sm.server_id = channel_groups.server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Owners and admins can update channel groups"
ON public.channel_groups FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.server_members sm
    WHERE sm.server_id = channel_groups.server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.server_members sm
    WHERE sm.server_id = channel_groups.server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Owners and admins can delete channel groups"
ON public.channel_groups FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.server_members sm
    WHERE sm.server_id = channel_groups.server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
  )
);

-- Add group assignment for channels.
ALTER TABLE public.channels
ADD COLUMN group_id UUID REFERENCES public.channel_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_channels_group_id ON public.channels(group_id);
CREATE INDEX idx_channel_groups_server_position ON public.channel_groups(server_id, position);

-- Owners/admins can update channels (for assigning/reassigning groups).
CREATE POLICY "Owners and admins can update channels"
ON public.channels FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.server_members sm
    WHERE sm.server_id = channels.server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.server_members sm
    WHERE sm.server_id = channels.server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
  )
);
