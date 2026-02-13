
-- Allow users to update their own messages
CREATE POLICY "Users can update own messages"
ON public.messages
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own messages
CREATE POLICY "Users can delete own messages"
ON public.messages
FOR DELETE
USING (auth.uid() = user_id);

-- Add edited_at column to messages
ALTER TABLE public.messages ADD COLUMN edited_at timestamp with time zone DEFAULT NULL;
