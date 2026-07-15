const crypto = require('crypto');

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(a || '');
  const bufB = Buffer.from(b || '');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function internalAuth(req, res, next) {
  const provided = req.header('x-internal-key') || '';
  const expected = process.env.INTERNAL_API_KEY || '';
  const ok = expected.length > 0 && timingSafeEqualStrings(provided, expected);
  req.authOk = ok;

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    sessionId: req.body && req.body.sessionId,
    path: req.path,
    authOk: ok,
  }));

  if (!ok) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

module.exports = { internalAuth };
