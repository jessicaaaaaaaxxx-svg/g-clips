// Shared helpers for the creator dashboard and admin backend.
// Depends on: shared/config.js and the Supabase JS CDN script being loaded first.

// Creator and admin logins must be fully independent: give each area its own
// Supabase Auth session storage key so signing in on /dashboard never grants
// (or interferes with) a session on /admin, and vice versa.
const AUTH_STORAGE_KEY = window.location.pathname.startsWith("/admin/") ? "gclips-admin-auth" : "gclips-creator-auth";
const EXPECTED_ROLE = window.location.pathname.startsWith("/admin/") ? "admin" : "creator";

const supabaseClient = window.supabase.createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY, {
  auth: { storageKey: AUTH_STORAGE_KEY },
});

const API_BASE_URL = window.APP_CONFIG.API_BASE_URL || "";

/**
 * Calls our Express API with the current Supabase session's access token attached.
 */
async function apiFetch(path, options = {}) {
  const { data } = await supabaseClient.auth.getSession();
  const token = data?.session?.access_token;

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json() : null;

  if (!response.ok) {
    const message = body?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

/**
 * Redirects to loginPage if there is no active session. Returns the session's user otherwise.
 */
async function requireSession(loginPage = "login.html") {
  const { data } = await supabaseClient.auth.getSession();
  if (!data?.session) {
    window.location.href = loginPage;
    return null;
  }
  return data.session.user;
}

/**
 * Like requireSession, but also verifies the profile's role matches this area
 * (EXPECTED_ROLE is "admin" under /admin/, "creator" everywhere else). If the
 * role doesn't match, the (wrong-area) session is signed out and the user is
 * sent back to loginPage — this keeps creator and admin logins fully separate.
 */
async function requireSessionForThisArea(loginPage = "login.html") {
  const user = await requireSession(loginPage);
  if (!user) return null;

  const profile = await fetchOwnProfile(user.id);
  if (profile.role !== EXPECTED_ROLE) {
    await supabaseClient.auth.signOut();
    window.location.href = loginPage;
    return null;
  }
  return { user, profile };
}

/**
 * Fetches the signed-in user's profile row (id, role, full_name, email, ...).
 */
async function fetchOwnProfile(userId) {
  const { data, error } = await supabaseClient.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

async function logout(loginPage = "login.html") {
  await supabaseClient.auth.signOut();
  window.location.href = loginPage;
}

function formatCny(amount) {
  return `¥ ${Number(amount || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCompactNumber(num) {
  const n = Number(num || 0);
  if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, "") + "亿";
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "万";
  return String(n);
}

function formatDate(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}
