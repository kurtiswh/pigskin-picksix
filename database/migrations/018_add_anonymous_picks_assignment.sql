-- Add columns for anonymous picks assignment and leaderboard management
ALTER TABLE public.anonymous_picks 
ADD COLUMN assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
ADD COLUMN show_on_leaderboard BOOLEAN DEFAULT FALSE;

-- Create index for assigned_user_id for performance
CREATE INDEX idx_anonymous_picks_assigned_user_id ON public.anonymous_picks(assigned_user_id);
CREATE INDEX idx_anonymous_picks_show_on_leaderboard ON public.anonymous_picks(show_on_leaderboard);

-- Update the RLS policy to allow admins to update assignment fields
CREATE POLICY "Allow admins to manage assignments" ON public.anonymous_picks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() 
      AND users.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() 
      AND users.is_admin = true
    )
  );

-- Grant necessary permissions
GRANT UPDATE ON public.anonymous_picks TO authenticated;