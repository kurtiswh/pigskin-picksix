-- Add payment_status column to users table for manual status management
ALTER TABLE public.users 
ADD COLUMN payment_status TEXT DEFAULT 'Manual Registration' 
CHECK (payment_status IN ('Paid', 'NotPaid', 'Pending', 'No Payment', 'Manual Registration'));

-- Update existing users with LeagueSafe payments to have proper status
UPDATE public.users 
SET payment_status = COALESCE(
  (SELECT status FROM public.leaguesafe_payments WHERE user_id = users.id LIMIT 1),
  'Manual Registration'
);

-- Create index for payment status queries
CREATE INDEX idx_users_payment_status ON public.users(payment_status);

-- Update existing 'No Payment' statuses to 'Manual Registration' for clarity
UPDATE public.users 
SET payment_status = 'Manual Registration' 
WHERE payment_status = 'No Payment' OR payment_status IS NULL;