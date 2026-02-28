type SupabasePublicConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "Missing Supabase URL. Set NEXT_PUBLIC_SUPABASE_URL (recommended) or SUPABASE_URL in frontend/.env.local."
    );
  }

  if (!supabaseAnonKey) {
    throw new Error(
      "Missing Supabase anon key. Set NEXT_PUBLIC_SUPABASE_ANON_KEY in frontend/.env.local."
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}
