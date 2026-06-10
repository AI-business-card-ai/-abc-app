-- Extend default research preferences with 4 new topics
ALTER TABLE public.abc_profiles
ALTER COLUMN research_preferences SET DEFAULT ARRAY[
  'revenue', 'location', 'news', 'linkedin', 'reputation', 'events',
  'competitors', 'technology', 'decision_maker', 'pain_points'
];
