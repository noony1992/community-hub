-- Allow users to update their own rule acceptance row.
-- This supports upsert/update paths safely if used by clients.

DROP POLICY IF EXISTS "Users can update own rule acceptances" ON public.server_rule_acceptances;
CREATE POLICY "Users can update own rule acceptances"
ON public.server_rule_acceptances
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
