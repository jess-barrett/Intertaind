-- RLS-safe multi-row operations for the social graph.
--
-- Some flows touch rows the caller doesn't directly own (e.g. accepting a
-- follow request inserts a follows row where follower_id = requester, not
-- the caller). Instead of loosening RLS, we expose the operations as
-- SECURITY DEFINER functions that verify the caller's identity internally
-- and then do the writes with elevated privileges.

-- accept_follow_request(requester_id):
--   Caller must be the target of the request. Deletes the request row,
--   inserts a follows row, and inserts a 'follow_accepted' notification
--   for the requester.
CREATE OR REPLACE FUNCTION public.accept_follow_request(p_requester_id uuid)
RETURNS void AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Only act if a matching request exists for this caller as target
  IF NOT EXISTS (
    SELECT 1 FROM public.follow_requests
    WHERE requester_id = p_requester_id AND target_id = v_caller
  ) THEN
    RAISE EXCEPTION 'no pending follow request';
  END IF;

  DELETE FROM public.follow_requests
   WHERE requester_id = p_requester_id AND target_id = v_caller;

  INSERT INTO public.follows (follower_id, following_id)
  VALUES (p_requester_id, v_caller)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.notifications (user_id, type, actor_id)
  VALUES (p_requester_id, 'follow_accepted', v_caller);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.accept_follow_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_follow_request(uuid) TO authenticated;

-- block_user(target_id):
--   Inserts the block, and tears down any follows / follow_requests in
--   both directions between caller and target. Needs SECURITY DEFINER so
--   we can delete the "other direction" rows that the follow-delete RLS
--   would otherwise reject.
CREATE OR REPLACE FUNCTION public.block_user(p_target_id uuid)
RETURNS void AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF v_caller = p_target_id THEN
    RAISE EXCEPTION 'cannot block yourself';
  END IF;

  INSERT INTO public.blocks (blocker_id, blocked_id)
  VALUES (v_caller, p_target_id)
  ON CONFLICT DO NOTHING;

  DELETE FROM public.follows
   WHERE (follower_id = v_caller AND following_id = p_target_id)
      OR (follower_id = p_target_id AND following_id = v_caller);

  DELETE FROM public.follow_requests
   WHERE (requester_id = v_caller AND target_id = p_target_id)
      OR (requester_id = p_target_id AND target_id = v_caller);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.block_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;
