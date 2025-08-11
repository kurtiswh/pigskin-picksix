-- Create magic_link_tokens table for custom magic link authentication
CREATE TABLE IF NOT EXISTS magic_link_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_token ON magic_link_tokens(token);
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_email ON magic_link_tokens(email);
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_expires_at ON magic_link_tokens(expires_at);

-- Enable RLS
ALTER TABLE magic_link_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies - only allow service role to access (for security)
CREATE POLICY "Service role can manage magic link tokens" ON magic_link_tokens
    FOR ALL USING (auth.role() = 'service_role');