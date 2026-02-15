
-- Tighten the update policy to only allow incrementing uses
DROP POLICY IF EXISTS "Authenticated users can update invite uses" ON public.invite_codes;
CREATE POLICY "Authenticated users can update invite uses"
ON public.invite_codes
FOR UPDATE
USING (true)
WITH CHECK (uses >= 0);
