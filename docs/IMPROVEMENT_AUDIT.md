# CodeSense AI — Comprehensive Code Audit & Readiness Assessment

**Audit Date:** October 10, 2026  
**Auditor Roles:** Principal Software Engineer, Senior AI/ML Engineer, Application Security Engineer, DevOps Engineer, Technical QA Lead  
**Target Repository:** `CodeSense AI` (Monorepo: `apps/api`, `apps/web`, `services/ml-service`, `packages/shared`)  
**Workspace:** `E:\CODESENSE AI`  
**Live Frontend:** `https://codesense-ai-iota.vercel.app/`  
**GitHub Repository:** `https://github.com/Fazlul105/CODESENSE-AI`  

---

## 1. Executive Summary & Baseline Verification

CodeSense AI is an AI-powered GitHub Code Review and Bug Detection Platform combining Babel AST deterministic static analysis, Python FastAPI Just-In-Time (JIT) defect risk estimation, and Google Gemini / LLM contextual assistance, delivered via an Express API, MongoDB Atlas, and a Next.js 14 dashboard.

### Baseline Verification (Prior to Any Modifications)
A full baseline verification was conducted against the active codebase:
- **Node.js / Express API (`apps/api`):** 20 Vitest unit and E2E tests executed and passed (`20/20 PASSED`).
- **MongoDB Atlas Connectivity:** Verified active connection to live Atlas cluster (`ac-27u2w17-shard-00-01.eh6zbag.mongodb.net`, database: `codesense_ai`).
- **Python ML Microservice (`services/ml-service`):** 5 Pytest tests executed via embedded runtime (`runtime/python.exe`) and passed (`5/5 PASSED`).
- **Production Monorepo Build:** Executed `npm run build` across all 3 workspaces (`@codesense/shared`, `@codesense/api`, `@codesense/web`); compiled cleanly without syntax or bundling errors.

Despite functional baseline builds, an in-depth architectural and security audit reveals **critical defects, misleading AI/ML claims, security vulnerabilities, and deployment gaps** that must be resolved for production readiness and professional portfolio credibility.

---

## 2. Confirmed Defects with File Paths and Line Numbers

### 2.1 Backend Security & Access Control

#### ISSUE-SEC-1: Unrestricted CORS Permissive Callback (CRITICAL)
- **File:** `apps/api/src/app.ts` (lines 16–32)
- **Confirmed Finding:** The CORS configuration contains an origin validation callback that checks a list of allowed origins, but unconditionally executes `return callback(null, true);` at line 28 for **any origin**, combined with `credentials: true`. This allows arbitrary third-party web origins to make authenticated credentialed requests to the API.
- **Priority:** CRITICAL
- **Planned Correction:** Restrict origin acceptance strictly to `config.frontendUrl`, designated production origins (`https://codesense-ai-iota.vercel.app`), and `localhost` strictly when `NODE_ENV === 'development'`. Explicitly reject unapproved browser origins (`callback(new Error('Not allowed by CORS'))` or `callback(null, false)`). Add automated tests for allowed vs rejected origins.

#### ISSUE-SEC-2: Missing Ownership Authorization & Multi-Tenant Isolation (CRITICAL)
- **Files:** `apps/api/src/routes/analysisRoutes.ts` (lines 16–27), `apps/api/src/controllers/analysisController.ts` (lines 209–419), `apps/api/src/routes/authRoutes.ts` (lines 7–17)
- **Confirmed Finding:**
  1. `GET /api/auth/me` always returns `{ isAuthenticated: false, user: null }` with mock data.
  2. `GET /api/analyses/:id`, `GET /:id/report`, `GET /:id/export`, and `POST /:id/chat` perform no user-ownership or repository-visibility verification. Any user possessing an `ObjectId` can retrieve private findings, export markdown reports, or invoke LLM chat.
  3. `AnalysisJob` and `AnalysisReport` records have an optional `user` field that is never populated in `createAnalysis` (`isAnonymous: true`).
- **Priority:** CRITICAL
- **Planned Correction:**
  1. Implement secure session/JWT authentication and complete GitHub OAuth callback handler (`/api/auth/callback`).
  2. Associate analysis records with authenticated users when logged in.
  3. Enforce access control: Private analyses and reports are only accessible by their owner.
  4. Explicit Anonymous Policy: Anonymous users can only analyze public GitHub repositories, subject to stricter rate limits and quotas.
  5. CSRF protection on state-changing cookie-authenticated endpoints.

#### ISSUE-SEC-3: Coarse Global Rate Limiting & Resource Abuse Exposure (HIGH)
- **Files:** `apps/api/src/app.ts` (lines 43–50), `apps/api/src/controllers/analysisController.ts` (lines 23–207)
- **Confirmed Finding:** Only a single global rate limiter exists (`120 req/min` across all `/api` endpoints). There are no specialized rate limiters for high-cost operations: creating analysis jobs (spawning Octokit + Babel + Python ML), sending Gemini requests (`POST /:id/chat`), or exporting reports. Furthermore, there is no limit on PR diff size, file count cutoff, or job timeout bounds during background execution.
- **Priority:** HIGH
- **Planned Correction:** Implement granular rate limiters using `express-rate-limit`:
  - Job creation: 5 requests per 15 minutes per IP (anonymous) / 30 per 15 minutes (authenticated).
  - LLM Chat: 15 requests per minute per IP.
  - Report export: 20 requests per 15 minutes per IP.
  - Enforce PR limits: max files analyzed (capped at 50), max patch size (500KB), and enforce an execution timeout (120s) with proper cancellation.

#### ISSUE-SEC-4: Sensitive Credential Leakage in Reports & LLM Context (HIGH)
- **Files:** `apps/api/src/analysis/rules/security.ts` (lines 154–178), `apps/api/src/analysis/analyzer.ts` (lines 92–97), `apps/api/src/services/llmService.ts` (lines 33–52, 190–215), `apps/api/src/controllers/analysisController.ts` (lines 331–376)
- **Confirmed Finding:** When `hardcoded-secret` detects leaked API keys, GitHub tokens, or private keys, the raw unmodified line is extracted into `codeSnippet` and stored verbatim in MongoDB, passed directly to Gemini LLM prompts, and included unredacted in Markdown exports.
- **Priority:** HIGH
- **Planned Correction:** Implement a robust secret redaction utility (`maskSecret(snippet)`). Redact recognized secrets (tokens, AWS keys, passwords, database URIs, private keys) before storing snippets in database, before sending to Gemini/LLM, and before exporting Markdown reports.

#### ISSUE-SEC-5: Diagnostic Data Leaks in Health & Error Responses (MEDIUM)
- **Files:** `apps/api/src/app.ts` (lines 58–60, 73–74, 115–123), `apps/api/src/services/llmService.ts` (lines 233–235, 263–264)
- **Confirmed Finding:**
  1. `GET /api/health` and `GET /api/system/status` return `databaseHost: mongoose.connection.host` (e.g. `ac-27u2w17-shard-00-01.eh6zbag.mongodb.net`), revealing the Atlas cluster hostname to unauthorized external callers.
  2. LLM error catch blocks return raw upstream error messages (`err.message`) containing provider URLs or stack fragments.
- **Priority:** MEDIUM
- **Planned Correction:** Sanitize `/api/health` and `/api/system/status` to only report connection state boolean (`connected: true/false`) without internal hostnames or connection strings. Standardize error handling to provide safe, actionable user messages with internal correlation IDs.

---

### 2.2 Database Layer (MongoDB Atlas)

#### ISSUE-DB-1: In-Memory Fallback Ambiguity (MEDIUM)
- **File:** `apps/api/src/database/db.ts` (lines 28–49)
- **Confirmed Finding:** While external `mongodb+srv://` URIs currently throw on failure, local fallback relies on detecting `mongodb+srv` in the string. If a local environment is configured without an explicit URI, it can still fall back to `MongoMemoryServer` without explicit user opt-in (`ALLOW_MEMORY_DB=true`).
- **Priority:** MEDIUM
- **Planned Correction:** Restrict `MongoMemoryServer` fallback strictly to automated testing (`NODE_ENV === 'test'`) or when `ALLOW_MEMORY_DB=true` is explicitly configured in `.env`. Any production or development deployment with a designated `MONGODB_URI` must fail fast and produce clear readiness probe failures on connection timeout.

#### ISSUE-DB-2: Missing Database Indexes for Multi-Tenant Lookups (LOW)
- **Files:** `apps/api/src/models/AnalysisJob.ts`, `apps/api/src/models/AnalysisReport.ts`, `apps/api/src/models/Repository.ts`
- **Confirmed Finding:** `AnalysisJob` lacks an index on `{ user: 1, createdAt: -1 }`. `AnalysisReport` lacks compound indexes for rapid user-scoped filtering.
- **Priority:** LOW
- **Planned Correction:** Add compound indexes `{ user: 1, createdAt: -1 }` and `{ isAnonymous: 1, createdAt: -1 }` on `AnalysisJob`.

---

### 2.3 Machine Learning Pipeline & Defect Prediction

#### ISSUE-ML-1: 100% Synthetic Training Dataset with Handcrafted Defect Labels (CRITICAL)
- **File:** `services/ml-service/app/training/dataset.py` (lines 17–81)
- **Confirmed Finding:** `dataset.py` generates artificial samples using NumPy distributions (`np.random.lognormal`, `np.random.beta`) and computes defect labels via a handcrafted mathematical formula (`log_odds = -2.8 + 0.0018*lines_added + ...`). The resulting model trained in `train.py` is trained purely on synthetic noise and cannot substantiate claims of real-world software regression prediction.
- **Priority:** CRITICAL
- **Planned Correction:**
  1. Integrate an authentic, documented, publicly licensed Just-In-Time (JIT) defect prediction benchmark dataset mined from real-world software repositories (e.g. Kamei et al. / Bennin et al. JIT defect datasets; open repository commits).
  2. Document provenance, licensing, sample count, defect rate, and feature schema.
  3. Re-train models (`LogisticRegression`, `RandomForest`, `HistGradientBoosting`) with reproducible train/val/test splits and evaluate genuine metrics (ROC-AUC, PR-AUC, F1, Precision, Recall, Confusion Matrix, Brier score calibration).

#### ISSUE-ML-2: Unscientific Entropy Calculation (HIGH)
- **File:** `apps/api/src/analysis/analyzer.ts` (lines 131, 139)
- **Confirmed Finding:** Change entropy is currently calculated as:
  ```typescript
  const distinctExts = new Set(files.map((f) => f.filename.split('.').pop() || '')).size;
  entropy = Math.min(1.0, (distinctExts / Math.max(1, pr.changedFilesCount)));
  ```
  This is the ratio of file extensions to changed files, NOT change distribution entropy. In software engineering literature (Hassan 2009, Kamei et al. 2013), change entropy measures how line modifications are distributed across changed files using Shannon entropy:
  $$H = -\sum_{i=1}^n p_i \log_2(p_i) \quad \text{normalized by} \quad \log_2(n)$$
  where $p_i = \frac{\text{churn}_i}{\sum \text{churn}}$.
- **Priority:** HIGH
- **Planned Correction:** Implement standard Shannon change entropy in `apps/api/src/analysis/analyzer.ts` and ensure the same calculation is mirrored in Python ML feature extraction.

#### ISSUE-ML-3: Global vs Local Feature Importance Explainability (HIGH)
- **File:** `services/ml-service/app/inference/predictor.py` (lines 78–85)
- **Confirmed Finding:** `top_contributing_features` returned in the prediction response sorts the model's **global** feature importances (`model.feature_importances_`) rather than computing the local feature contribution for the specific pull request being evaluated. As a result, every pull request receives identical risk factor explanations regardless of whether it modified 5 lines or 5,000 lines.
- **Priority:** HIGH
- **Planned Correction:** Implement local feature contribution calculation (local normalized feature z-score multiplied by model weight/importance) so that each PR explains its own specific drivers (e.g., high churn, concentrated entropy, or critical AST findings).

#### ISSUE-ML-4: Misleading Blended Risk Presentation & Unsubstantiated Claims (HIGH)
- **File:** `apps/api/src/analysis/analyzer.ts` (lines 154–185)
- **Confirmed Finding:**
  1. The code calculates a hardcoded blend: `60% ML Model + 40% Static Heuristic`, claiming it represents the overall defect risk score.
  2. Summary string states: `"${mlData.defect_probability * 100}% probability of introducing a regression."`
  3. Conflates static security vulnerabilities with regression probability.
- **Priority:** HIGH
- **Planned Correction:**
  1. Clearly separate assessments: Heuristic Code-Change Risk Score, Experimental ML Defect-Risk Estimate, and Deterministic Static Analysis Findings.
  2. Label ML estimates as "Experimental ML Defect-Risk Estimate (JIT Benchmark Model)" with clearly disclosed limitations and calibrated confidence intervals.
  3. Ensure high defect risk is not falsely equated with confirmed security vulnerabilities.

---

### 2.4 AST Static Code Analysis Subsystem

#### ISSUE-AST-1: Limited Security Vulnerability Detection Coverage (HIGH)
- **Files:** `apps/api/src/analysis/rules/security.ts` (lines 17–179)
- **Confirmed Finding:** Current security rules only detect: `eval()`, `new Function()`, `setTimeout/setInterval` with string, React `dangerouslySetInnerHTML`, `innerHTML` assignment, and 5 basic secret regex patterns.
- **Missing Rules Required for Real-World SAST:**
  1. **OS Command Injection:** `child_process.exec`, `execSync`, `spawn` with `{ shell: true }`.
  2. **SQL / NoSQL Injection:** Unparameterized SQL queries via string concatenation or template literals (`query("SELECT ... " + x)`), unsafe MongoDB query operators (`$where`, passing raw `req.body` to `.find()`).
  3. **Sensitive Information Exposure:** Logging password, token, authorization headers, or secret environment variables in `console.log` / `logger`.
  4. **Cryptographic Weaknesses:** Insecure hashing algorithms (`MD5`, `SHA1`) for security-sensitive purposes, hardcoded cryptographic keys/IVs, `Math.random()` used for token or ID generation.
  5. **Broken Authorization:** Trusting client-controlled roles (`req.body.role`, `req.headers['x-role']`) for access control decisions.
  6. **Unsafe Deserialization:** `serialize.unserialize()`, unsafe YAML loading.
  7. **Server-Side Request Forgery (SSRF):** Passing unvalidated user input or parameters to `axios.get(req.query.url)` / `fetch(req.body.url)`.
- **NodeGoat PR #437 Fixture Verification:** As evidenced by `codesense-review-NodeGoat-pr437.md`, CodeSense previously flagged 13 issues on OWASP NodeGoat PR #437, of which 12 were generic `no-console-log` informational warnings, missing actual password logging, secret env leaks, and client-controlled role authorization bypasses.
- **Priority:** HIGH
- **Planned Correction:** Implement modular, high-precision AST security rules in `apps/api/src/analysis/rules/security.ts` covering OS command injection, SQL/NoSQL injection, sensitive data logging, insecure cryptography, client-controlled authorization, and SSRF patterns, with unit test fixtures and validation against NodeGoat PR #437.

---

### 2.5 Gemini AI Integration

#### ISSUE-AI-1: Inverted Risk Terminology in LLM Prompts (HIGH)
- **File:** `apps/api/src/services/llmService.ts` (line 197)
- **Confirmed Finding:** The system prompt explicitly formats:
  ```text
  - Overall Code Quality Score: ${overallScore}/100
  ```
  However, `overallScore` is calculated as a **Defect Risk Score** (0 = clean, 100 = critical risk). Telling Gemini that an 85/100 risk PR has an "Overall Code Quality Score: 85/100" inverts the semantic meaning and leads the AI to praise severely buggy code as high quality!
- **Priority:** HIGH
- **Planned Correction:** Correct the prompt to `- Overall Defect Risk Score: ${overallScore}/100 (Higher indicates greater risk)`. Review all prompts and UI strings to ensure risk and quality terminology are strictly differentiated.

#### ISSUE-AI-2: Truncated Context & Lack of Relevance-Based Retrieval (HIGH)
- **File:** `apps/api/src/services/llmService.ts` (lines 169–177)
- **Confirmed Finding:** The assistant context generator truncates findings to `analysisContext.findings.slice(0, 20)`. If a PR contains 30 findings and the user asks about a finding in file #25, the finding is completely absent from the prompt, causing Gemini to either hallucinate or claim the issue does not exist.
- **Priority:** HIGH
- **Planned Correction:** Implement bounded relevance-based retrieval: Match the user's question against finding titles, rule IDs, file paths, and snippets, ranking relevant items into context, while providing a clear summary of all remaining findings.

#### ISSUE-AI-3: Conflation of Deterministic Findings vs AI Hypotheses (MEDIUM)
- **File:** `apps/api/src/services/llmService.ts` (lines 190–215)
- **Confirmed Finding:** Prompt instructions do not explicitly enforce the distinction between deterministic AST rule matches and LLM-inferred security observations, risking confident hallucinations of non-existent bugs.
- **Priority:** MEDIUM
- **Planned Correction:** Add structured prompt framing separating deterministic AST findings from AI reasoning, and enforce that the assistant explicitly identifies the evidence type (deterministic vs inferred).

---

### 2.6 Frontend Accuracy & UX

#### ISSUE-FE-1: Metric Grid Omits Informational Severities (MEDIUM)
- **File:** `apps/web/src/app/analysis/[id]/page.tsx` (lines 198–223)
- **Confirmed Finding:** The metric breakdown cards display Critical, High, Medium, Low, and Files Analyzed, but omit the "Informational" category entirely, even though findings and filter dropdowns include Informational findings.
- **Priority:** MEDIUM
- **Planned Correction:** Add the Informational severity metric card to complete all 5 severities.

#### ISSUE-FE-2: Misleading Empty States & Missing Coverage Indicators (MEDIUM)
- **File:** `apps/web/src/app/analysis/[id]/page.tsx` (lines 328–350)
- **Confirmed Finding:**
  1. The file filter list only displays files that have detected findings (`affectedFiles`), giving no visibility into which files were analyzed or skipped due to unsupported languages/binary formats.
  2. The empty state for zero findings simply states "No issues flagged in files", which can mislead developers into believing unanalyzed files are clean.
- **Priority:** MEDIUM
- **Planned Correction:** Display analysis coverage (e.g. "Analyzed X of Y changed files"), list skipped/unsupported file types with reasons, and provide a clear, honest empty state clarifying what was analyzed.

---

### 2.7 Deployment & Infrastructure

#### ISSUE-OPS-1: Hardcoded URLs & Docker Compose Networking (HIGH)
- **Files:** `docker-compose.yml` (lines 20–47), `apps/web/Dockerfile` (line 41)
- **Confirmed Finding:**
  1. `docker-compose.yml` passes `NEXT_PUBLIC_API_URL=http://localhost:5001/api` into web build args, which breaks when deployed to remote staging/production hosts.
  2. Container healthchecks are absent for `ml-service`, `api`, and `web`.
- **Priority:** HIGH
- **Planned Correction:** Configure dynamic environment variables for API endpoints, add Docker Compose container healthchecks, and ensure production CORS aligns with the Vercel frontend.

---

## 3. Prioritized Remediation Roadmap

```
Phase 1: Backend Security & Access Control (CORS, Auth, Session, Rate Limiting, Redaction, Error Sanitization)
Phase 2: Database Layer Hardening (MongoDB Atlas Fail-Safe, Multi-Tenant Query Scoping, Indexes)
Phase 3: Machine Learning Real Data & Evaluation (Authentic JIT Dataset, Shannon Entropy, Local SHAP/Contributions, Calibrated Risk)
Phase 4: AST Static Analysis Enhancement (NodeGoat PR #437 Fixtures, OS Exec, SQLi, NoSQLi, Crypto, Auth, Sensitive Logging)
Phase 5: Gemini AI Grounding & Terminology Correction (Prompt Fixes, Relevance Retrieval, Security Reasoning)
Phase 6: Frontend Polish & Accurate Metrics (All 5 Severities, Coverage Badges, Disclosed Risk Presentation)
Phase 7: Deployment Hardening (Docker Compose Healthchecks, Vercel/Render Config, Secrets Separation)
Phase 8: Comprehensive Automated Testing (API, AST, ML, Gemini, Frontend)
Phase 9: Repository Documentation Overhaul (README, ARCHITECTURE, SECURITY, ML_EVALUATION, DEPLOYMENT)
Phase 10: End-to-End Verification & Final Improvement Report
```
