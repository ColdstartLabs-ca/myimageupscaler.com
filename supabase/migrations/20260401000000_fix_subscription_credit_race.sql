-- Fix race condition in add_subscription_credits
-- Ensures subscription credit grants are idempotent per reference_id even
-- when multiple webhook handlers race to allocate the same invoice credits.

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_subscription_ref_unique
ON public.credit_transactions(reference_id)
WHERE reference_id IS NOT NULL
  AND amount > 0
  AND type = 'subscription';

COMMENT ON INDEX idx_credit_transactions_subscription_ref_unique IS
'Prevents duplicate positive subscription credit grants for the same reference_id while allowing other transaction types and negative audit rows to reuse a reference.';

CREATE OR REPLACE FUNCTION public.add_subscription_credits(
    target_user_id UUID,
    amount INTEGER,
    ref_id TEXT DEFAULT NULL,
    description TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_balance INTEGER;
    new_balance INTEGER;
BEGIN
    IF amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive: %', amount;
    END IF;

    PERFORM set_config('app.trusted_credit_operation', 'true', true);

    -- Serialize grants for the same user so the dedup check and balance update
    -- happen against a stable view of the account.
    SELECT subscription_credits_balance
    INTO current_balance
    FROM public.profiles
    WHERE id = target_user_id
    FOR UPDATE;

    IF current_balance IS NULL THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
    END IF;

    IF ref_id IS NOT NULL THEN
        PERFORM 1
        FROM public.credit_transactions
        WHERE user_id = target_user_id
          AND reference_id = ref_id
          AND type = 'subscription'
          AND credit_transactions.amount > 0
        LIMIT 1;

        IF FOUND THEN
            RETURN current_balance;
        END IF;
    END IF;

    BEGIN
        UPDATE public.profiles
        SET subscription_credits_balance = subscription_credits_balance + amount
        WHERE id = target_user_id
        RETURNING subscription_credits_balance INTO new_balance;

        INSERT INTO public.credit_transactions (
            user_id,
            amount,
            type,
            reference_id,
            description
        )
        VALUES (
            target_user_id,
            amount,
            'subscription',
            ref_id,
            description
        );
    EXCEPTION
        WHEN unique_violation THEN
            RETURN current_balance;
    END;

    RETURN new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.add_subscription_credits(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_subscription_credits(UUID, INTEGER, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.add_subscription_credits(UUID, INTEGER, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.add_subscription_credits IS
'Adds subscription credits atomically and idempotently. Duplicate positive grants for the same reference_id return the current balance instead of double-crediting.';
