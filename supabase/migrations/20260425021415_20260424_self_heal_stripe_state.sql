CREATE OR REPLACE FUNCTION public.self_heal_stripe_state(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.trusted_credit_operation', 'true', true);

  DELETE FROM public.subscriptions
  WHERE user_id = p_user_id;

  UPDATE public.profiles
  SET stripe_customer_id           = NULL,
      subscription_status          = NULL,
      subscription_tier            = NULL,
      subscription_credits_balance = 0
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.self_heal_stripe_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_heal_stripe_state(uuid) TO service_role;;
