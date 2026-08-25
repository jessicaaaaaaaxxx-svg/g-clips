// dashboard/reset-password.js — handles the "set a new password" link from the recovery email

const alertBox = document.getElementById("alertBox");
const form = document.getElementById("resetPasswordForm");
const newPasswordField = document.getElementById("newPasswordField");
const confirmPasswordField = document.getElementById("confirmPasswordField");
const submitBtn = document.getElementById("resetPasswordSubmitBtn");

function showAlert(type, message) {
  alertBox.innerHTML = `<div class="alert ${type}">${escapeHtml(message)}</div>`;
}

function setFieldError(input, hasError) {
  input.closest(".field").classList.toggle("invalid", hasError);
}

// Password visibility toggle
const toggleBtn = document.getElementById("toggleNewPassword");
const eyeIcon = document.getElementById("eyeIconNew");
const eyeOffPath =
  '<path d="M3 3l18 18M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5M9.4 5.3A11 11 0 0 1 12 5c7 0 11 7 11 7a13.5 13.5 0 0 1-3.1 3.9M6.6 6.7A13.7 13.7 0 0 0 1 12s4 7 11 7c1.4 0 2.7-.2 3.9-.6"/>';
const eyeOnPath = '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/>';

toggleBtn.addEventListener("click", () => {
  const isHidden = newPasswordField.type === "password";
  newPasswordField.type = isHidden ? "text" : "password";
  toggleBtn.setAttribute("aria-pressed", String(isHidden));
  eyeIcon.innerHTML = isHidden ? eyeOffPath : eyeOnPath;
});

// Supabase automatically parses the recovery token from the URL (detectSessionInUrl
// defaults to true) and creates a temporary session we can use to set a new password.
supabaseClient.auth.getSession().then(({ data }) => {
  if (!data?.session) {
    showAlert("error", "这个重置链接无效或已过期，请重新申请找回密码。");
    form.querySelectorAll("input, button").forEach((el) => (el.disabled = true));
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  alertBox.innerHTML = "";

  const password = newPasswordField.value;
  const confirmPassword = confirmPasswordField.value;

  const passwordOk = password.length >= 6;
  const matchOk = password === confirmPassword && confirmPassword.length > 0;
  setFieldError(newPasswordField, !passwordOk);
  setFieldError(confirmPasswordField, !matchOk);
  if (!passwordOk || !matchOk) return;

  submitBtn.disabled = true;
  submitBtn.classList.add("loading");
  submitBtn.querySelector(".btn-label").textContent = "更新中…";

  try {
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) throw error;

    showAlert("success", "密码已更新！即将跳转到登录页…");
    form.style.display = "none";
    setTimeout(() => {
      window.location.href = "login.html";
    }, 1800);
  } catch (error) {
    showAlert("error", error.message || "更新失败，请重试。");
    submitBtn.disabled = false;
    submitBtn.classList.remove("loading");
    submitBtn.querySelector(".btn-label").textContent = "更新密码";
  }
});
