# CodeSense AI — Automated Testing & Quality Assurance Guide

## 1. Overview & Testing Philosophy

CodeSense AI implements an automated, multi-tiered test suite spanning TypeScript unit testing, static AST analysis fixtures, end-to-end integration with live MongoDB Atlas, and Python machine learning inference validation.

**Core Quality Principle:** Tests run against actual business logic and real databases; mock bypasses are avoided wherever possible to guarantee production fidelity.

---

## 2. Test Suite Summary

| Test Suite | Framework | Location | Test Count | Status |
| :--- | :--- | :--- | :---: | :---: |
| **AST & SAST Rules** | Vitest | `apps/api/src/analysis/analyzer.test.ts` | 27 tests | **PASSED** |
| **Secret Redaction** | Vitest | `apps/api/src/utils/redact.test.ts` | 6 tests | **PASSED** |
| **Security & Access Control** | Vitest | `apps/api/src/security.e2e.test.ts` | 5 tests | **PASSED** |
| **End-to-End Pipeline** | Vitest + Supertest | `apps/api/src/app.e2e.test.ts` | 4 tests | **PASSED** |
| **ML Inference & Validation**| Pytest | `services/ml-service/tests/test_ml_service.py` | 5 tests | **PASSED** |
| **Monorepo Build** | Next.js + TSC | All packages | 10 pages | **PASSED** |
| **Total Automated Tests** | — | — | **47 tests** | **100% PASS** |

---

## 3. Running the Test Suites

### 3.1 Node.js / Express Backend Suites
Run all 42 backend test suites using Vitest:

```bash
# From workspace root
npm run test:api
```

### 3.2 Python ML Microservice Test Suite
Run the 5 Pytest unit and regression tests:

```bash
# Windows
cd services/ml-service
.\runtime\python.exe -m pytest tests/

# Linux / macOS
cd services/ml-service
python3 -m pytest tests/
```

### 3.3 Monorepo Production Build Verification
Verify type checking and production builds across `@codesense/shared`, `@codesense/api`, and `@codesense/web`:

```bash
# From workspace root
npm run build
```

---

## 4. Key Test Coverage Details

### 4.1 SAST Security Rules (`analyzer.test.ts`)
- **OS Command Injection:** Validates detection of `exec(cmd)` and `spawn` with untrusted shell interpolation.
- **SQL Injection:** Validates detection of template literals and concatenations in SQL query sinks.
- **Secret Environment Leaks:** Verifies that exposing variables named `*_SECRET_*`, `*_TOKEN_*`, or `*_KEY_*` triggers critical findings.
- **Sensitive Logging:** Verifies interception of `console.log(password)` and `console.error(authToken)`.
- **Insecure Cryptography:** Verifies that MD5 and SHA-1 hashing trigger warnings.
- **Client-Controlled Roles:** Verifies that `const role = req.body.role; if (role == 'admin')` triggers an authorization bypass finding.
- **OWASP NodeGoat PR #437 Fixture:** Validates that the analyzer intercepts realistic intentional vulnerabilities introduced in the NodeGoat benchmark PR.

### 4.2 Secret Redaction Suite (`redact.test.ts`)
- **GitHub PATs:** Confirms masking of `ghp_...` tokens.
- **AWS Keys:** Confirms masking of `AKIA...` access keys.
- **Private Keys:** Confirms masking of `-----BEGIN RSA PRIVATE KEY-----` blocks.
- **Connection Strings:** Confirms masking of user credentials in MongoDB, PostgreSQL, and MySQL URIs.
- **Deep Object Traversal:** Verifies recursive sanitization of nested JSON structures.

### 4.3 Security & Access Control Suite (`security.e2e.test.ts`)
- **CORS Allowed Origins:** Verifies that requests with `Origin: http://localhost:3000` receive `Access-Control-Allow-Origin`.
- **CORS Rejected Origins:** Verifies that unauthorized third-party origins receive no allow headers.
- **Anonymous Access Restrictions:** Verifies that anonymous users are blocked from private repository analyses.
- **Ownership Isolation:** Verifies that private jobs created by one user return `403 Forbidden` to unauthenticated callers.
- **Rate Limit Headers:** Verifies the presence of `RateLimit-*` headers on API responses.

### 4.4 ML Inference Suite (`test_ml_service.py`)
- **Healthcheck & Model Loading:** Verifies `/health` returns `model_loaded: true` with the active model architecture.
- **Metrics Verification:** Verifies `/metrics` exposes Kamei benchmark statistics.
- **Low-Risk PR Prediction:** Validates that small changes (12 lines added, 1 file) yield low defect probabilities ($< 0.50$).
- **High-Risk PR Prediction:** Validates that large, high-entropy changes yield high defect probabilities ($> 0.50$).
- **Pydantic Validation:** Verifies that invalid inputs (negative line churn, 0 files changed) produce `422 Unprocessable Entity`.
