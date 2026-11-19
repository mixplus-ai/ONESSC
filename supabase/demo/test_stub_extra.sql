-- local test only: extra auth columns that a real Supabase project has
alter table auth.users add column if not exists instance_id uuid, add column if not exists aud text, add column if not exists role text,
  add column if not exists encrypted_password text, add column if not exists email_confirmed_at timestamptz,
  add column if not exists raw_app_meta_data jsonb, add column if not exists created_at timestamptz, add column if not exists updated_at timestamptz,
  add column if not exists confirmation_token text, add column if not exists recovery_token text,
  add column if not exists email_change_token_new text, add column if not exists email_change text;
create table if not exists auth.identities (id uuid primary key, user_id uuid, provider_id text, identity_data jsonb, provider text,
  last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
