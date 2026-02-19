-- Per-user read markers per channel for unread badges and first-unread jumps.
CREATE TABLE IF NOT EXISTS public.channel_reads (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_reads_user_channel
ON public.channel_reads(user_id, channel_id);

ALTER TABLE public.channel_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own channel reads"
ON public.channel_reads
FOR SELECT
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = channel_reads.channel_id
      AND public.is_server_member(auth.uid(), c.server_id)
  )
);

CREATE POLICY "Users can insert own channel reads"
ON public.channel_reads
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = channel_reads.channel_id
      AND public.is_server_member(auth.uid(), c.server_id)
  )
);

CREATE POLICY "Users can update own channel reads"
ON public.channel_reads
FOR UPDATE
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = channel_reads.channel_id
      AND public.is_server_member(auth.uid(), c.server_id)
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = channel_reads.channel_id
      AND public.is_server_member(auth.uid(), c.server_id)
  )
);

CREATE POLICY "Users can delete own channel reads"
ON public.channel_reads
FOR DELETE
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_channel_reads_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_channel_reads_updated_at ON public.channel_reads;
CREATE TRIGGER update_channel_reads_updated_at
  BEFORE UPDATE ON public.channel_reads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_channel_reads_updated_at();
