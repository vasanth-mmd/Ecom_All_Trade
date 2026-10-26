import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Clients are created lazily: createClient() throws when the URL is empty, and
// creating it at import time breaks `next build` wherever the env vars are unset.
export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

function requireConfig() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing).");
  }
}

let publicClient: SupabaseClient | null = null;

// Public client for browser / dashboard queries (subject to RLS)
export function getSupabase() {
  requireConfig();
  if (!publicClient) publicClient = createClient(supabaseUrl, supabaseAnonKey);
  return publicClient;
}

// Admin client for server-side upload processing (bypasses RLS)
export function getServiceSupabase() {
  requireConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;
  return createClient(supabaseUrl, serviceKey);
}
