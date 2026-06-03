import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// Browser/client-component Supabase client. Lives in its own module so that
// client components never import `lib/supabase.ts` (which pulls in
// `next/headers` and would break the client bundle).
export const createClient = () => createClientComponentClient()
