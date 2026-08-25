const express = require("express");
const supabaseAdmin = require("../supabaseAdmin");
const authenticate = require("../middleware/auth");

const router = express.Router();

// GET /api/accounts/mine — accounts available to rent, plus any already assigned to this creator
router.get("/mine", authenticate, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("douyin_accounts")
    .select("*")
    .or(`status.eq.available,assigned_to.eq.${req.profile.id}`)
    .order("tier", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ accounts: data });
});

// POST /api/accounts/:id/rent — creator rents an available account package
router.post("/:id/rent", authenticate, async (req, res) => {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("douyin_accounts")
    .select("id, status, assigned_to")
    .eq("id", req.params.id)
    .single();

  if (fetchError || !existing) return res.status(404).json({ error: "Account package not found." });
  if (existing.assigned_to === req.profile.id) return res.json({ account: existing });
  if (existing.status !== "available" || existing.assigned_to) {
    return res.status(409).json({ error: "This account package has already been rented." });
  }

  const { data, error } = await supabaseAdmin
    .from("douyin_accounts")
    .update({ assigned_to: req.profile.id, status: "assigned" })
    .eq("id", req.params.id)
    .eq("status", "available")
    .is("assigned_to", null)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ account: data });
});

module.exports = router;
