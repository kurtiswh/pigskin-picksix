# Pigskin Pick Six - COMMON SQL COMMANDS

## Individually update games
UPDATE anonymous_picks
  SET
      result = 'loss'::pick_result,
      points_earned = 0,
      updated_at = CURRENT_TIMESTAMP
  WHERE
      season = 2025
      and week = 1
      AND selected_team = ('Oregon State')
      AND is_lock = TRUE;

UPDATE picks
  SET
      result = 'loss'::pick_result,
      points_earned = 0,
      updated_at = CURRENT_TIMESTAMP
  WHERE
      season = 2025
      and week = 1
      AND selected_team = ('Oregon  State')
      AND is_lock = FALSE;


-- ================================================
-- SECTION 2: Disable only USER triggers
-- ================================================
-- Disable user triggers on picks table
ALTER TABLE picks DISABLE TRIGGER USER;

-- Disable user triggers on anonymous_picks table  
ALTER TABLE anonymous_picks DISABLE TRIGGER USER;

-- Disable user triggers on games table
ALTER TABLE games DISABLE TRIGGER USER;

-- SECTION 3: Clear the game data

UPDATE picks
SET show_on_leaderboard = 'FALSE', 
    admin_note = 'Nebraska locked with Anon picks',
    updated_at = CURRENT_TIMESTAMP
WHERE user_id = 'cd9d6842-d336-49db-9d03-26d9fb77ed95'
    AND game_id = 'e7bc11a3-8922-4264-964b-b1d1b6a4f0fe';

-- ================================================
-- SECTION 4: Re-enable USER triggers
-- ================================================
-- IMPORTANT: Don't forget this step!
ALTER TABLE picks ENABLE TRIGGER USER;
ALTER TABLE anonymous_picks ENABLE TRIGGER USER;
ALTER TABLE games ENABLE TRIGGER USER;

## ADD UNSBUMITTED TO THE LEADERBOARD
-- ================================================
-- SECTION 2: Disable only USER triggers
-- ================================================
-- Disable user triggers on picks table
ALTER TABLE picks DISABLE TRIGGER USER;

-- Disable user triggers on anonymous_picks table  
ALTER TABLE anonymous_picks DISABLE TRIGGER USER;

-- Disable user triggers on games table
ALTER TABLE games DISABLE TRIGGER USER;

-- SECTION 3: Clear the game data

UPDATE picks
SET show_on_leaderboard = 'TRUE', 
    submitted = 'TRUE',
    submitted_at = CURRENT_TIMESTAMP,
    admin_note = 'unsubmmitted changed to submitted per js',
    updated_at = CURRENT_TIMESTAMP
WHERE user_id = '59848eed-e6d8-4a97-85b5-25383c78358a'
    AND week = 2;

-- ================================================
-- SECTION 4: Re-enable USER triggers
-- ================================================
-- IMPORTANT: Don't forget this step!
ALTER TABLE picks ENABLE TRIGGER USER;
ALTER TABLE anonymous_picks ENABLE TRIGGER USER;
ALTER TABLE games ENABLE TRIGGER USER;




## LOOK FOR TRIGGERS ON TABLES
SELECT 
    tgname AS trigger_name,
    tgrelid::regclass AS table_name,
    tgenabled AS is_enabled
FROM pg_trigger 
WHERE tgrelid IN ('picks'::regclass, 'games'::regclass, 'anonymous_picks'::regclass)
    AND NOT tgisinternal  -- Exclude system triggers
    AND tgname NOT LIKE 'RI_ConstraintTrigger%'  -- Exclude foreign key triggers
ORDER BY table_name, trigger_name;


## Manually update leaderboard

