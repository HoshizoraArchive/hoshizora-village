import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdminClient(config) {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
