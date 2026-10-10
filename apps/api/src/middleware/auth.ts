import { Request, Response, NextFunction } from 'express';
import { User, IUser, AnalysisJob, IAnalysisJob, Repository } from '../models';

declare global {
  namespace Express {
    interface Request {
      user?: IUser | null;
    }
  }
}

/**
 * Middleware to resolve the current user from session or Bearer token
 */
export async function attachUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionUserId = (req.session as any)?.userId;
    const authHeader = req.headers.authorization;

    let userId: string | null = null;

    if (sessionUserId) {
      userId = sessionUserId;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      // Allow API clients / integration tests to pass userId or token directly
      userId = authHeader.slice(7).trim();
    }

    if (userId) {
      const user = await User.findById(userId);
      if (user) {
        req.user = user;
      }
    }
  } catch (err) {
    // If user resolution fails, proceed as anonymous
  }
  next();
}

/**
 * Middleware to require authenticated user
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. Please log in with GitHub to access this resource.',
    });
    return;
  }
  next();
}

/**
 * Checks if the caller is authorized to view or interact with an analysis job.
 * - Anonymous / public jobs on public repositories are accessible to anyone.
 * - Private repository analyses are restricted strictly to the creator.
 */
export async function canAccessAnalysis(
  job: IAnalysisJob,
  user?: IUser | null
): Promise<{ allowed: boolean; reason?: string }> {
  // If the job belongs to a user and has private flag
  const repo = await Repository.findById(job.repository);
  const isPrivateRepo = repo?.isPrivate === true;

  if (isPrivateRepo) {
    if (!user) {
      return { allowed: false, reason: 'This analysis involves a private repository and requires authentication.' };
    }
    if (!job.user || job.user.toString() !== user._id.toString()) {
      return { allowed: false, reason: 'You do not have permission to view this private analysis.' };
    }
  }

  return { allowed: true };
}
