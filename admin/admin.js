// admin/admin.js — admin backend interactions

const NICHE_LABELS = { travel: "旅行 · 户外", lifestyle: "生活 · 美食", tech: "科技 · 数码" };
const TIER_LABELS = { explorer: "探索者计划", creator: "创作者计划", influence: "影响力计划" };
const STATUS_LABELS = { pending: "待审核", approved: "已通过", rejected: "已拒绝", published: "已发布" };
const ACCOUNT_STATUS_LABELS = { available: "可租用", assigned: "已分配", maintenance: "维护中" };
const WITHDRAWAL_STATUS_LABELS = { pending: "待处理", approved: "已批准", rejected: "已拒绝", paid: "已支付" };
const METHOD_LABELS = { paypal: "PayPal", bank_transfer: "银行转账", alipay: "支付宝" };

let creatorsCache = [];

// ---------------------------------------------------------------- Navigation
document.querySelectorAll(".nav-link").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});
function switchView(view) {
  document.querySelectorAll(".nav-link").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".app-view").forEach((s) => s.classList.toggle("active", s.dataset.view === view));
}

document.getElementById("logoutBtn").addEventListener("click", () => logout("login.html"));

// ---------------------------------------------------------------- Bootstrap
(async function init() {
  const session = await requireSessionForThisArea("login.html");
  if (!session) return;
  const profile = session.profile;

  document.getElementById("userName").textContent = profile.full_name || profile.email;
  document.getElementById("userEmail").textContent = profile.email;
  document.getElementById("userAvatar").textContent = (profile.full_name || profile.email || "?").slice(0, 1).toUpperCase();

  await Promise.all([loadStats(), loadCreators(), loadAccounts(), loadReview(), loadWithdrawals()]);
})().catch((error) => {
  console.error(error);
  alert("加载管理后台时出错：" + error.message);
});

// ---------------------------------------------------------------- Overview
async function loadStats() {
  const stats = await apiFetch("/api/admin/stats");
  const cards = document.querySelectorAll("#statsGrid .stat-card strong");
  cards[0].textContent = stats.totalCreators;
  cards[1].textContent = stats.pendingVideos;
  cards[2].textContent = stats.pendingWithdrawals;
  cards[3].textContent = formatCompactNumber(stats.totalViews);
  cards[4].textContent = formatCny(stats.totalEstimated);
  cards[5].textContent = formatCny(stats.totalSettled);
}

// ---------------------------------------------------------------- Creators
async function loadCreators() {
  const { creators } = await apiFetch("/api/admin/creators");
  creatorsCache = creators;
  const tbody = document.getElementById("creatorsTableBody");

  if (!creators.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="3">暂无创作者</td></tr>`;
    return;
  }

  tbody.innerHTML = creators
    .map(
      (c) => `<tr>
        <td>${escapeHtml(c.full_name || "—")}</td>
        <td>${escapeHtml(c.email)}</td>
        <td>${formatDate(c.created_at)}</td>
      </tr>`
    )
    .join("");
}

// ---------------------------------------------------------------- Video review
document.getElementById("reviewStatusFilter").addEventListener("change", loadReview);

async function loadReview() {
  const status = document.getElementById("reviewStatusFilter").value;
  const { videos } = await apiFetch(`/api/admin/videos${status ? `?status=${status}` : ""}`);
  const tbody = document.getElementById("reviewTableBody");

  if (!videos.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">没有符合条件的作品</td></tr>`;
    return;
  }

  tbody.innerHTML = videos
    .map(
      (v) => `<tr>
        <td>${escapeHtml(v.title)}</td>
        <td>${escapeHtml(v.creator?.full_name || v.creator?.email || "—")}</td>
        <td>${v.douyin_account ? escapeHtml(v.douyin_account.account_handle) : "未指定"}</td>
        <td><span class="badge ${v.status}">${STATUS_LABELS[v.status] || v.status}</span></td>
        <td>
          <input type="number" min="0" value="${v.views}" data-views="${v.id}" style="width:90px;padding:4px 6px;border:1px solid var(--line);border-radius:5px;">
        </td>
        <td>${formatCny(v.estimated_earnings_cny)}</td>
        <td>${formatCny(v.settled_earnings_cny)}</td>
        <td class="actions-cell">
          ${v.status === "pending" ? `<button class="btn small" data-approve="${v.id}">通过</button><button class="btn danger small" data-reject="${v.id}">拒绝</button>` : ""}
          <button class="btn ghost small" data-save-views="${v.id}">保存播放量</button>
          <button class="btn ghost small" data-settle="${v.id}">结算</button>
        </td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-approve]").forEach((btn) =>
    btn.addEventListener("click", () => reviewVideo(btn.dataset.approve, "approve"))
  );
  tbody.querySelectorAll("[data-reject]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const reason = prompt("请输入拒绝原因（可留空）：") || "";
      reviewVideo(btn.dataset.reject, "reject", reason);
    })
  );
  tbody.querySelectorAll("[data-save-views]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.saveViews;
      const input = tbody.querySelector(`[data-views="${id}"]`);
      try {
        await apiFetch(`/api/admin/videos/${id}/stats`, { method: "PATCH", body: JSON.stringify({ views: Number(input.value) }) });
        await Promise.all([loadReview(), loadStats()]);
      } catch (error) {
        alert("更新播放量失败：" + error.message);
      }
    })
  );
  tbody.querySelectorAll("[data-settle]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      try {
        await apiFetch(`/api/admin/videos/${btn.dataset.settle}/settle`, { method: "POST", body: JSON.stringify({}) });
        await Promise.all([loadReview(), loadStats()]);
      } catch (error) {
        alert("结算失败：" + error.message);
      }
    })
  );
}

async function reviewVideo(id, action, reject_reason) {
  try {
    await apiFetch(`/api/admin/videos/${id}/review`, { method: "POST", body: JSON.stringify({ action, reject_reason }) });
    await Promise.all([loadReview(), loadStats()]);
  } catch (error) {
    alert("操作失败：" + error.message);
  }
}

// ---------------------------------------------------------------- Accounts
document.getElementById("newAccountBtn").addEventListener("click", () => {
  const panel = document.getElementById("newAccountPanel");
  panel.style.display = panel.style.display === "none" ? "block" : "none";
});

document.getElementById("newAccountForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await apiFetch("/api/admin/accounts", {
      method: "POST",
      body: JSON.stringify({
        account_handle: document.getElementById("accHandle").value.trim(),
        niche: document.getElementById("accNiche").value,
        tier: document.getElementById("accTier").value,
        follower_count: Number(document.getElementById("accFollowers").value) || 0,
      }),
    });
    document.getElementById("newAccountForm").reset();
    document.getElementById("newAccountPanel").style.display = "none";
    await loadAccounts();
  } catch (error) {
    alert("创建失败：" + error.message);
  }
});

async function loadAccounts() {
  const { accounts } = await apiFetch("/api/admin/accounts");
  const tbody = document.getElementById("accountsTableBody");

  if (!accounts.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">暂无账户，点击右上角新增</td></tr>`;
    return;
  }

  const creatorOptions = creatorsCache
    .map((c) => `<option value="${c.id}">${escapeHtml(c.full_name || c.email)}</option>`)
    .join("");

  tbody.innerHTML = accounts
    .map((acc) => {
      const assignedCreator = creatorsCache.find((c) => c.id === acc.assigned_to);
      return `<tr>
        <td>${escapeHtml(acc.account_handle)}</td>
        <td>${NICHE_LABELS[acc.niche] || acc.niche}</td>
        <td>${TIER_LABELS[acc.tier] || acc.tier}</td>
        <td>${formatCompactNumber(acc.follower_count)}</td>
        <td><span class="badge ${acc.status}">${ACCOUNT_STATUS_LABELS[acc.status] || acc.status}</span></td>
        <td>${assignedCreator ? escapeHtml(assignedCreator.full_name || assignedCreator.email) : "—"}</td>
        <td class="actions-cell">
          ${
            acc.status === "available"
              ? `<select data-assign-select="${acc.id}" style="padding:4px;border:1px solid var(--line);border-radius:5px;">
                  <option value="">选择创作者…</option>${creatorOptions}
                </select>
                <button class="btn small" data-assign="${acc.id}">分配</button>`
              : `<button class="btn ghost small" data-release="${acc.id}">释放</button>`
          }
        </td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll("[data-assign]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const select = tbody.querySelector(`[data-assign-select="${btn.dataset.assign}"]`);
      if (!select.value) return alert("请先选择一位创作者。");
      try {
        await apiFetch(`/api/admin/accounts/${btn.dataset.assign}/assign`, {
          method: "POST",
          body: JSON.stringify({ creator_id: select.value }),
        });
        await loadAccounts();
      } catch (error) {
        alert("分配失败：" + error.message);
      }
    })
  );
  tbody.querySelectorAll("[data-release]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      try {
        await apiFetch(`/api/admin/accounts/${btn.dataset.release}/release`, { method: "POST" });
        await loadAccounts();
      } catch (error) {
        alert("释放失败：" + error.message);
      }
    })
  );
}

// ---------------------------------------------------------------- Withdrawals
document.getElementById("withdrawalStatusFilter").addEventListener("change", loadWithdrawals);

async function loadWithdrawals() {
  const status = document.getElementById("withdrawalStatusFilter").value;
  const { withdrawals } = await apiFetch(`/api/admin/withdrawals${status ? `?status=${status}` : ""}`);
  const tbody = document.getElementById("withdrawalsTableBody");

  if (!withdrawals.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">没有符合条件的提现申请</td></tr>`;
    return;
  }

  tbody.innerHTML = withdrawals
    .map(
      (w) => `<tr>
        <td>${escapeHtml(w.creator?.full_name || w.creator?.email || "—")}</td>
        <td>${formatCny(w.amount_cny)}</td>
        <td>${METHOD_LABELS[w.method] || w.method}</td>
        <td>${escapeHtml(w.account_details?.info || JSON.stringify(w.account_details))}</td>
        <td><span class="badge ${w.status}">${WITHDRAWAL_STATUS_LABELS[w.status] || w.status}</span></td>
        <td>${formatDate(w.requested_at)}</td>
        <td class="actions-cell">
          ${
            w.status === "pending"
              ? `<button class="btn small" data-approve-w="${w.id}">批准</button><button class="btn danger small" data-reject-w="${w.id}">拒绝</button>`
              : ""
          }
          ${w.status === "approved" ? `<button class="btn small" data-paid-w="${w.id}">标记已支付</button>` : ""}
        </td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-approve-w]").forEach((btn) => btn.addEventListener("click", () => processWithdrawal(btn.dataset.approveW, "approve")));
  tbody.querySelectorAll("[data-reject-w]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const note = prompt("请输入拒绝原因（可留空）：") || "";
      processWithdrawal(btn.dataset.rejectW, "reject", note);
    })
  );
  tbody.querySelectorAll("[data-paid-w]").forEach((btn) => btn.addEventListener("click", () => processWithdrawal(btn.dataset.paidW, "paid")));
}

async function processWithdrawal(id, action, admin_note) {
  try {
    await apiFetch(`/api/admin/withdrawals/${id}/process`, { method: "POST", body: JSON.stringify({ action, admin_note }) });
    await Promise.all([loadWithdrawals(), loadStats()]);
  } catch (error) {
    alert("操作失败：" + error.message);
  }
}
