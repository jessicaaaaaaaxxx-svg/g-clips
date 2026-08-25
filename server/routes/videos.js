const express = require("express");
const supabaseAdmin = require("../supabaseAdmin");
const authenticate = require("../middleware/auth");

const router = express.Router();

// GET /api/videos/mine — list the signed-in creator's own videos
router.get("/mine", authenticate, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("videos")
    .select("*, douyin_account:douyin_accounts(account_handle, niche, tier)")
    .eq("creator_id", req.profile.id)
    .order("submitted_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ videos: data });
});

// POST /api/videos — register metadata for a video already uploaded to Storage
router.post("/", authenticate, async (req, res) => {
  const { title, description, storage_path, douyin_account_id, cover_url } = req.body || {};

  if (!title || !storage_path || !douyin_account_id) {
    return res.status(400).json({ error: "请先租用套餐账户，并选择发布账户后再上传作品。" });
  }

  const { data: account, error: accountError } = await supabaseAdmin
    .from("douyin_accounts")
    .select("id, assigned_to, status")
    .eq("id", douyin_account_id)
    .single();

  if (accountError || !account) return res.status(404).json({ error: "发布账户不存在。" });
  if (account.assigned_to !== req.profile.id || account.status !== "assigned") {
    return res.status(403).json({ error: "只能使用已租用的套餐账户发布作品。" });
  }

  const { data, error } = await supabaseAdmin
    .from("videos")
    .insert({
      creator_id: req.profile.id,
      title,
      description: description || null,
      storage_path,
      cover_url: cover_url || null,
      douyin_account_id: douyin_account_id || null,
      status: "pending",
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ video: data });
});

// DELETE /api/videos/:id — creator can withdraw a submission while still pending
router.delete("/:id", authenticate, async (req, res) => {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("videos")
    .select("id, creator_id, status")
    .eq("id", req.params.id)
    .single();

  if (fetchError || !existing) return res.status(404).json({ error: "Video not found." });
  if (existing.creator_id !== req.profile.id) return res.status(403).json({ error: "Not your video." });
  if (existing.status !== "pending") {
    return res.status(400).json({ error: "Only pending videos can be withdrawn." });
  }

  const { error } = await supabaseAdmin.from("videos").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

module.exports = router;
