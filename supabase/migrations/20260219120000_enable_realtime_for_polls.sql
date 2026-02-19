ALTER TABLE public.poll_votes REPLICA IDENTITY FULL;

-- This command assumes the publication is named supabase_realtime, which is the default for Supabase projects.
-- If the publication has a different name, this will need to be adjusted.
ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_votes;
