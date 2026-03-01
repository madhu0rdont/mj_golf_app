import type { Request, Response, NextFunction } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfCheck(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  if (req.headers['x-requested-with'] === 'fetch') {
    return next();
  }

  res.status(403).json({ error: 'Missing CSRF header' });
}
