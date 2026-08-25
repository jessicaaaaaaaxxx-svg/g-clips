const supabaseAdmin = require("../supabaseAdmin");

/**
 * Verifies the Supabase access token sent in the Authorization header,
 * then loads the caller's profile row (role, etc.) onto req.profile.
 */
module.exports = async function authenticate(req, res, next) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: "Backend is not configured yet (missing Supabase env vars)." });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing access token." });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: "Invalid or expired session." });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile) {
    return res.status(403).json({ error: "Profile not found for this account." });
  }

  req.user = userData.user;
  req.profile = profile;
  next();
};
