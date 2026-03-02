import type { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.authenticated && req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session?.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
  }
}

export function requirePlayer(req: Request, res: Response, next: NextFunction) {
  if (req.session?.role === 'player') {
    next();
  } else {
    res.status(403).json({ error: 'Player access required' });
  }
}
