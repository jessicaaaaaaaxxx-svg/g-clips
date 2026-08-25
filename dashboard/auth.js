// dashboard/auth.js — sign in / sign up / forgot-password interactions for creators

let mode = "signin"; // "signin" | "signup"

const tabSignIn = document.getElementById("tabSignIn");
const tabSignUp = document.getElementById("tabSignUp");
const authTabs = document.getElementById("authTabs");
const fullNameField = document.getElementById("fullNameField");
const fullNameFieldWrap = document.getElementById("fullNameFieldWrap");
const emailField = document.getElementById("emailField");
const passwordField = document.getElementById("passwordField");
const submitBtn = document.getElementById("submitBtn");
const authForm = document.getElementById("authForm");
const resetForm = document.getElementById("resetForm");
const resetEmailField = document.getElementById("resetEmailField");
const resetSubmitBtn = document.getElementById("resetSubmitBtn");
const alertBox = document.getElementById("alertBox");
const forgotPasswordRow = document.getElementById("forgotPasswordRow");

function showAlert(type, message) {
  alertBox.innerHTML = `<div class="alert ${type}">${escapeHtml(message)}</div>`;
}

function clearAlert() {
  alertBox.innerHTML = "";
}

function getFriendlyAuthError(error) {
  const message = error?.message || "";
  const isNetworkFailure = /Failed to fetch|fetch failed|NetworkError|ENOTFOUND|ECONNREFUSED|ERR_NAME_NOT_RESOLVED/i.test(message);

  if (isNetworkFailure) {
    return "无法连接到 Supabase。请先在 shared/config.js 中填入正确的项目 URL 和 anon key，并确认 Supabase 项目已创建且可访问。";
  }

  if (!window.APP_CONFIG || !window.APP_CONFIG.SUPABASE_URL || !window.APP_CONFIG.SUPABASE_ANON_KEY || window.APP_CONFIG.SUPABASE_URL.includes("your-project") || window.APP_CONFIG.SUPABASE_ANON_KEY.includes("your-anon-key")) {
    return "Supabase 配置未完成。请在 shared/config.js 中填写真实的 Project URL 和 anon key，然后再注册或登录。";
  }

  return error?.message || "操作失败，请重试。";
}

// ---------------------------------------------------------------- Sign in / sign up tabs
function setMode(next) {
  mode = next;
  const isSignUp = mode === "signup";
  tabSignIn.classList.toggle("active", !isSignUp);
  tabSignUp.classList.toggle("active", isSignUp);
  fullNameFieldWrap.style.display = isSignUp ? "block" : "none";
  forgotPasswordRow.style.display = isSignUp ? "none" : "flex";
  passwordField.setAttribute("autocomplete", isSignUp ? "new-password" : "current-password");
  submitBtn.querySelector(".btn-label").textContent = isSignUp ? "注册" : "登录";
  clearAlert();
  clearFieldError(fullNameFieldWrap);
  clearFieldError(emailField.closest(".field"));
  clearFieldError(passwordField.closest(".field"));
}

tabSignIn.addEventListener("click", () => setMode("signin"));
tabSignUp.addEventListener("click", () => setMode("signup"));

// Links like "申请成为创作者" (?mode=signup) land directly on the sign-up tab.
const requestedMode = new URLSearchParams(window.location.search).get("mode");
setMode(requestedMode === "signup" ? "signup" : "signin");

// ---------------------------------------------------------------- Password visibility toggle
const togglePasswordBtn = document.getElementById("togglePassword");
const eyeIcon = document.getElementById("eyeIcon");
const eyeOffPath =
  '<path d="M3 3l18 18M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5M9.4 5.3A11 11 0 0 1 12 5c7 0 11 7 11 7a13.5 13.5 0 0 1-3.1 3.9M6.6 6.7A13.7 13.7 0 0 0 1 12s4 7 11 7c1.4 0 2.7-.2 3.9-.6"/>';
const eyeOnPath = '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/>';

togglePasswordBtn.addEventListener("click", () => {
  const isHidden = passwordField.type === "password";
  passwordField.type = isHidden ? "text" : "password";
  togglePasswordBtn.setAttribute("aria-pressed", String(isHidden));
  togglePasswordBtn.setAttribute("aria-label", isHidden ? "隐藏密码" : "显示密码");
  eyeIcon.innerHTML = isHidden ? eyeOffPath : eyeOnPath;
});

// ---------------------------------------------------------------- Inline validation helpers
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setFieldError(fieldOrWrap, hasError) {
  const wrap = fieldOrWrap.classList.contains("field") ? fieldOrWrap : fieldOrWrap.closest(".field");
  wrap.classList.toggle("invalid", hasError);
}

function clearFieldError(fieldOrWrap) {
  if (!fieldOrWrap) return;
  setFieldError(fieldOrWrap, false);
}

function validateAuthForm() {
  let valid = true;

  if (mode === "signup") {
    const nameOk = fullNameField.value.trim().length > 0;
    setFieldError(fullNameFieldWrap, !nameOk);
    if (!nameOk) valid = false;
  }

  const emailOk = EMAIL_PATTERN.test(emailField.value.trim());
  setFieldError(emailField, !emailOk);
  if (!emailOk) valid = false;

  const passwordOk = passwordField.value.length >= 6;
  setFieldError(passwordField, !passwordOk);
  if (!passwordOk) valid = false;

  return valid;
}

// ---------------------------------------------------------------- Button loading state
function setButtonLoading(btn, loading, labels) {
  btn.disabled = loading;
  btn.classList.toggle("loading", loading);
  if (labels) btn.querySelector(".btn-label").textContent = loading ? labels.loading : labels.idle;
}

// ---------------------------------------------------------------- Sign in / sign up submit
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearAlert();

  if (!validateAuthForm()) return;

  const email = emailField.value.trim();
  const password = passwordField.value;
  const fullName = fullNameField.value.trim();
  const labels = mode === "signup" ? { idle: "注册", loading: "注册中…" } : { idle: "登录", loading: "登录中…" };

  setButtonLoading(submitBtn, true, labels);

  try {
    if (mode === "signup") {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName || email } },
      });
      if (error) throw error;

      if (data.session) {
        // Email confirmation is disabled on this project, so Supabase already
        // signed the new user in — skip straight to the dashboard.
        window.location.href = "index.html";
        return; // keep the button in its loading state during redirect
      }

      // Email confirmation is enabled: no session yet, user must confirm first.
      setMode("signin");
      showAlert("success", "注册成功！请查收邮箱完成验证后再登录。");
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const profile = await fetchOwnProfile(data.user.id);
      if (profile.role !== "creator") {
        await supabaseClient.auth.signOut();
        throw new Error("此邮箱没有对应的创作者账号。");
      }

      window.location.href = "index.html";
      return; // keep the button in its loading state during redirect
    }
  } catch (error) {
    showAlert("error", getFriendlyAuthError(error));
  } finally {
    setButtonLoading(submitBtn, false, labels);
  }
});

// ---------------------------------------------------------------- Forgot password flow
const forgotPasswordLink = document.getElementById("forgotPasswordLink");
const backToSignInLink = document.getElementById("backToSignInLink");

forgotPasswordLink.addEventListener("click", () => {
  clearAlert();
  authTabs.style.display = "none";
  authForm.style.display = "none";
  resetForm.style.display = "block";
  resetEmailField.value = emailField.value.trim();
});

backToSignInLink.addEventListener("click", () => {
  clearAlert();
  resetForm.style.display = "none";
  authTabs.style.display = "flex";
  authForm.style.display = "block";
});

resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearAlert();

  const email = resetEmailField.value.trim();
  const emailOk = EMAIL_PATTERN.test(email);
  setFieldError(resetEmailField, !emailOk);
  if (!emailOk) return;

  setButtonLoading(resetSubmitBtn, true, { idle: "发送重置邮件", loading: "发送中…" });

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname.replace("login.html", "reset-password.html")}`,
    });
    if (error) throw error;
    showAlert("success", "重置密码邮件已发送，请查收邮箱。");
  } catch (error) {
    showAlert("error", getFriendlyAuthError(error));
  } finally {
    setButtonLoading(resetSubmitBtn, false, { idle: "发送重置邮件", loading: "发送中…" });
  }
});

// ---------------------------------------------------------------- Auto-redirect if already signed in
// If already signed in with a creator account, skip straight to the dashboard.
// (Sessions are isolated per area, so an admin session never appears here.)
supabaseClient.auth.getSession().then(async ({ data }) => {
  if (!data?.session) return;
  try {
    const profile = await fetchOwnProfile(data.session.user.id);
    if (profile.role === "creator") window.location.href = "index.html";
  } catch (error) {
    /* ignore — user will just see the login form */
  }
});

