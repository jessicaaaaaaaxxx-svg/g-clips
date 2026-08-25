const express = require("express");
const supabaseAdmin = require("../supabaseAdmin");
const authenticate = require("../middleware/auth");
const { getBalanceSummary } = require("../lib/balance");

const router = express.Router();

const ALLOWED_METHODS = ["paypal", "bank_transfer", "alipay"];

// GET /api/withdrawals/mine — the creator's own withdrawal history
router.get("/mine", authenticate, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("withdrawals")
    .select("*")
    .eq("creator_id", req.profile.id)
    .order("requested_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ withdrawals: data });
});

// POST /api/withdrawals — request a payout
router.post("/", authenticate, async (req, res) => {
  const { amount_cny, method, account_details } = req.body || {};
  const amount = Number(amount_cny);

  if (!amount || amount <= 0) return res.status(400).json({ error: "amount_cny must be greater than 0." });
  if (!ALLOWED_METHODS.includes(method)) {
    return res.status(400).json({ error: `method must be one of: ${ALLOWED_METHODS.join(", ")}` });
  }
  if (!account_details || typeof account_details !== "object") {
    return res.status(400).json({ error: "account_details object is required." });
  }

  try {
    const balance = await getBalanceSummary(req.profile.id);
    if (amount > balance.availableBalance) {
      return res.status(400).json({
        error: `Requested amount exceeds available balance (¥${balance.availableBalance.toFixed(2)}).`,
      });
    }

    const { data, error } = await supabaseAdmin
      .from("withdrawals")
      .insert({
        creator_id: req.profile.id,
        amount_cny: amount,
        method,
        account_details,
        status: "pending",
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ withdrawal: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
