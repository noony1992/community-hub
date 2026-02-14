
-- Create storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true);

-- Storage policies for chat attachments
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-attachments');

CREATE POLICY "Users can delete own attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add attachment columns to messages table
ALTER TABLE public.messages
ADD COLUMN attachment_url TEXT DEFAULT NULL,
ADD COLUMN attachment_name TEXT DEFAULT NULL,
ADD COLUMN attachment_type TEXT DEFAULT NULL;

-- Create reactions table
CREATE TABLE public.reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view reactions"
ON public.reactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN channels c ON c.id = m.channel_id
    WHERE m.id = reactions.message_id
    AND is_server_member(auth.uid(), c.server_id)
  )
);

CREATE POLICY "Members can add reactions"
ON public.reactions FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM messages m
    JOIN channels c ON c.id = m.channel_id
    WHERE m.id = reactions.message_id
    AND is_server_member(auth.uid(), c.server_id)
  )
);

CREATE POLICY "Users can remove own reactions"
ON public.reactions FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
