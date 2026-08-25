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

  if (!title || !storage_path) {
    return res.status(400).json({ error: "title and storage_path are required." });
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
