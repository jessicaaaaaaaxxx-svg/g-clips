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

module.exports = router;
