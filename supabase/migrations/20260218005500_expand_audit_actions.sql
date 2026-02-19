ALTER TABLE public.moderation_audit_logs
DROP CONSTRAINT IF EXISTS moderation_audit_logs_action_check;

ALTER TABLE public.moderation_audit_logs
ADD CONSTRAINT moderation_audit_logs_action_check
CHECK (
  action IN (
    'ban_user',
    'unban_user',
    'edit_member_role',
    'delete_channel',
    'edit_ban_length',
    'timeout_user',
    'clear_timeout',
    'mute_user',
    'unmute_user'
  )
);
