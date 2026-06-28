-- Default David Bureš outreach to English (was incorrectly set to CZ)
UPDATE abc_profiles
SET
  outreach_language = 'EN',
  user_language = 'EN'
WHERE outreach_language = 'CZ'
  AND (
    full_name ILIKE '%David%Bure%'
    OR user_name ILIKE '%David%Bure%'
  );
