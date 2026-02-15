-- Image generation usage tracking
-- Adds dedicated table and RPCs for enforcing monthly limits on Gemini image renders
--
-- NOTE: This migration is a single SQL statement (DO block) to avoid issues
-- with some migration runners that execute statements via prepared queries.

DO $migration$
BEGIN
  -- -----------------------------------------------------------------------------
  -- Table: image_generations
  -- Purpose: Track per-user image generations for quota enforcement
  -- -----------------------------------------------------------------------------
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS public.image_generations (
      id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
      user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
      youtube_id text NOT NULL,
      video_id uuid REFERENCES public.video_analyses(id) ON DELETE SET NULL,
      counted_toward_limit boolean DEFAULT true NOT NULL,
      subscription_tier text,
      created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
    );
  $sql$;

  EXECUTE $sql$
    COMMENT ON TABLE public.image_generations IS 'Tracks Gemini image generations for monthly quota enforcement';
  $sql$;

  EXECUTE $sql$
    COMMENT ON COLUMN public.image_generations.counted_toward_limit IS 'Whether this generation consumed monthly quota';
  $sql$;

  EXECUTE $sql$
    CREATE INDEX IF NOT EXISTS idx_image_generations_user_id
      ON public.image_generations (user_id);
  $sql$;

  EXECUTE $sql$
    CREATE INDEX IF NOT EXISTS idx_image_generations_youtube_id
      ON public.image_generations (youtube_id);
  $sql$;

  EXECUTE $sql$
    CREATE INDEX IF NOT EXISTS idx_image_generations_created_at
      ON public.image_generations (created_at DESC);
  $sql$;

  EXECUTE $sql$
    CREATE INDEX IF NOT EXISTS idx_image_generations_user_created
      ON public.image_generations (user_id, created_at DESC);
  $sql$;

  -- -----------------------------------------------------------------------------
  -- Function: consume_image_credit_atomically
  -- Purpose: Atomically check monthly allowance and record a generation
  -- Notes: Image generations do NOT consume top-up credits; only base limits apply.
  -- -----------------------------------------------------------------------------
  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.consume_image_credit_atomically(
      p_user_id uuid,
      p_youtube_id text,
      p_subscription_tier text,
      p_base_limit integer,
      p_period_start timestamptz,
      p_period_end timestamptz,
      p_video_id uuid DEFAULT NULL,
      p_counted boolean DEFAULT true
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    DECLARE
      v_counted_usage integer;
      v_base_remaining integer;
      v_generation_id uuid;
    BEGIN
      -- Lock the profile row to avoid race conditions
      PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'allowed', false,
          'reason', 'NO_SUBSCRIPTION',
          'error', 'Profile not found'
        );
      END IF;

      -- Count counted generations within current window
      SELECT COUNT(*) INTO v_counted_usage
      FROM public.image_generations
      WHERE user_id = p_user_id
        AND created_at >= p_period_start
        AND created_at < p_period_end
        AND counted_toward_limit = true;

      v_base_remaining := GREATEST(0, p_base_limit - v_counted_usage);

      IF p_counted AND v_base_remaining <= 0 THEN
        RETURN jsonb_build_object(
          'allowed', false,
          'reason', 'LIMIT_REACHED',
          'base_remaining', v_base_remaining
        );
      END IF;

      INSERT INTO public.image_generations (
        user_id,
        youtube_id,
        video_id,
        counted_toward_limit,
        subscription_tier
      ) VALUES (
        p_user_id,
        p_youtube_id,
        p_video_id,
        p_counted,
        p_subscription_tier
      )
      RETURNING id INTO v_generation_id;

      RETURN jsonb_build_object(
        'allowed', true,
        'reason', 'OK',
        'generation_id', v_generation_id,
        'base_remaining', CASE
          WHEN p_counted THEN GREATEST(0, v_base_remaining - 1)
          ELSE v_base_remaining
        END
      );
    END;
    $func$;
  $sql$;

  EXECUTE $sql$
    COMMENT ON FUNCTION public.consume_image_credit_atomically(
      uuid, text, text, integer, timestamptz, timestamptz, uuid, boolean
    ) IS
      'Atomically checks image quota and records a generation without consuming top-up credits.';
  $sql$;

  EXECUTE $sql$
    GRANT EXECUTE ON FUNCTION public.consume_image_credit_atomically(
      uuid, text, text, integer, timestamptz, timestamptz, uuid, boolean
    ) TO authenticated, service_role;
  $sql$;

  -- -----------------------------------------------------------------------------
  -- Function: check_image_generation_allowed
  -- Purpose: Read-only preflight check for image quota
  -- -----------------------------------------------------------------------------
  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.check_image_generation_allowed(
      p_user_id uuid,
      p_base_limit integer,
      p_period_start timestamptz,
      p_period_end timestamptz
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    DECLARE
      v_counted_usage integer;
      v_base_remaining integer;
    BEGIN
      SELECT COUNT(*) INTO v_counted_usage
      FROM public.image_generations
      WHERE user_id = p_user_id
        AND created_at >= p_period_start
        AND created_at < p_period_end
        AND counted_toward_limit = true;

      v_base_remaining := GREATEST(0, p_base_limit - v_counted_usage);

      RETURN jsonb_build_object(
        'allowed', v_base_remaining > 0,
        'reason', CASE WHEN v_base_remaining > 0 THEN 'OK' ELSE 'LIMIT_REACHED' END,
        'base_remaining', v_base_remaining
      );
    END;
    $func$;
  $sql$;

  EXECUTE $sql$
    COMMENT ON FUNCTION public.check_image_generation_allowed(
      uuid, integer, timestamptz, timestamptz
    ) IS
      'Read-only quota check for image generations within a billing window.';
  $sql$;

  EXECUTE $sql$
    GRANT EXECUTE ON FUNCTION public.check_image_generation_allowed(
      uuid, integer, timestamptz, timestamptz
    ) TO authenticated, service_role;
  $sql$;

  -- -----------------------------------------------------------------------------
  -- Function: get_image_usage_breakdown
  -- Purpose: Aggregate counted generations per tier in a window
  -- -----------------------------------------------------------------------------
  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.get_image_usage_breakdown(
      p_user_id uuid,
      p_start timestamptz,
      p_end timestamptz
    )
    RETURNS TABLE (
      subscription_tier text,
      counted integer
    )
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
      SELECT
        subscription_tier,
        COUNT(*) FILTER (WHERE counted_toward_limit) AS counted
      FROM public.image_generations
      WHERE user_id = p_user_id
        AND created_at >= p_start
        AND created_at < p_end
      GROUP BY subscription_tier;
    $func$;
  $sql$;

  EXECUTE $sql$
    COMMENT ON FUNCTION public.get_image_usage_breakdown(
      uuid, timestamptz, timestamptz
    ) IS
      'Returns counted image generations grouped by tier within a window.';
  $sql$;

  EXECUTE $sql$
    GRANT EXECUTE ON FUNCTION public.get_image_usage_breakdown(
      uuid, timestamptz, timestamptz
    ) TO authenticated, service_role;
  $sql$;

  -- -----------------------------------------------------------------------------
  -- RLS policies
  -- -----------------------------------------------------------------------------
  EXECUTE $sql$
    ALTER TABLE public.image_generations ENABLE ROW LEVEL SECURITY;
  $sql$;

  EXECUTE $sql$
    DO $policies$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'image_generations'
          AND policyname = 'image_generations_select_own'
      ) THEN
        CREATE POLICY image_generations_select_own
          ON public.image_generations
          FOR SELECT
          USING (auth.uid() = user_id);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'image_generations'
          AND policyname = 'image_generations_insert_own'
      ) THEN
        CREATE POLICY image_generations_insert_own
          ON public.image_generations
          FOR INSERT
          WITH CHECK (auth.uid() = user_id);
      END IF;
    END
    $policies$;
  $sql$;
END;
$migration$;

