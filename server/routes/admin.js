const express = require("express");
const supabaseAdmin = require("../supabaseAdmin");
const authenticate = require("../middleware/auth");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

// All admin routes require a valid session AND an admin role.
router.use(authenticate, requireAdmin);

// ---------------------------------------------------------------------------
// Platform overview
// ---------------------------------------------------------------------------
router.get("/stats", async (req, res) => {
  try {
    const [creators, pendingVideos, pendingWithdrawals, videoTotals] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "creator"),
      supabaseAdmin.from("videos").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("withdrawals").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("videos").select("views, estimated_earnings_cny, settled_earnings_cny"),
    ]);

    if (creators.error) throw creators.error;
    if (pendingVideos.error) throw pendingVideos.error;
    if (pendingWithdrawals.error) throw pendingWithdrawals.error;
    if (videoTotals.error) throw videoTotals.error;

    const totals = (videoTotals.data || []).reduce(
      (acc, v) => {
        acc.totalViews += Number(v.views);
        acc.totalEstimated += Number(v.estimated_earnings_cny);
        acc.totalSettled += Number(v.settled_earnings_cny);
        return acc;
      },
      { totalViews: 0, totalEstimated: 0, totalSettled: 0 }
    );

    res.json({
      totalCreators: creators.count || 0,
      pendingVideos: pendingVideos.count || 0,
      pendingWithdrawals: pendingWithdrawals.count || 0,
      ...totals,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Creators
// ---------------------------------------------------------------------------
router.get("/creators", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("role", "creator")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ creators: data });
});

// ---------------------------------------------------------------------------
// Video moderation
// ---------------------------------------------------------------------------
router.get("/videos", async (req, res) => {
  const status = req.query.status;
  let query = supabaseAdmin
    .from("videos")
    .select("*, creator:profiles!videos_creator_id_fkey(full_name, email), douyin_account:douyin_accounts(account_handle)")
    .order("submitted_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ videos: data });
});

router.post("/videos/:id/review", async (req, res) => {
  const { action, reject_reason } = req.body || {};
  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ error: "action must be 'approve' or 'reject'." });
  }

  const patch = {
    status: action === "approve" ? "published" : "rejected",
    reviewed_at: new Date().toISOString(),
    reviewed_by: req.profile.id,
  };
  if (action === "approve") patch.published_at = new Date().toISOString();
  if (action === "reject") patch.reject_reason = reject_reason || null;

  const { data, error } = await supabaseAdmin.from("videos").update(patch).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ video: data });
});

router.patch("/videos/:id/stats", async (req, res) => {
  const { views, likes, comments, shares } = req.body || {};
  const patch = {};
  if (views !== undefined) patch.views = Number(views);
  if (likes !== undefined) patch.likes = Number(likes);
  if (comments !== undefined) patch.comments = Number(comments);
  if (shares !== undefined) patch.shares = Number(shares);

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "Provide at least one of: views, likes, comments, shares." });
  }

  const { data, error } = await supabaseAdmin.from("videos").update(patch).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ video: data });
});

// Locks in the video's current estimated earnings as a real, withdrawable ledger entry.
router.post("/videos/:id/settle", async (req, res) => {
  try {
    const { data: video, error: videoError } = await supabaseAdmin
      .from("videos")
      .select("id, creator_id, estimated_earnings_cny, settled_earnings_cny")
      .eq("id", req.params.id)
      .single();

    if (videoError || !video) return res.status(404).json({ error: "Video not found." });

    const delta = Number(video.estimated_earnings_cny) - Number(video.settled_earnings_cny);
    if (delta <= 0) {
      return res.status(400).json({ error: "Nothing new to settle for this video." });
    }

    const { error: ledgerError } = await supabaseAdmin.from("earnings_ledger").insert({
      creator_id: video.creator_id,
      video_id: video.id,
      amount_cny: delta,
      note: req.body?.note || "Settlement",
      created_by: req.profile.id,
    });
    if (ledgerError) throw ledgerError;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("videos")
      .update({ settled_earnings_cny: video.estimated_earnings_cny })
      .eq("id", video.id)
      .select()
      .single();
    if (updateError) throw updateError;

    res.json({ video: updated, settledDelta: delta });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Douyin account inventory
// ---------------------------------------------------------------------------
router.get("/accounts", async (req, res) => {
  const { data, error } = await supabaseAdmin.from("douyin_accounts").select("*").order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ accounts: data });
});

router.post("/accounts", async (req, res) => {
  const { account_handle, niche, tier, follower_count } = req.body || {};
  if (!account_handle || !niche || !tier) {
    return res.status(400).json({ error: "account_handle, niche and tier are required." });
  }

  const { data, error } = await supabaseAdmin
    .from("douyin_accounts")
    .insert({ account_handle, niche, tier, follower_count: Number(follower_count) || 0 })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ account: data });
});

router.post("/accounts/:id/assign", async (req, res) => {
  const { creator_id } = req.body || {};
  if (!creator_id) return res.status(400).json({ error: "creator_id is required." });

  const { data, error } = await supabaseAdmin
    .from("douyin_accounts")
    .update({ assigned_to: creator_id, status: "assigned" })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ account: data });
});

router.post("/accounts/:id/release", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("douyin_accounts")
    .update({ assigned_to: null, status: "available" })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ account: data });
});

// ---------------------------------------------------------------------------
// Withdrawal processing
// ---------------------------------------------------------------------------
router.get("/withdrawals", async (req, res) => {
  const status = req.query.status;
  let query = supabaseAdmin
    .from("withdrawals")
    .select("*, creator:profiles!withdrawals_creator_id_fkey(full_name, email, payout_email)")
    .order("requested_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ withdrawals: data });
});

router.post("/withdrawals/:id/process", async (req, res) => {
  const { action, admin_note } = req.body || {};
  if (!["approve", "reject", "paid"].includes(action)) {
    return res.status(400).json({ error: "action must be 'approve', 'reject' or 'paid'." });
  }

  const statusMap = { approve: "approved", reject: "rejected", paid: "paid" };
  const patch = {
    status: statusMap[action],
    admin_note: admin_note || null,
    processed_at: new Date().toISOString(),
    processed_by: req.profile.id,
  };

  const { data, error } = await supabaseAdmin.from("withdrawals").update(patch).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ withdrawal: data });
});

module.exports = router;
