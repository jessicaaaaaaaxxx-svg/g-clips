const express = require("express");
const supabaseAdmin = require("../supabaseAdmin");
const authenticate = require("../middleware/auth");
const { getBalanceSummary } = require("../lib/balance");

const router = express.Router();

// GET /api/earnings/summary — overview numbers + recent ledger entries for the dashboard
router.get("/summary", authenticate, async (req, res) => {
  try {
    const [{ data: videos, error: videosError }, { data: ledger, error: ledgerError }, balance] = await Promise.all([
      supabaseAdmin
        .from("videos")
        .select("views, likes, comments, shares, estimated_earnings_cny, status")
        .eq("creator_id", req.profile.id),
      supabaseAdmin
        .from("earnings_ledger")
        .select("id, amount_cny, note, created_at, video_id")
        .eq("creator_id", req.profile.id)
        .order("created_at", { ascending: false })
        .limit(20),
      getBalanceSummary(req.profile.id),
    ]);

    if (videosError) throw videosError;
    if (ledgerError) throw ledgerError;

    const totals = (videos || []).reduce(
      (acc, v) => {
        acc.totalViews += Number(v.views);
        acc.totalLikes += Number(v.likes);
        acc.totalComments += Number(v.comments);
        acc.totalShares += Number(v.shares);
        acc.totalEstimated += Number(v.estimated_earnings_cny);
        if (v.status === "published") acc.publishedCount += 1;
        return acc;
      },
      { totalViews: 0, totalLikes: 0, totalComments: 0, totalShares: 0, totalEstimated: 0, publishedCount: 0 }
    );

    res.json({
      totals,
      balance,
      recentLedger: ledger,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
