-- Migration 251: move the 78 picks misfiled as Week 14 to their real weeks
--
-- Data fix for the bug closed by the pick-page change (PR #3) and migration 250.
-- 13 sheets from 2026 Weeks 2-5 were saved with week = 14: 12 anonymous entries
-- (72 picks) and 1 account sheet (6 picks, Brooke Robertson, Week 4). Each pick is
-- moved to its game's week. Nothing else on the rows changes: selections, locks,
-- submitted flags, visibility, results and points stay as they are.
--
-- Checked before the move (Oct 6-7, 2026):
--   * these are the only picks in any season whose week differs from their game's;
--   * none of the 13 players has another sheet for the real week, except Stuart
--     Rowlan's single unsubmitted account pick in Week 5 (Alabama, lock), which is
--     kept as is. Unsubmitted account picks never count, and only a submitted,
--     shown account pick displaces an anonymous entry, so his anonymous entry is
--     the one scored, as in the normal workflow.
--
-- The IDs are listed so the move is exact and auditable; the block aborts and
-- changes nothing unless exactly 72 + 6 rows still sit in Week 14.
-- Leaderboards are views over these tables, so they reflect the move at once;
-- re-running scoring is a separate step.
--
-- Applied to production Oct 7, 2026, after migration 250 (also applied that day).
-- Verified after: no pick in any season sits outside its game's week, Week 14 is
-- empty, and each of the 13 entries is 6 picks + 1 lock in its real week.

DO $$
DECLARE
  n_anon integer;
  n_acct integer;
BEGIN
  UPDATE public.anonymous_picks a
     SET week = g.week, season = g.season
    FROM public.games g
   WHERE g.id = a.game_id
     AND a.season = 2026 AND a.week = 14
     AND a.id IN (
    -- Week 2
    '0b771d95-355d-47f3-8897-67147924166b',
    '0eeaa841-275c-4b89-ba1c-306f44d13c2a',
    '3f6625a3-8916-49bd-ac4a-5756aece9daa',
    '4e93ed5f-7e4a-445c-a013-1cf6297f7107',
    '5d4f7e38-3935-46c9-b4a9-3d8e11b51dce',
    '7a6d2fe3-4998-4c4a-a46d-d6c2451e6a77',
    '7ebdac64-700e-45f5-95bc-caf727507c59',
    '8c83d82b-c997-43c0-bd2c-ad1c116bbeab',
    '8e3151d1-26f7-4098-828e-d2852973b94f',
    'b91353a8-fd03-423c-88ee-a4ea1d698604',
    'c1f02c18-be1a-4e9f-8819-8e49a3a35081',
    'f0bb8119-19a2-4eb8-ba3a-dfa484951797',
    -- Week 3
    '09f55762-a570-45db-ac6a-79772c743c3b',
    '0c2ea951-2391-473b-badf-e8502d39df0e',
    '153cdf9a-4b3d-48cf-b00a-2b1723f0fbaa',
    '1ecee8ce-1ba1-4bc9-99d1-1a7335ad7abb',
    '1f096507-3fc8-4e83-9fa7-86938b27c622',
    '227c45b9-e48f-41dd-92c1-37541fd2afef',
    '28c81ba3-877f-43c7-9970-14adf506095c',
    '4a7ac78a-bf16-4d1c-98a0-02ccd9f4eb6b',
    '57b68d4f-34ed-4940-a79a-ca43fc7b62fb',
    '5fa3bb58-260d-4b30-a524-72e46b9e0d97',
    '7d63e4f6-441c-48ee-8920-ced58dd207a9',
    '7ea8fbe6-1ac5-4039-adab-4c1593f043fd',
    '8b204f54-959d-4b33-b507-630dfd18e4bc',
    '8b2a15ab-8e65-48b1-9b9c-e53a00ebdb78',
    '8e1d2c8d-4483-4c08-bfc8-d0d61e54dbe3',
    '900f7d27-2660-4ee1-998e-7dea69c6abe0',
    '9b385732-7276-43cb-a3db-95abe881b8b4',
    'a39d3e6a-5d8b-4154-9528-a441a951b90e',
    'b26e5601-33a7-4480-9750-a4deeee0be98',
    'b6dce804-64bf-4d80-a889-b747343c574f',
    'b9ce5e81-0d72-4225-81be-39c00b938fde',
    'd325e4aa-efe8-4b3f-b86c-210daba6ea8a',
    'd4c6d323-4146-40ac-817f-ea1891cfa343',
    'd693a413-b3c4-4370-9953-3b39381096bf',
    'daf85d05-8abd-4676-aa59-5c415e375d47',
    'e19af6a8-a37e-443f-91b5-26fef8a0185a',
    'ed65cbd0-0670-4a20-84db-3eb3c660be47',
    'f5fac1dc-c585-4a65-9eb8-d3a826fbf998',
    'f8af88be-01f1-4b70-b786-3007f49b3e1f',
    'fcf545b3-55f2-440f-9d12-20be28f6c017',
    -- Week 4
    '028fe08c-fdef-4471-bef1-8a0d0fcf9cd4',
    '1185d211-9e29-414d-b828-721cdc795126',
    '1d20572a-19bd-4eab-8c05-e88a791e978b',
    '1d52ddcd-463b-4f9e-ba95-72e1ce61045f',
    '3b4bf016-ac07-430b-b619-49485669e9fa',
    '3d7d076b-06d0-41bb-a0ea-4f8c1f7d3775',
    '4d257651-2ed1-4bd5-9f1b-84bb4d7517bf',
    '6b5839b2-134c-4df9-8a16-5f2b5aeffdc1',
    '723a2e27-e462-44de-9f87-dcacfb25d671',
    '7ffc2966-6b99-4836-b313-528ca9756a5f',
    'ba337041-c61e-4b22-8069-9647fcd0b1c3',
    'c82d877e-5ac3-4b8c-8f14-960d6cbeed72',
    -- Week 5
    '161462b1-d572-4db9-8102-1111d6eb62ae',
    '1faf1f80-5e5a-40bc-ab6f-511e7069061d',
    '2259b3ed-9324-474b-9c50-4098ccd8eb72',
    '322d829b-5f02-4eaa-aa73-1dc923afb093',
    '41ffaf3d-a7ce-4bdc-8991-2254e50c32d9',
    '4b92e4a8-d31e-480f-941c-860a0ae9c99c',
    '58e5e07f-fa5b-41b8-b8f7-f08f3b0627cd',
    '59b61b60-56fe-42d4-a421-ad1810823ed8',
    '5b4a0ba4-89f8-432f-98e2-7c3162c5f72b',
    '5f035579-7500-4bc0-947a-cae432c258ec',
    '6ebcfa39-d284-489e-a1c9-72ea60817844',
    '75b09a2e-a6c8-4470-b143-4cd45f13e9b9',
    '97dc7cc9-c427-49f2-b15d-a7e10f13ff76',
    '9d62d28f-3627-420a-b4f7-0399e5d500fe',
    'a98b680d-6b5c-4f0b-a83c-7c086d629aca',
    'b88b584a-c1e8-4728-a581-4aa5b90b3104',
    'e06eec37-ca72-4e35-8827-061b7648c7cb',
    'e1e7143d-f9e9-4ddd-9f6e-c2943400b030'
     );
  GET DIAGNOSTICS n_anon = ROW_COUNT;

  UPDATE public.picks p
     SET week = g.week, season = g.season
    FROM public.games g
   WHERE g.id = p.game_id
     AND p.season = 2026 AND p.week = 14
     AND p.id IN (
    -- Week 4, Brooke Robertson
    '2c5b10ad-c8ef-4c2a-9dc2-db8c2190bba1',
    '4cbc2593-3726-436c-be33-74f64001b72f',
    '74e6d345-af11-4e3d-9763-835b55eb7449',
    '77e546c9-d743-45c4-ba4d-5849e791cdb5',
    '9405731a-b574-43f3-8428-c0352563dda6',
    'dbfe2c31-5b6b-4059-b3e0-b4d54fc18f72'
     );
  GET DIAGNOSTICS n_acct = ROW_COUNT;

  IF n_anon <> 72 OR n_acct <> 6 THEN
    RAISE EXCEPTION 'Expected 72 anonymous + 6 account picks in Week 14, found % + %; nothing moved', n_anon, n_acct;
  END IF;
END $$;
