# CodeSense AI — Application Security & Vulnerability Policy

## 1. Security Architecture & Threat Model

CodeSense AI is designed to analyze potentially untrusted, vulnerable, or malicious third-party pull requests without compromising server infrastructure, exposing sensitive tokens, or leaking credentials.

---

## 2. Core Security Controls

### 2.1 Strict CORS Configuration (`apps/api/src/app.ts`)
- **Permissive Wildcards Prohibited:** CORS origin callback strictly validates inbound browser requests against an allowlist.
- **Configurable Origins:**
  - `config.frontendUrl` (e.g., `https://codesense-ai-iota.vercel.app`).
  - Production Vercel canonical URL (`https://codesense-ai-iota.vercel.app`).
  - Localhost ports (`http://localhost:3000`, `http://localhost:5001`) enabled strictly in `development` and `test` environments.
- **Credential Protection:** `credentials: true` is paired with explicit origin echoing; unauthorized origins receive no CORS allow headers and are rejected.

### 2.2 Access Control & Ownership Isolation (`apps/api/src/middleware/auth.ts`)
- **Public vs. Private Repository Restrictions:**
  - Anonymous users are restricted strictly to analyzing public GitHub repositories.
  - Private repository analysis requires user authentication via GitHub OAuth.
- **Report & Chat Isolation:**
  - Analysis jobs associated with private repositories or authenticated users are strictly isolated.
  - Unauthorized callers attempting to read private records receive `403 Forbidden`.

### 2.3 Multi-Tier Rate Limiting (`apps/api/src/middleware/rateLimiters.ts`)
To prevent API abuse and resource exhaustion, separate rate limits are enforced:
- **General API Limiter:** 120 requests per minute per IP.
- **Analysis Creation Limiter:** 10 analysis jobs per 15 minutes per IP.
- **AI Chat Limiter:** 20 queries per 15 minutes per IP (protects Gemini API quota).
- **Report Export Limiter:** 30 export downloads per 15 minutes per IP.
- Standardized `RateLimit-*` RFC headers are returned on all responses.

### 2.4 Centralized Secret Redaction (`apps/api/src/utils/redact.ts`)
CodeSense AI inspects repositories that may contain leaked credentials. Before any findings, snippets, logs, or LLM prompts are processed, values are sanitized:
- **GitHub Personal Access Tokens:** Masked to `ghp_****...`.
- **AWS Access Key IDs:** Masked to `AKIA****...`.
- **Private Cryptographic Keys:** Redacted to `[REDACTED_PRIVATE_KEY_CONTENT]`.
- **Database Connection Strings:** Masked to `[REDACTED_USER]:[REDACTED_PASSWORD]@`.
- **JWT Tokens:** Obfuscated to `[REDACTED_JWT_TOKEN]`.
- **Object-level Deep Masking:** JSON payloads traversing `redactObject` automatically mask properties named `password`, `secret`, `token`, `apiKey`, or `authorization`.

---

## 3. AST Static Code Analysis (SAST) Rule Suite

The deterministic AST engine runs in memory without executing or evaluating analyzed code:

| Rule ID | Severity | Category | Vulnerability Targeted |
| :--- | :--- | :--- | :--- |
| `no-unsafe-child-process` | Critical | Security | OS Command Injection (`exec`, untrusted shell args) |
| `no-sql-injection` | High | Security | SQL queries concatenated with untrusted request inputs |
| `no-secret-env-leak` | Critical | Security | Sensitive environment keys exposed in responses/logs |
| `no-sensitive-logging` | High | Security | Passwords, tokens, or credentials logged to stdout |
| `no-insecure-hash` | Medium | Security | Insecure MD5 or SHA-1 hashes used in security contexts |
| `no-client-controlled-role`| High | Security | Trusting client request body role for authorization |
| `no-ssrf` | High | Security | Unvalidated outbound HTTP calls with untrusted URLs |
| `no-eval-or-function` | Critical | Security | Dynamic string-to-code execution via `eval` |
| `no-dangerous-dom-html` | High | Security | Client-side XSS via `innerHTML` / `outerHTML` |

### OWASP NodeGoat PR #437 Benchmark Evaluation
CodeSense AI was evaluated against the canonical OWASP NodeGoat pull request #437 fixture:
- **Previous Finding Baseline:** 13 findings (predominantly generic `no-console-log` alerts, missing critical vulnerability patterns).
- **Current Verified Baseline:** Correctly flags password logging, secret environment variable leakage, and client-controlled role authorization bypass (`role == 'admin'`).

---

## 4. LLM Prompt Injection & Grounding Defenses

- **Untrusted Code Delimitation:** All pull request diffs and user prompts passed to Gemini 3.8 Flash are framed within `<untrusted_code_context>` and `<untrusted_user_query>` tags.
- **Separation of Facts from Hypotheses:** LLM prompts strictly instruct the model to treat AST deterministic rule matches as verified facts while labeling LLM deductions as potential contextual hypotheses.
- **Bounded Retrieval:** Context retrieval is bounded to the top relevant findings and changed diff hunks rather than dumping arbitrary raw text into LLM prompts.

---

## 5. Responsible Disclosure

To report security vulnerabilities in CodeSense AI, please email the maintainer or open a private GitHub security advisory.
