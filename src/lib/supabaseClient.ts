import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `[Supabase] Missing ${name}. Set it in Netlify environment variables and local .env before using Supabase features.`,
    );
  }

  return value;
}

export const supabase = createClient(
  requireEnv("VITE_SUPABASE_URL", supabaseUrl),
  requireEnv("VITE_SUPABASE_ANON_KEY", supabaseAnonKey),
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
