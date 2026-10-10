import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

import { config } from '../config';
import { fetchPullRequestMetadata, fetchPullRequestFiles } from '../integrations/github';
import { indexAnalysisSourceCode, getIndexingStatus } from './indexingService';
import { retrieveRelevantCode } from './retriever';
import { CodeChunk } from './models/CodeChunk';
import { askAssistantQuestion } from '../services/llmService';

interface EvalQuestion {
  category: string;
  question: string;
  expectedFilePattern: string;
}

const BENCHMARK_QUESTIONS: EvalQuestion[] = [
  {
    category: 'Role-Based Authorization',
    question: 'Does this pull request introduce an authorization vulnerability or trust client-controlled roles?',
    expectedFilePattern: 'extended.js',
  },
  {
    category: 'Sensitive Data Logging',
    question: 'Are there any sensitive data logging or credential exposure issues in these changes?',
    expectedFilePattern: 'logging.js',
  },
  {
    category: 'NoSQL / SQL Injection',
    question: 'Does the modified code contain SQL or NoSQL injection vulnerabilities when handling user input?',
    expectedFilePattern: 'api.js',
  },
  {
    category: 'Non-Vulnerable Logic',
    question: 'Does the code safely handle standard package configuration and module exports?',
    expectedFilePattern: 'api.js',
  },
];

async function runEvaluation() {
  console.log('================================================================');
  console.log('CodeSense AI — Live RAG Pipeline & Benchmark Evaluation');
  console.log('Target: OWASP/NodeGoat PR #437');
  console.log('================================================================\n');

  // 1. Connect to MongoDB Atlas
  console.log('[1/5] Connecting to MongoDB Atlas...');
  await mongoose.connect(config.mongodbUri);
  console.log('Connected to MongoDB:', mongoose.connection.name);

  // 2. Fetch Pull Request Metadata & Files from GitHub
  console.log('\n[2/5] Fetching GitHub PR data for OWASP/NodeGoat#437...');
  const prMeta = await fetchPullRequestMetadata('OWASP', 'NodeGoat', 437, config.github.token);
  console.log(`PR Title: "${prMeta.title}"`);
  console.log(`Head SHA: ${prMeta.headSha}`);
  console.log(`Additions: ${prMeta.additions}, Deletions: ${prMeta.deletions}`);

  const files = await fetchPullRequestFiles('OWASP', 'NodeGoat', 437, config.github.token);
  console.log(`Changed files count: ${files.length}`);
  files.forEach((f) => console.log(` - ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`));

  // 3. Index Source Code Chunks with Gemini Embeddings into MongoDB Atlas
  const simulatedAnalysisId = new mongoose.Types.ObjectId().toString();
  console.log(`\n[3/5] Indexing PR source code chunks (Analysis ID: ${simulatedAnalysisId})...`);

  // Enable RAG for evaluation run
  (config as any).rag.enabled = true;

  const t0Index = Date.now();
  const indexResult = await indexAnalysisSourceCode({
    analysisId: simulatedAnalysisId,
    prMeta,
    files,
    isPrivateRepo: false,
    token: config.github.token,
  });
  const indexDuration = Date.now() - t0Index;

  console.log(`Indexing completed in ${indexDuration}ms:`);
  console.log(` - Files processed: ${indexResult.filesProcessed}`);
  console.log(` - Chunks created: ${indexResult.chunksCreated}`);
  console.log(` - Chunks skipped: ${indexResult.chunksSkipped}`);
  if (indexResult.errors.length > 0) {
    console.log(` - Errors: ${indexResult.errors.join(', ')}`);
  }

  const storedChunks = await CodeChunk.find({ analysisId: new mongoose.Types.ObjectId(simulatedAnalysisId) });
  console.log(`Verified stored CodeChunk documents in MongoDB: ${storedChunks.length}`);
  if (storedChunks.length > 0) {
    console.log(`Sample Chunk:`);
    console.log(`  File: ${storedChunks[0].filePath}:${storedChunks[0].startLine}-${storedChunks[0].endLine}`);
    console.log(`  Symbol: ${storedChunks[0].symbolName || 'N/A'}`);
    console.log(`  Type: ${storedChunks[0].chunkType}`);
    console.log(`  Embedding Dimension: ${storedChunks[0].embedding?.length || 0}`);
  }

  // 4. Run Retrieval & Evaluation on Benchmark Questions
  console.log('\n[4/5] Running Retrieval Quality Evaluation...');
  const evalResults: any[] = [];

  for (const item of BENCHMARK_QUESTIONS) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`Benchmark Category: [${item.category}]`);
    console.log(`Question: "${item.question}"`);

    // Semantic + Keyword Retrieval
    const t0Ret = Date.now();
    const retResult = await retrieveRelevantCode({
      question: item.question,
      analysisId: simulatedAnalysisId,
      repository: 'OWASP/NodeGoat',
      commitSha: prMeta.headSha,
      topK: 4,
    });
    const retrievalLatency = Date.now() - t0Ret;

    console.log(`Retrieved ${retResult.chunks.length} chunks via ${retResult.searchMethod} in ${retrievalLatency}ms:`);
    retResult.chunks.forEach((c, idx) => {
      console.log(`  ${idx + 1}. [Score: ${c.score}] ${c.filePath}:${c.startLine}-${c.endLine} (${c.matchSource}) - ${c.symbolName || c.chunkType}`);
    });

    // Check Recall: Did retrieved chunks contain the expected file?
    const hasExpected = retResult.chunks.some((c) => c.filePath.includes(item.expectedFilePattern));

    // A. Generate Answer WITHOUT RAG (Baseline)
    console.log('\nGenerating Baseline Answer (Without Retrieval)...');
    (config as any).rag.enabled = false;
    const t0Baseline = Date.now();
    const baselineRes = await askAssistantQuestion(
      item.question,
      {
        prTitle: prMeta.title,
        repo: 'OWASP/NodeGoat',
        findings: [],
      },
      {
        analysisId: simulatedAnalysisId,
        commitSha: prMeta.headSha,
        isPrivate: false,
      }
    );
    const baselineLatency = Date.now() - t0Baseline;

    // B. Generate Answer WITH RAG (Grounded)
    console.log('Generating Grounded Answer (With RAG)...');
    (config as any).rag.enabled = true;
    const t0Rag = Date.now();
    const ragRes = await askAssistantQuestion(
      item.question,
      {
        prTitle: prMeta.title,
        repo: 'OWASP/NodeGoat',
        findings: [],
      },
      {
        analysisId: simulatedAnalysisId,
        commitSha: prMeta.headSha,
        isPrivate: false,
      }
    );
    const ragLatency = Date.now() - t0Rag;

    console.log(`\n--- Baseline Answer (Sample) ---`);
    console.log(baselineRes.answer.slice(0, 300) + '...\n');

    console.log(`--- Grounded RAG Answer (Sample) ---`);
    console.log(ragRes.answer.slice(0, 450) + '...\n');

    console.log(`Verified References (${ragRes.references?.length || 0}):`);
    (ragRes.references || []).forEach((r) => {
      console.log(`  * ${r.filePath}:${r.startLine}-${r.endLine} -> ${r.githubUrl}`);
    });

    evalResults.push({
      category: item.category,
      question: item.question,
      retrievedCount: retResult.chunks.length,
      searchMethod: retResult.searchMethod,
      recallTargetFound: hasExpected,
      retrievalLatencyMs: retrievalLatency,
      baselineLatencyMs: baselineLatency,
      ragLatencyMs: ragLatency,
      ragUsed: ragRes.ragUsed,
      citationsCount: ragRes.references?.length || 0,
      citations: ragRes.references || [],
      baselineAnswerSample: baselineRes.answer.slice(0, 300),
      ragAnswerSample: ragRes.answer.slice(0, 450),
    });
  }

  // 5. Cleanup Evaluation Chunks from MongoDB Atlas
  console.log('\n[5/5] Cleaning up temporary evaluation chunks from Atlas...');
  await CodeChunk.deleteMany({ analysisId: new mongoose.Types.ObjectId(simulatedAnalysisId) });
  console.log('Cleanup complete.');

  console.log('\n================================================================');
  console.log('EVALUATION SUMMARY & METRICS');
  console.log('================================================================');
  const avgRecall = (evalResults.filter((r) => r.recallTargetFound).length / evalResults.length) * 100;
  const avgRetrievalLatency = Math.round(evalResults.reduce((acc, r) => acc + r.retrievalLatencyMs, 0) / evalResults.length);
  const avgRagLatency = Math.round(evalResults.reduce((acc, r) => acc + r.ragLatencyMs, 0) / evalResults.length);
  const avgCitations = (evalResults.reduce((acc, r) => acc + r.citationsCount, 0) / evalResults.length).toFixed(1);

  console.log(`Recall@4 on target files: ${avgRecall}%`);
  console.log(`Avg Retrieval Latency: ${avgRetrievalLatency}ms`);
  console.log(`Avg End-to-End RAG Generation Latency: ${avgRagLatency}ms`);
  console.log(`Avg Validated Citations per Answer: ${avgCitations}`);
  console.log(`Total Code Chunks Indexed: ${storedChunks.length}`);
  console.log('================================================================\n');

  await mongoose.disconnect();
  return evalResults;
}

if (require.main === module) {
  runEvaluation()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Evaluation run failed:', err);
      process.exit(1);
    });
}

export { runEvaluation };
