// dashboard/dashboard.js — creator dashboard interactions

const TIER_LABELS = { explorer: "探索者计划", creator: "创作者计划", influence: "影响力计划" };
const NICHE_LABELS = { travel: "旅行 · 户外", lifestyle: "生活 · 美食", tech: "科技 · 数码" };
const STATUS_LABELS = { pending: "审核中", approved: "已通过", rejected: "已拒绝", published: "已发布" };
const WITHDRAWAL_STATUS_LABELS = { pending: "待处理", approved: "已批准", rejected: "已拒绝", paid: "已支付" };
const METHOD_LABELS = { paypal: "PayPal", bank_transfer: "银行转账", alipay: "支付宝" };

let currentUser = null;
let accountPackages = [];
let rentedAccounts = [];

// ---------------------------------------------------------------- Navigation
document.querySelectorAll(".nav-link").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});
document.querySelectorAll("[data-goto]").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.goto));
});

document.getElementById("orderUploadShortcut").addEventListener("click", () => {
  switchView(rentedAccounts.length ? "orders" : "packages");
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
  currentUser = session.user;
  const profile = session.profile;

  document.getElementById("userName").textContent = profile.full_name || profile.email;
  document.getElementById("userEmail").textContent = profile.email;
  document.getElementById("profileName").textContent = profile.full_name || profile.email;
  document.getElementById("userAvatar").textContent = (profile.full_name || profile.email || "?").slice(0, 1).toUpperCase();
  document.getElementById("profileAvatar").textContent = (profile.full_name || profile.email || "?").slice(0, 1).toUpperCase();

  await Promise.all([loadOverview(), loadVideos(), loadAccounts(), loadWithdrawals()]);
})().catch((error) => {
  console.error(error);
  alert("加载创作者中心时出错：" + error.message);
});

// ---------------------------------------------------------------- Overview
async function loadOverview() {
  const { totals, balance, recentLedger } = await apiFetch("/api/earnings/summary");

  const cards = document.querySelectorAll("#overviewStats .stat-card strong");
  cards[0].textContent = formatCompactNumber(totals.totalViews);
  cards[1].textContent = formatCny(totals.totalEstimated);
  cards[2].textContent = formatCny(balance.availableBalance);
  cards[3].textContent = totals.publishedCount;

  document.getElementById("withdrawableBalance").textContent = formatCny(balance.availableBalance);

  const tbody = document.getElementById("ledgerTableBody");
  if (!recentLedger.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="3">暂无结算记录</td></tr>`;
    return;
  }
  tbody.innerHTML = recentLedger
    .map(
      (row) => `<tr>
        <td>${formatDate(row.created_at)}</td>
        <td>${formatCny(row.amount_cny)}</td>
        <td>${escapeHtml(row.note || "—")}</td>
      </tr>`
    )
    .join("");
}

// ---------------------------------------------------------------- Videos
async function loadVideos() {
  const { videos } = await apiFetch("/api/videos/mine");
  const tbody = document.getElementById("videosTableBody");

  if (!videos.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">还没有上传作品。</td></tr>`;
    return;
  }

  tbody.innerHTML = videos
    .map(
      (v) => `<tr>
        <td>${escapeHtml(v.title)}</td>
        <td><span class="badge ${v.status}">${STATUS_LABELS[v.status] || v.status}</span></td>
        <td>${formatCompactNumber(v.views)}</td>
        <td class="actions-cell">
          ${v.status === "pending" ? `<button class="btn danger small" data-delete="${v.id}">撤回</button>` : ""}
        </td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("确定要撤回这条待审核的作品吗？")) return;
      try {
        await apiFetch(`/api/videos/${btn.dataset.delete}`, { method: "DELETE" });
        await Promise.all([loadVideos(), loadOverview()]);
      } catch (error) {
        alert("撤回失败：" + error.message);
      }
    });
  });
}

// ---------------------------------------------------------------- Accounts
async function loadAccounts() {
  const { accounts } = await apiFetch("/api/accounts/mine");
  const grid = document.getElementById("accountsGrid");
  const select = document.getElementById("videoAccount");
  const uploadPanel = document.getElementById("uploadPanel");
  const uploadLockPanel = document.getElementById("uploadLockPanel");
  const packageStatusCopy = document.getElementById("packageStatusCopy");
  const rentedAccountsList = document.getElementById("rentedAccountsList");

  accountPackages = accounts;
  rentedAccounts = accounts.filter((acc) => acc.assigned_to === currentUser.id);

  select.innerHTML = `<option value="">请选择已租用套餐账户</option>`;
  uploadPanel.style.display = rentedAccounts.length ? "block" : "none";
  uploadLockPanel.style.display = rentedAccounts.length ? "none" : "block";
  packageStatusCopy.textContent = rentedAccounts.length
    ? `已租用 ${rentedAccounts.length} 个套餐账户，可以上传作品提交发布。`
    : "先租用套餐账户，再上传作品提交发布。";
  rentedAccountsList.innerHTML = rentedAccounts.length
    ? rentedAccounts.map((acc) => `<div class="rented-account-item"><strong>${escapeHtml(acc.account_handle)}</strong><span>${TIER_LABELS[acc.tier] || acc.tier}</span></div>`).join("")
    : `<p style="color:var(--muted);font-size:13px;">还没有租用套餐账户。</p>`;

  if (!accounts.length) {
    grid.innerHTML = `<p style="color:var(--muted);font-size:13px;">当前没有可租用套餐，请联系平台运营。</p>`;
    return;
  }

  grid.innerHTML = accounts
    .map(
      (acc) => `<div class="account-pick package-card ${acc.assigned_to === currentUser.id ? "rented" : ""}">
        <strong>${TIER_LABELS[acc.tier] || acc.tier}</strong>
        <small>${escapeHtml(acc.account_handle)} · ${NICHE_LABELS[acc.niche] || acc.niche}</small>
        <div class="package-meta"><span>${formatCompactNumber(acc.follower_count)}粉丝</span><span>${acc.status === "available" ? "可租用" : "已租用"}</span></div>
        ${acc.assigned_to === currentUser.id ? `<span class="badge assigned">我的套餐</span>` : `<button type="button" class="btn small" data-rent-account="${acc.id}">租用套餐</button>`}
      </div>`
    )
    .join("");

  grid.querySelectorAll("[data-rent-account]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const alertBox = document.getElementById("packageAlert");
      alertBox.innerHTML = "";
      btn.disabled = true;
      btn.textContent = "租用中…";
      try {
        await apiFetch(`/api/accounts/${btn.dataset.rentAccount}/rent`, { method: "POST" });
        alertBox.innerHTML = `<div class="alert success">套餐账户租用成功，现在可以上传作品了。</div>`;
        await loadAccounts();
      } catch (error) {
        alertBox.innerHTML = `<div class="alert error">租用失败：${escapeHtml(error.message)}</div>`;
      } finally {
        btn.disabled = false;
        btn.textContent = "租用套餐";
      }
    });
  });

  rentedAccounts.forEach((acc) => {
    const opt = document.createElement("option");
    opt.value = acc.id;
    opt.textContent = `${acc.account_handle} (${TIER_LABELS[acc.tier] || acc.tier})`;
    select.appendChild(opt);
  });

  if (rentedAccounts.length === 1) select.value = rentedAccounts[0].id;
}

// ---------------------------------------------------------------- Upload
const videoFileInput = document.getElementById("videoFileInput");
const uploadDropLabel = document.getElementById("uploadDropLabel");
const aiGeneratedTitle = document.getElementById("aiGeneratedTitle");
const aiGeneratedDescription = document.getElementById("aiGeneratedDescription");
const aiGeneratedTags = document.getElementById("aiGeneratedTags");
const aiPlanGrid = document.getElementById("aiPlanGrid");
const aiFormatLabel = document.getElementById("aiFormatLabel");
const generateAiBtn = document.getElementById("generateAiBtn");
const applyAiBtn = document.getElementById("applyAiBtn");
let selectedFile = null;
let aiSuggestion = null;

function detectMediaTheme(filename = "") {
  const text = filename.toLowerCase();
  if (/(travel|trip|outdoor|mountain|beach|city|road|culture|landscape)/.test(text)) return "travel";
  if (/(food|meal|restaurant|cooking|dessert|coffee|lifestyle|daily|street|portrait)/.test(text)) return "lifestyle";
  if (/(tech|ai|gadget|phone|camera|computer|review|digital|product)/.test(text)) return "tech";
  return "lifestyle";
}

function formatFileSize(bytes = 0) {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${mb.toFixed(1)} MB`;
}

function estimateVideoDuration(file) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith("video/")) {
      resolve(0);
      return;
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? Math.round(video.duration) : 20);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(20);
    };
    video.src = url;
  });
}

function buildAiPlan(file, durationSeconds = 0) {
  const mediaType = file.type.startsWith("image/") ? "图片素材" : "视频素材";
  const theme = detectMediaTheme(file.name || "");
  const themeMap = {
    travel: {
      title: `旅行日记：在${new Date().getMonth() + 1}月的旅程里，最值得记录的日出瞬间`,
      description: "这段旅行素材聚焦城市、自然景观和人物情绪的对比，AI 会优先保留开场冲击镜头、过渡景别和最高亮度瞬间，剪出节奏感强、适合短视频传播的版本。",
      tags: ["#旅行", "#城市日记", "#短视频故事", "#旅行vlog"],
      scenes: [
        { time: "0-3s", title: "开场钩子", copy: "先用大景和人物特写给观众留下强烈地域感和视觉冲击。" },
        { time: "3-8s", title: "故事展开", copy: "切入路线、食物、城市细节，快速建立情绪背景与旅行叙事。" },
        { time: "8-13s", title: "高光瞬间", copy: "放大最震撼的时间点和大场面，让观众在第一时间停留。" },
        { time: "13-17s", title: "结尾留白", copy: "使用一句总结式结尾，强化记忆点并提升停留和评论。" },
      ],
    },
    tech: {
      title: `科技测评：这款产品的真实体验，值得看完每一个细节`,
      description: "AI 会优先突出产品亮点、细节展示和对比视角，自动组装适合科技类内容的开场、卖点和结尾，帮助提升互动率与停留时间。",
      tags: ["#数码评测", "#科技体验", "#产品测评", "#AI剪辑"],
      scenes: [
        { time: "0-2s", title: "产品开场", copy: "前 2 秒用产品外观和场景渲染出强烈“真实体验”感。" },
        { time: "2-7s", title: "功能拆解", copy: "集中展示核心卖点和使用场景，突出价值主张。" },
        { time: "7-12s", title: "对比验证", copy: "加入对比镜头与细节闭环，让内容更可信并提高信任感。" },
        { time: "12-15s", title: "结尾 CTA", copy: "最后用一句“为什么值得买”收尾，刺激评论与收藏。" },
      ],
    },
    lifestyle: {
      title: `生活日记：日常里最值得留下的那一刻，记录真实生活的温度`,
      description: "这条素材适合生活方式内容，AI 会基于节奏、人物动作和主视觉进行自动剪辑，突出真实感与情绪表达，让内容更具传播力。",
      tags: ["#生活方式", "#日记短片", "#真实记录", "#创意剪辑"],
      scenes: [
        { time: "0-3s", title: "情绪开场", copy: "用情绪镜头和温暖画面快速拉近观众距离。" },
        { time: "3-8s", title: "真实细节", copy: "突出动作、表情和生活碎片，让内容更有“真实感”。" },
        { time: "8-12s", title: "高潮收束", copy: "抓住最有情绪的瞬间，形成强烈记忆点。" },
        { time: "12-16s", title: "情绪结尾", copy: "用一句情感总结收尾，提升共鸣和完播率。" },
      ],
    },
  };

  const chosen = themeMap[theme] || themeMap.lifestyle;
  const titlePrefix = mediaType === "图片素材" ? "图片叙事：" : "短视频：";
  const effectiveDuration = durationSeconds > 0 ? durationSeconds : 16;

  return {
    title: `${titlePrefix}${chosen.title}`,
    description: chosen.description,
    tags: chosen.tags,
    mediaType,
    duration: effectiveDuration,
    format: "竖版 9:16",
    scenes: chosen.scenes.map((scene, index) => ({
      ...scene,
      time: index === 0 && mediaType === "图片素材" ? "0-4s" : scene.time,
    })),
  };
}

function renderAiSuggestion(suggestion) {
  if (!suggestion) {
    aiGeneratedTitle.textContent = "等待上传素材…";
    aiGeneratedDescription.textContent = "上传视频或图片后，AI 会根据内容方向自动生成标题、文案和标签。";
    aiGeneratedTags.innerHTML = "";
    aiPlanGrid.innerHTML = "";
    aiFormatLabel.textContent = "竖版 9:16";
    return;
  }

  aiGeneratedTitle.textContent = suggestion.title;
  aiGeneratedDescription.textContent = `${suggestion.description}（${suggestion.mediaType} · ${suggestion.duration}s 预计剪辑时长）`;
  aiGeneratedTags.innerHTML = suggestion.tags.map((tag) => `<span class="ai-tag">${tag}</span>`).join("");
  aiFormatLabel.textContent = suggestion.format || "竖版 9:16";

  aiPlanGrid.innerHTML = suggestion.scenes
    .map(
      (scene) => `
        <div class="ai-scene-item">
          <div class="ai-scene-time">${scene.time}</div>
          <div>
            <div class="ai-scene-title">${scene.title}</div>
            <div class="ai-scene-copy">${scene.copy}</div>
          </div>
        </div>
      `
    )
    .join("");
}

async function generateAiForCurrentFile() {
  if (!selectedFile) {
    aiSuggestion = null;
    renderAiSuggestion(null);
    return;
  }

  const duration = await estimateVideoDuration(selectedFile);

  try {
    const payload = {
      fileName: selectedFile.name,
      mediaType: selectedFile.type.startsWith("image/") ? "image" : "video",
      fileSize: selectedFile.size,
      duration,
    };

    const response = await apiFetch("/api/ai/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    aiSuggestion = {
      ...response,
      mediaType: selectedFile.type.startsWith("image/") ? "图片素材" : "视频素材",
      duration: Number(response.duration || duration || 16),
    };
    renderAiSuggestion(aiSuggestion);
    return;
  } catch (error) {
    console.warn("AI generation failed, using fallback plan:", error);
  }

  aiSuggestion = buildAiPlan(selectedFile, duration);
  renderAiSuggestion(aiSuggestion);
}

function applyAiSuggestionToForm() {
  if (!aiSuggestion) {
    alert("请先上传素材，再生成AI文案。")
    return;
  }

  document.getElementById("videoTitle").value = aiSuggestion.title;
  document.getElementById("videoDescription").value = `${aiSuggestion.description} ${aiSuggestion.tags.join(" ")}`;
}

videoFileInput.addEventListener("change", async () => {
  selectedFile = videoFileInput.files[0] || null;
  uploadDropLabel.textContent = selectedFile ? `已选择：${selectedFile.name} · ${formatFileSize(selectedFile.size)}` : "点击选择视频 / 图片素材（支持 mp4 / mov / jpg / png，最大 200MB）";
  await generateAiForCurrentFile();
});

generateAiBtn.addEventListener("click", async () => {
  await generateAiForCurrentFile();
});
applyAiBtn.addEventListener("click", applyAiSuggestionToForm);

document.getElementById("uploadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const alertBox = document.getElementById("uploadAlert");
  const submitBtn = document.getElementById("uploadSubmitBtn");
  alertBox.innerHTML = "";

  if (!selectedFile) {
    alertBox.innerHTML = `<div class="alert error">请先选择一个视频或图片素材文件。</div>`;
    return;
  }

  if (!rentedAccounts.length) {
    alertBox.innerHTML = `<div class="alert error">请先到「套餐」租用账户，再上传作品。</div>`;
    switchView("packages");
    return;
  }

  const douyin_account_id = document.getElementById("videoAccount").value || null;
  if (!douyin_account_id) {
    alertBox.innerHTML = `<div class="alert error">请选择已租用的套餐账户。</div>`;
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "上传中…";

  try {
    const path = `${currentUser.id}/${Date.now()}-${selectedFile.name}`;
    const { error: uploadError } = await supabaseClient.storage.from("videos").upload(path, selectedFile);
    if (uploadError) throw uploadError;

    const title = document.getElementById("videoTitle").value.trim();
    const description = document.getElementById("videoDescription").value.trim();

    if (!title) {
      throw new Error("标题不能为空，请先生成或填写标题。")
    }

    await apiFetch("/api/videos", {
      method: "POST",
      body: JSON.stringify({ title, description, storage_path: path, douyin_account_id }),
    });

    alertBox.innerHTML = `<div class="alert success">上传成功！作品已提交审核，AI 生成的标题与文案已同步。</div>`;
    document.getElementById("uploadForm").reset();
    selectedFile = null;
    aiSuggestion = null;
    renderAiSuggestion(null);
    uploadDropLabel.textContent = "点击选择视频 / 图片素材（支持 mp4 / mov / jpg / png，最大 200MB）";
    videoFileInput.value = "";
    await Promise.all([loadVideos(), loadOverview()]);
  } catch (error) {
    alertBox.innerHTML = `<div class="alert error">上传失败：${escapeHtml(error.message)}</div>`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "提交审核";
  }
});

// ---------------------------------------------------------------- Withdrawals
async function loadWithdrawals() {
  const { withdrawals } = await apiFetch("/api/withdrawals/mine");
  const tbody = document.getElementById("withdrawalsTableBody");

  if (!withdrawals.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">暂无提现记录</td></tr>`;
    return;
  }

  tbody.innerHTML = withdrawals
    .map(
      (w) => `<tr>
        <td>${formatDate(w.requested_at)}</td>
        <td>${formatCny(w.amount_cny)}</td>
        <td>${METHOD_LABELS[w.method] || w.method}</td>
        <td><span class="badge ${w.status}">${WITHDRAWAL_STATUS_LABELS[w.status] || w.status}</span></td>
      </tr>`
    )
    .join("");
}

document.getElementById("withdrawForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const alertBox = document.getElementById("withdrawAlert");
  const submitBtn = document.getElementById("withdrawSubmitBtn");
  alertBox.innerHTML = "";
  submitBtn.disabled = true;

  try {
    const amount_cny = Number(document.getElementById("withdrawAmount").value);
    const method = document.getElementById("withdrawMethod").value;
    const accountDetailsRaw = document.getElementById("withdrawAccount").value.trim();

    await apiFetch("/api/withdrawals", {
      method: "POST",
      body: JSON.stringify({ amount_cny, method, account_details: { info: accountDetailsRaw } }),
    });

    alertBox.innerHTML = `<div class="alert success">提现申请已提交，等待平台审核。</div>`;
    document.getElementById("withdrawForm").reset();
    await Promise.all([loadWithdrawals(), loadOverview()]);
  } catch (error) {
    alertBox.innerHTML = `<div class="alert error">${escapeHtml(error.message)}</div>`;
  } finally {
    submitBtn.disabled = false;
  }
});
