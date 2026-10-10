import { Router } from 'express';
import {
  createAnalysis,
  getAnalysis,
  getAnalysisStatus,
  getAnalysisFindings,
  getAnalysisReport,
  exportAnalysisMarkdown,
  chatAnalysis,
} from '../controllers/analysisController';
import { listAnalyses, getDashboardStats } from '../controllers/historyController';

const router = Router();

// Stats & History
router.get('/stats', getDashboardStats);
router.get('/', listAnalyses);

// Analysis lifecycle
router.post('/', createAnalysis);
router.get('/:id', getAnalysis);
router.get('/:id/status', getAnalysisStatus);
router.get('/:id/findings', getAnalysisFindings);
router.get('/:id/report', getAnalysisReport);
router.get('/:id/export', exportAnalysisMarkdown);
router.post('/:id/chat', chatAnalysis);

export default router;
