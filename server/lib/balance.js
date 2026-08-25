const supabaseAdmin = require("../supabaseAdmin");

/**
 * Computes a creator's withdrawable balance:
 *   settled earnings (earnings_ledger) - paid withdrawals - pending/approved withdrawals
 */
async function getBalanceSummary(creatorId) {
  const [{ data: ledgerRows, error: ledgerError }, { data: withdrawalRows, error: withdrawalError }] = await Promise.all([
    supabaseAdmin.from("earnings_ledger").select("amount_cny").eq("creator_id", creatorId),
    supabaseAdmin.from("withdrawals").select("amount_cny, status").eq("creator_id", creatorId),
  ]);

  if (ledgerError) throw ledgerError;
  if (withdrawalError) throw withdrawalError;

  const totalSettled = (ledgerRows || []).reduce((sum, row) => sum + Number(row.amount_cny), 0);
  const totalPaid = (withdrawalRows || [])
    .filter((row) => row.status === "paid")
    .reduce((sum, row) => sum + Number(row.amount_cny), 0);
  const totalReserved = (withdrawalRows || [])
    .filter((row) => row.status === "pending" || row.status === "approved")
    .reduce((sum, row) => sum + Number(row.amount_cny), 0);

  const availableBalance = Math.max(0, totalSettled - totalPaid - totalReserved);

  return { totalSettled, totalPaid, totalReserved, availableBalance };
}

module.exports = { getBalanceSummary };
