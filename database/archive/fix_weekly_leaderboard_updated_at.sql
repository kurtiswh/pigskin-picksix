-- Fix missing updated_at column in weekly_leaderboard table
-- This addresses the error: column "updated_at" of relation "weekly_leaderboard" does not exist

DO $$
BEGIN
    -- Check if weekly_leaderboard table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'weekly_leaderboard' AND table_schema = 'public') THEN
        
        -- Check if updated_at column exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'weekly_leaderboard' 
            AND column_name = 'updated_at' 
            AND table_schema = 'public'
        ) THEN
            -- Add the missing updated_at column
            ALTER TABLE public.weekly_leaderboard 
            ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
            
            RAISE NOTICE '✅ Added updated_at column to weekly_leaderboard table';
        ELSE
            RAISE NOTICE 'ℹ️  updated_at column already exists in weekly_leaderboard table';
        END IF;
        
        -- Check if the trigger exists and create it if missing
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger 
            WHERE tgname = 'update_weekly_leaderboard_updated_at' 
            AND tgrelid = 'public.weekly_leaderboard'::regclass
        ) THEN
            -- Create the trigger for updated_at
            CREATE TRIGGER update_weekly_leaderboard_updated_at 
                BEFORE UPDATE ON public.weekly_leaderboard
                FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
            
            RAISE NOTICE '✅ Created update_weekly_leaderboard_updated_at trigger';
        ELSE
            RAISE NOTICE 'ℹ️  update_weekly_leaderboard_updated_at trigger already exists';
        END IF;
        
    ELSE
        RAISE NOTICE '❌ weekly_leaderboard table does not exist';
    END IF;
    
    -- Check if season_leaderboard table has the same issue
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'season_leaderboard' AND table_schema = 'public') THEN
        
        -- Check if updated_at column exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'season_leaderboard' 
            AND column_name = 'updated_at' 
            AND table_schema = 'public'
        ) THEN
            -- Add the missing updated_at column
            ALTER TABLE public.season_leaderboard 
            ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
            
            RAISE NOTICE '✅ Added updated_at column to season_leaderboard table';
        ELSE
            RAISE NOTICE 'ℹ️  updated_at column already exists in season_leaderboard table';
        END IF;
        
        -- Check if the trigger exists and create it if missing
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger 
            WHERE tgname = 'update_season_leaderboard_updated_at' 
            AND tgrelid = 'public.season_leaderboard'::regclass
        ) THEN
            -- Create the trigger for updated_at
            CREATE TRIGGER update_season_leaderboard_updated_at 
                BEFORE UPDATE ON public.season_leaderboard
                FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
            
            RAISE NOTICE '✅ Created update_season_leaderboard_updated_at trigger';
        ELSE
            RAISE NOTICE 'ℹ️  update_season_leaderboard_updated_at trigger already exists';
        END IF;
        
    END IF;
    
    -- Also check if the update_updated_at_column function exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.routines 
        WHERE routine_name = 'update_updated_at_column' 
        AND routine_schema = 'public'
    ) THEN
        -- Create the function if it doesn't exist
        CREATE OR REPLACE FUNCTION public.update_updated_at_column()
        RETURNS TRIGGER AS $func$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;
        
        RAISE NOTICE '✅ Created update_updated_at_column function';
    ELSE
        RAISE NOTICE 'ℹ️  update_updated_at_column function already exists';
    END IF;
    
END $$;