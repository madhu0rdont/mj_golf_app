import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import kmlRouter from './kml.js';
import coursesRouter from './courses.js';
import holesRouter from './holes.js';
import hazardsRouter from './hazards.js';
import strategyRouter from './strategy.js';
import billingRouter from './billing.js';

const router = Router();
router.use(requireAdmin);

router.use('/', kmlRouter);
router.use('/', coursesRouter);
router.use('/', holesRouter);
router.use('/', hazardsRouter);
router.use('/', strategyRouter);
router.use('/', billingRouter);

export default router;
