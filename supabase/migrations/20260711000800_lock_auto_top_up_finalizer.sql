REVOKE ALL ON FUNCTION public.finalize_auto_top_up_attempt(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_auto_top_up_attempt(uuid, text, integer)
  TO service_role;
