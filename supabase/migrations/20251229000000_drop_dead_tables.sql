-- ============================================================================
-- Drop Dead Tables Migration
-- ============================================================================
-- Removes unused products and prices tables that were created as optional
-- Stripe sync caches but never implemented.
--
-- Context: Pricing data uses hardcoded subscription.config.ts instead.
-- ============================================================================

-- Drop prices first (has FK to products)
DROP TABLE IF EXISTS public.prices CASCADE;

-- Drop products
DROP TABLE IF EXISTS public.products CASCADE;

-- Comment for future reference
COMMENT ON TABLE public.processing_jobs IS 'Created for background image processing jobs - currently unused but retained for potential future use with server-side processing';
