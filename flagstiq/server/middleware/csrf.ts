import type { Request, Response, NextFunction } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Header-based CSRF protection — requires `x-requested-with: fetch` on
 * mutating requests. This is sufficient for an SPA-only API because
 * browsers enforce CORS preflight on custom headers, preventing
 * cross-origin form submissions. If non-SPA clients (e.g. server-rendered
 * forms) are ever added, upgrade to token-based CSRF protection.
 */
export function csrfCheck(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  if (req.headers['x-requested-with'] === 'fetch') {
    return next();
  }

  res.status(403).json({ error: 'Missing CSRF header' });
}
