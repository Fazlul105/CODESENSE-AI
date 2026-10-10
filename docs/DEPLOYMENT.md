# CodeSense AI — Production Deployment & DevOps Guide

## 1. Production Architecture Overview

CodeSense AI is designed for seamless deployment across modern cloud platforms:

| Component | Target Platform | Runtime | Key Config |
| :--- | :--- | :--- | :--- |
| **Frontend Web App** | Vercel | Next.js 14 Serverless | `NEXT_PUBLIC_API_URL` |
| **Backend REST API** | Render / Railway / AWS ECS | Node.js 20 LTS | `MONGODB_URI`, `FRONTEND_URL`, `GEMINI_API_KEY` |
| **ML Inference Service**| Render / Fly.io / AWS | Python 3.11 + Uvicorn | `PORT=8000` |
| **Database Cluster** | MongoDB Atlas | Managed NoSQL | M0 / M10 Dedicated Tier |

---

## 2. Environment Variable Configuration

### 2.1 Backend API (`apps/api`)
```env
NODE_ENV=production
API_PORT=5001
FRONTEND_URL=https://codesense-ai-iota.vercel.app
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/codesense_ai?retryWrites=true&w=majority
ALLOW_MEMORY_DB=false
GITHUB_TOKEN=<your_github_token>
GITHUB_CLIENT_ID=<your_oauth_client_id>
GITHUB_CLIENT_SECRET=<your_oauth_client_secret>
SESSION_SECRET=<cryptographically_secure_random_string_min_32_chars>
AI_PROVIDER=gemini
GEMINI_API_KEY=<your_gemini_api_key>
GEMINI_MODEL=gemini-3.8-flash
ML_SERVICE_URL=https://codesense-ml-service.onrender.com
```

### 2.2 Frontend Web App (`apps/web`)
```env
NEXT_PUBLIC_API_URL=https://codesense-api-fazlul.onrender.com/api
```

### 2.3 ML Microservice (`services/ml-service`)
```env
PORT=8000
```

---

## 3. Platform Deployment Guides

### 3.1 Vercel Frontend Deployment
1. Import repository on [Vercel](https://vercel.com).
2. Set Root Directory to `apps/web`.
3. Add Environment Variable:
   - `NEXT_PUBLIC_API_URL`: Set to production API URL (e.g., `https://codesense-api-fazlul.onrender.com/api`).
4. Framework Preset: Next.js.
5. Deploy.

### 3.2 Render Backend API Deployment
1. Create a new **Web Service** on [Render](https://render.com).
2. Root Directory: `.`
3. Build Command: `npm ci && npm run build --workspace=@codesense/shared && npm run build --workspace=@codesense/api`
4. Start Command: `node apps/api/dist/index.js`
5. Configure Environment Variables as specified in section 2.1.
6. Health Check Path: `/api/health`.

### 3.3 Render ML Microservice Deployment
1. Create a new **Web Service** on Render.
2. Root Directory: `services/ml-service`
3. Build Command: `pip install --no-cache-dir -r requirements.txt`
4. Start Command: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
5. Health Check Path: `/health`.

---

## 4. Docker Compose Multi-Container Orchestration

For self-hosted, on-premise, or containerized environments, CodeSense AI includes a production-ready `docker-compose.yml`:

```bash
# Build and start all three services with networking and healthchecks
docker-compose up --build -d
```

### Healthcheck Specifications
- `ml-service`: HTTP GET to `http://localhost:8000/health` every 15s.
- `api`: HTTP GET to `http://localhost:5001/api/health` every 15s (starts only after `ml-service` is healthy).
- `web`: Depends on `api` becoming healthy before accepting traffic on port 3000.

---

## 5. Job Execution & Queue Worker Architecture

### Current Implementation: In-Process Asynchronous Pipeline
- The Express controller returns an immediate `202 Accepted` response with the unique `analysisId`.
- An asynchronous pipeline execution is spawned in the background with an explicit timeout guard (`config.limits.analysisTimeoutMs = 120000`).
- State is continuously updated in MongoDB Atlas (`in_progress`, `progressPercent`, `statusMessage`).
- The frontend client polls `/api/analyses/:id/status` at 1.5-second intervals until completion.

### Future Scaling Recommendation: Durable BullMQ Worker
For heavy multi-tenant production scaling ($> 100$ concurrent jobs/min):
- Introduce Redis + BullMQ.
- Move `analyzePullRequest` into a dedicated worker process pool.
- This preserves the current API contract without requiring immediate infrastructure changes for the portfolio scope.
