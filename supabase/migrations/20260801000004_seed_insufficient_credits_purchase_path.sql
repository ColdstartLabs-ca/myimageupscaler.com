-- Approved TASK-16 arms. They remain inactive until the TASK-15 reward-health gate
-- and production checkout audit have been signed off by the owner.
INSERT INTO public.experiment_arms (experiment_key, context_key, arm_key, arm_config, is_active)
VALUES
  (
    'insufficient_credits_purchase_path',
    'global',
    'current_modal_control',
    '{"path":"current_modal","seeAllOptions":true}',
    false
  ),
  (
    'insufficient_credits_purchase_path',
    'global',
    'sufficient_pack_focus',
    '{"path":"sufficient_pack_focus","recommendation":"smallest_sufficient_pack","seeAllOptions":true}',
    false
  ),
  (
    'insufficient_credits_purchase_path',
    'global',
    'direct_sufficient_pack',
    '{"path":"direct_checkout","recommendation":"smallest_sufficient_pack","seeAllOptions":true}',
    false
  )
ON CONFLICT (experiment_key, context_key, arm_key)
DO UPDATE SET
  arm_config = EXCLUDED.arm_config,
  is_active = public.experiment_arms.is_active,
  updated_at = now();
