// admin/auth.js — admin sign-in (no self-service sign-up; admins are promoted via SQL)

const authForm = document.getElementById("authForm");
const submitBtn = document.getElementById("submitBtn");
const alertBox = document.getElementById("alertBox");

function showAlert(type, message) {
  alertBox.innerHTML = `<div class="alert ${type}">${escapeHtml(message)}</div>`;
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("emailField").value.trim();
  const password = document.getElementById("passwordField").value;

  submitBtn.disabled = true;
  alertBox.innerHTML = "";

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const profile = await fetchOwnProfile(data.user.id);
    if (profile.role !== "admin") {
      await supabaseClient.auth.signOut();
      throw new Error("此账号没有管理员权限。");
    }

    window.location.href = "index.html";
  } catch (error) {
    showAlert("error", error.message || "登录失败，请重试。");
  } finally {
    submitBtn.disabled = false;
  }
});

supabaseClient.auth.getSession().then(async ({ data }) => {
  if (!data?.session) return;
  try {
    const profile = await fetchOwnProfile(data.session.user.id);
    if (profile.role === "admin") window.location.href = "index.html";
  } catch (error) {
    /* ignore — user will just see the login form */
  }
});
