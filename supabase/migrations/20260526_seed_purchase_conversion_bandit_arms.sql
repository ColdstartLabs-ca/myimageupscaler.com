INSERT INTO experiment_arms (experiment_key, context_key, arm_key, arm_config, is_active)
VALUES
  (
    'purchase_modal_default_selection',
    'global',
    'current_modal_control',
    '{"description":"Current purchase modal behavior"}',
    true
  ),
  (
    'purchase_modal_default_selection',
    'global',
    'starter_anchor',
    '{"defaultType":"credit_pack","defaultKey":"small","layout":"credits_first","copy":"starter_anchor"}',
    true
  ),
  (
    'purchase_modal_default_selection',
    'global',
    'compact_credit_picker',
    '{"defaultType":"credit_pack","visiblePacks":["small","medium"],"hideSubscriptionsInitially":true}',
    true
  ),
  (
    'model_gate_purchase_path',
    'global',
    'direct_small_pack_control',
    '{"path":"direct_checkout","defaultKey":"small"}',
    true
  ),
  (
    'model_gate_purchase_path',
    'global',
    'compact_credit_picker',
    '{"path":"compact_picker","visiblePacks":["small","medium"]}',
    true
  ),
  (
    'model_gate_purchase_path',
    'global',
    'usage_based_pack',
    '{"path":"direct_checkout","selection":"model_cost_based"}',
    true
  ),
  (
    'model_gate_purchase_path',
    'global',
    'subscription_unlock',
    '{"path":"direct_checkout","defaultType":"subscription","defaultKey":"starter"}',
    true
  )
ON CONFLICT (experiment_key, context_key, arm_key)
DO UPDATE SET
  arm_config = EXCLUDED.arm_config,
  is_active = true,
  updated_at = now();
