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
      AND selected_team = ('Oregon State')
      AND is_lock = FALSE;


## Manually update leaderboard

