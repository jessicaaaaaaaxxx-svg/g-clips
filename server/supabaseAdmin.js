const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseAdmin = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
} else {
  console.warn(
    "[gclips] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. " +
      "API routes will respond with 503 until these env vars are configured. " +
      "See .env.example."
  );
}

module.exports = supabaseAdmin;
