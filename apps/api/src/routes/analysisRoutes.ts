import { Router } from 'express';
import {
  createAnalysis,
  getAnalysis,
  getAnalysisStatus,
  getAnalysisFindings,
  getAnalysisReport,
  exportAnalysisMarkdown,
  chatAnalysis,
  getAnalysisRagStatus,
  triggerAnalysisRagIndex,
  searchAnalysisRag,
} from '../controllers/analysisController';
import { listAnalyses, getDashboardStats } from '../controllers/historyController';
import {
  analysisCreateLimiter,
  chatLimiter,
  exportLimiter,
} from '../middleware/rateLimiters';

const router = Router();

// Stats & History
router.get('/stats', getDashboardStats);
router.get('/', listAnalyses);

// Analysis lifecycle with endpoint-specific abuse protection
router.post('/', analysisCreateLimiter, createAnalysis);
router.get('/:id', getAnalysis);
router.get('/:id/status', getAnalysisStatus);
router.get('/:id/findings', getAnalysisFindings);
router.get('/:id/report', getAnalysisReport);
router.get('/:id/export', exportLimiter, exportAnalysisMarkdown);
router.post('/:id/chat', chatLimiter, chatAnalysis);

// RAG Endpoints (authenticated & rate-limited)
router.get('/:id/rag/status', getAnalysisRagStatus);
router.post('/:id/rag/index', analysisCreateLimiter, triggerAnalysisRagIndex);
router.post('/:id/rag/search', chatLimiter, searchAnalysisRag);

export default router;

