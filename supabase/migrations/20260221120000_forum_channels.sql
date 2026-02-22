-- Add forum-style channels alongside text and voice channel types.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'channels_type_check'
      AND conrelid = 'public.channels'::regclass
  ) THEN
    ALTER TABLE public.channels DROP CONSTRAINT channels_type_check;
  END IF;
END $$;

ALTER TABLE public.channels
ADD CONSTRAINT channels_type_check
CHECK (type IN ('text', 'forum', 'voice'));
