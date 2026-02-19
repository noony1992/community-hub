-- Server events calendar with RSVPs.

CREATE TABLE IF NOT EXISTS public.server_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  description TEXT,
  location TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS public.event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.server_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('going', 'maybe', 'not_going')),
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_server_events_server_start
ON public.server_events(server_id, starts_at ASC);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_event_status
ON public.event_rsvps(event_id, status);

ALTER TABLE public.server_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view server events"
ON public.server_events
FOR SELECT
USING (public.is_server_member(auth.uid(), server_id));

CREATE POLICY "Members can create server events"
ON public.server_events
FOR INSERT
WITH CHECK (
  public.is_server_member(auth.uid(), server_id)
  AND auth.uid() = created_by
);

CREATE POLICY "Creators or managers can update events"
ON public.server_events
FOR UPDATE
USING (
  auth.uid() = created_by
  OR public.has_server_permission(server_id, auth.uid(), 'manage_channels')
)
WITH CHECK (
  auth.uid() = created_by
  OR public.has_server_permission(server_id, auth.uid(), 'manage_channels')
);

CREATE POLICY "Creators or managers can delete events"
ON public.server_events
FOR DELETE
USING (
  auth.uid() = created_by
  OR public.has_server_permission(server_id, auth.uid(), 'manage_channels')
);

CREATE POLICY "Members can view RSVPs for server events"
ON public.event_rsvps
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.server_events se
    WHERE se.id = event_rsvps.event_id
      AND public.is_server_member(auth.uid(), se.server_id)
  )
);

CREATE POLICY "Members can create own RSVPs"
ON public.event_rsvps
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.server_events se
    WHERE se.id = event_rsvps.event_id
      AND public.is_server_member(auth.uid(), se.server_id)
  )
);

CREATE POLICY "Members can update own RSVPs"
ON public.event_rsvps
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.server_events se
    WHERE se.id = event_rsvps.event_id
      AND public.is_server_member(auth.uid(), se.server_id)
  )
);

CREATE POLICY "Members can delete own RSVPs"
ON public.event_rsvps
FOR DELETE
USING (auth.uid() = user_id);
