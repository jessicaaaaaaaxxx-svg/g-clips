/**
 * Must run after the `authenticate` middleware (needs req.profile).
 */
module.exports = function requireAdmin(req, res, next) {
  if (!req.profile || req.profile.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
};
