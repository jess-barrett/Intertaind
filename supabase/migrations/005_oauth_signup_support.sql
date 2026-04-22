-- Make the profile auto-creation trigger tolerant of sign-ups that don't
-- have a username in user metadata (e.g. Google OAuth). Those users get an
-- auth.users row only; the app sends them to /auth/setup-username to
-- complete their profile.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create a profile row when a username was provided via the signup
  -- options.data. OAuth users come through without one; /auth/setup-username
  -- handles them afterward.
  IF NEW.raw_user_meta_data ? 'username'
     AND NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), '') IS NOT NULL
  THEN
    INSERT INTO public.profiles (id, username)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'username')
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
