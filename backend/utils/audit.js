const { supabase } = require('../supabaseClient');

async function writeAudit(req, { action, targetUserId = null, meta = {} }) {
  try {
    const actor = req.user?.id || null;

    const ip =
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    const userAgent = req.headers['user-agent'] || null;

    await supabase.from('audit_logs').insert({
      actor_user_id: actor,
      action,
      target_user_id: targetUserId,
      meta,
      ip,
      user_agent: userAgent
    });
  } catch (e) {
    // non blocchiamo la richiesta se audit fallisce
    console.error('AUDIT ERROR:', e.message || e);
  }
}

module.exports = { writeAudit };
