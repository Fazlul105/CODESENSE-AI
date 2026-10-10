'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getAnalysis, getAnalysisFindings, getExportMarkdownUrl, askAnalysisChat, getAnalysisRagStatus, triggerAnalysisRagIndex } from '@/lib/api';
import { FindingCard } from '@/components/FindingCard';
import { RiskBadge } from '@/components/RiskBadge';
import { SeverityBadge } from '@/components/SeverityBadge';
import {
  ExternalLink,
  Download,
  AlertOctagon,
  CheckCircle,
  FileCode,
  Filter,
  Layers,
  Shield,
  Info,
  ChevronRight,
  Loader2,
  Calendar,
  User,
  GitBranch,
  MessageSquare,
  Send,
  Bot,
  Sparkles,
  Database,
  BookOpen,
} from 'lucide-react';

export default function AnalysisResultsPage() {
  const params = useParams();
  const id = params?.id as string;

  const [severityFilter, setSeverityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [fileFilter, setFileFilter] = useState('all');

  // AI Assistant Chat State
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatMessages, setChatMessages] = useState<
    Array<{
      role: 'user' | 'assistant';
      text: string;
      time: string;
      references?: Array<{
        filePath: string;
        startLine?: number;
        endLine?: number;
        symbolName?: string;
        snippet?: string;
        githubUrl?: string;
      }>;
      ragUsed?: boolean;
    }>
  >([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  async function handleSendChat(e?: React.FormEvent, customPrompt?: string) {
    if (e) e.preventDefault();
    const promptToSend = customPrompt || chatQuestion;
    if (!promptToSend.trim() || isChatLoading) return;

    const userText = promptToSend.trim();
    if (!customPrompt) setChatQuestion('');

    setChatMessages((prev) => [...prev, { role: 'user', text: userText, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    setIsChatLoading(true);

    try {
      const res = await askAnalysisChat(id, userText);
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: res.answer,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          references: res.references,
          ragUsed: res.ragUsed,
        },
      ]);
    } catch (err: any) {
      setChatMessages((prev) => [...prev, { role: 'assistant', text: `Failed to answer: ${err.message}`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    } finally {
      setIsChatLoading(false);
    }
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => getAnalysis(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const job = query.state.data?.job;
      return job && job.status === 'in_progress' ? 1500 : false;
    },
  });

  const { data: filteredFindings } = useQuery({
    queryKey: ['analysis-findings', id, severityFilter, categoryFilter, fileFilter],
    queryFn: () =>
      getAnalysisFindings(id, {
        severity: severityFilter,
        category: categoryFilter,
        file: fileFilter,
      }),
    enabled: !!id && data?.job?.status === 'completed',
  });

  const { data: ragStatus } = useQuery({
    queryKey: ['rag-status', id],
    queryFn: () => getAnalysisRagStatus(id),
    enabled: !!id && data?.job?.status === 'completed',
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'indexing' ? 2000 : false;
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-slate-400">Loading analysis results...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-5 text-rose-300">
          <h2 className="text-base font-semibold text-rose-200">Unable to load analysis</h2>
          <p className="text-xs text-rose-300/80 mt-1">{(error as any)?.message || 'Analysis record not found'}</p>
        </div>
      </div>
    );
  }

  const { job, report, findings } = data;
  const repo: any = job.repository || {};
  const pr: any = job.pullRequest || {};
  const findingsToDisplay = filteredFindings || findings || [];

  // Get unique list of affected files for filter
  const affectedFiles = Array.from(new Set(findings.map((f) => f.filePath)));

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header Card */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-mono text-slate-400">{repo.fullName}</span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-400 font-medium">PR #{pr.number}</span>
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${
                  pr.state === 'open'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                }`}
              >
                {pr.state}
              </span>
              {report?.riskAssessment && (
                <RiskBadge level={report.riskAssessment.riskLevel} score={report.riskAssessment.overallScore} />
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">{pr.title}</h1>

            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-500" />
                <span>@{pr.author}</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono">
                <GitBranch className="h-3.5 w-3.5 text-slate-500" />
                <span>{pr.baseBranch} ← {pr.headBranch}</span>
              </div>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-emerald-400">+{pr.additions}</span>
                <span className="text-rose-400">-{pr.deletions}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                <span>{new Date(job.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={getExportMarkdownUrl(job.id || (job as any)._id)}
              download
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Report</span>
            </a>

            <a
              href={pr.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>View on GitHub</span>
            </a>
          </div>
        </div>
      </div>

      {/* Progress alert if still analyzing */}
      {job.status === 'in_progress' && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-blue-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            <div>
              <p className="font-semibold text-blue-200">Analysis In Progress</p>
              <p className="text-xs text-blue-300/80">{job.statusMessage}</p>
            </div>
          </div>
          <span className="font-mono text-sm font-bold text-blue-400">{job.progressPercent}%</span>
        </div>
      )}

      {/* Metric Breakdown Grid (All 5 severities + Informational + Files Analyzed) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3.5">
          <p className="text-xs text-slate-400 font-medium">Total Findings</p>
          <p className="text-xl font-bold text-slate-100 mt-1">{report?.findingsCount?.total || findings.length}</p>
        </div>
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3.5">
          <p className="text-xs text-rose-400 font-medium">Critical</p>
          <p className="text-xl font-bold text-rose-300 mt-1">{report?.findingsCount?.critical || 0}</p>
        </div>
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3.5">
          <p className="text-xs text-orange-400 font-medium">High</p>
          <p className="text-xl font-bold text-orange-300 mt-1">{report?.findingsCount?.high || 0}</p>
        </div>
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3.5">
          <p className="text-xs text-amber-400 font-medium">Medium</p>
          <p className="text-xl font-bold text-amber-300 mt-1">{report?.findingsCount?.medium || 0}</p>
        </div>
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3.5">
          <p className="text-xs text-blue-400 font-medium">Low</p>
          <p className="text-xl font-bold text-blue-300 mt-1">{report?.findingsCount?.low || 0}</p>
        </div>
        <div className="rounded-lg border border-slate-500/20 bg-slate-500/5 p-3.5">
          <p className="text-xs text-slate-400 font-medium">Informational</p>
          <p className="text-xl font-bold text-slate-300 mt-1">{report?.findingsCount?.informational || 0}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3.5">
          <p className="text-xs text-slate-400 font-medium">Files Analyzed</p>
          <p className="text-xl font-bold text-slate-100 mt-1">
            {job.filesAnalyzed}
            {job.totalFilesChanged && job.totalFilesChanged > job.filesAnalyzed && (
              <span className="text-xs text-slate-500 font-normal ml-1">/ {job.totalFilesChanged}</span>
            )}
          </p>
        </div>
      </div>

      {/* Partial-Analysis / Coverage Notice if files were skipped */}
      {job.totalFilesChanged && job.filesAnalyzed < job.totalFilesChanged ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              <strong>Analysis Coverage Notice:</strong> {job.filesAnalyzed} of {job.totalFilesChanged} changed files analyzed. Non-JavaScript/TypeScript, binary, or configuration files were skipped for AST parsing.
            </span>
          </div>
          <span className="font-mono text-[11px] bg-amber-500/20 px-2.5 py-1 rounded text-amber-200 shrink-0">
            {Math.round((job.filesAnalyzed / job.totalFilesChanged) * 100)}% Codebase Coverage
          </span>
        </div>
      ) : null}

      {/* Risk Assessment & Methodology: Separates Heuristic Churn Risk from Validated ML Estimation */}
      {report?.riskAssessment && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-400" />
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Defect Risk & Change Analysis</h3>
                <p className="text-[11px] text-slate-400">
                  Dual-tier assessment combining code churn heuristics with real-world ML defect probability.
                </p>
              </div>
            </div>
            <RiskBadge level={report.riskAssessment.riskLevel} score={report.riskAssessment.overallScore} size="lg" />
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">{report.riskAssessment.summary}</p>

          {/* Dual Panel: Heuristic Churn vs Validated ML Model */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {/* Heuristic Code-Change Risk Panel */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-blue-400" />
                  Heuristic Change-Risk Score
                </span>
                <span className="text-xs font-mono font-bold text-blue-400">
                  {report.riskAssessment.overallScore}/100
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Calculated from normalized lines added/deleted, file count diffusion, and normalized Shannon Change Entropy across modified files.
              </p>
            </div>

            {/* Validated ML Defect-Risk Estimate Panel */}
            <div className="rounded-lg border border-indigo-950/60 bg-indigo-950/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  Experimental ML Defect-Risk Estimate
                </span>
                {report.riskAssessment.mlDetails ? (
                  <span className="text-xs font-mono font-bold text-indigo-300">
                    {(report.riskAssessment.mlDetails.defectProbability * 100).toFixed(1)}% Prob.
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500 font-mono">Heuristic Baseline</span>
                )}
              </div>
              <p className="text-[11px] text-indigo-200/70 leading-normal">
                {report.riskAssessment.mlDetails ? (
                  <>
                    Calibrated {report.riskAssessment.mlDetails.modelType} trained on Kamei et al. (IEEE TSE 2013) JIT Defect Benchmark (9,075 real-world commits with SZZ labels).
                  </>
                ) : (
                  'ML microservice offline — falling back to deterministic heuristic evaluation.'
                )}
              </p>
            </div>
          </div>

          {/* Risk Factors Breakdown */}
          {report.riskAssessment.factors && report.riskAssessment.factors.length > 0 && (
            <div className="pt-2 border-t border-slate-800/80">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Contributing Risk Factors
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {report.riskAssessment.factors.map((factor, idx) => (
                  <div key={idx} className="rounded-md border border-slate-800/80 bg-slate-950/50 p-2.5 text-xs">
                    <div className="flex items-center justify-between text-slate-300 font-medium">
                      <span>{factor.factor}</span>
                      <span className="text-amber-400 font-mono">+{factor.weight} pts</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{factor.impact}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Two-Panel Layout: Filters/Files on Left, Finding Cards on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar: Filters & Affected Files */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 uppercase tracking-wider">
              <Filter className="h-3.5 w-3.5" />
              <span>Filters</span>
            </div>

            {/* Severity Filter */}
            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">Severity</label>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="informational">Informational</option>
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Categories</option>
                <option value="potential_bug">Potential Bug</option>
                <option value="security">Security</option>
                <option value="code_quality">Code Quality</option>
                <option value="maintainability">Maintainability</option>
              </select>
            </div>

            {/* File Filter */}
            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">Affected File</label>
              <select
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Files ({affectedFiles.length})</option>
                {affectedFiles.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Files List */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">
              <FileCode className="h-3.5 w-3.5" />
              <span>Modified Files ({affectedFiles.length})</span>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {affectedFiles.length === 0 ? (
                <p className="text-xs text-slate-500">No issues flagged in files.</p>
              ) : (
                affectedFiles.map((file) => {
                  const count = findings.filter((f) => f.filePath === file).length;
                  const isSelected = fileFilter === file;
                  return (
                    <button
                      key={file}
                      onClick={() => setFileFilter(isSelected ? 'all' : file)}
                      className={`w-full text-left flex items-center justify-between rounded px-2 py-1.5 text-xs transition ${
                        isSelected
                          ? 'bg-blue-600/20 text-blue-300 font-medium'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span className="truncate pr-2 font-mono text-[11px]">{file}</span>
                      <span className="rounded-full bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-400">
                        {count}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Main Content: Findings */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">
              Categorized Review Findings ({findingsToDisplay.length})
            </h3>
            {(severityFilter !== 'all' || categoryFilter !== 'all' || fileFilter !== 'all') && (
              <button
                onClick={() => {
                  setSeverityFilter('all');
                  setCategoryFilter('all');
                  setFileFilter('all');
                }}
                className="text-xs text-blue-400 hover:underline"
              >
                Clear Filters
              </button>
            )}
          </div>

          {findingsToDisplay.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center space-y-3">
              <CheckCircle className="mx-auto h-8 w-8 text-emerald-400" />
              <div>
                <h4 className="text-sm font-medium text-slate-200">No findings matching active criteria</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                  No static analysis violations or potential bugs detected for these filter settings.
                </p>
              </div>
              <div className="rounded-md bg-slate-950/80 border border-slate-800/80 p-3 text-[11px] text-slate-400 max-w-lg mx-auto text-left leading-relaxed">
                <span className="font-semibold text-slate-300">Important Engineering Note:</span> Zero AST static analysis findings does not guarantee that the pull request is free of security vulnerabilities, runtime edge cases, or functional regressions. Always complement with automated test suites and peer code reviews.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {findingsToDisplay.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </div>
          )}

          {/* AI Contextual Assistant Chat Section */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 mt-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-400">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Repository-Aware AI Assistant</h4>
                  <p className="text-[11px] text-slate-400">Ask questions about pull-request changes and related code, with evidence-backed source references.</p>
                </div>
              </div>
              {ragStatus?.isIndexed ? (
                <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30">
                  <Database className="h-3 w-3 text-emerald-400" />
                  RAG Active • {ragStatus.chunkCount} Chunks Indexed
                </span>
              ) : ragStatus?.status === 'indexing' ? (
                <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-amber-500/10 px-3 py-1 text-[10px] font-semibold text-amber-300 border border-amber-500/30">
                  <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                  Indexing Chunks...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-indigo-500/10 px-3 py-1 text-[10px] font-semibold text-indigo-300 border border-indigo-500/30">
                  <Sparkles className="h-3 w-3 text-indigo-400" />
                  Gemini Grounded Assistant
                </span>
              )}
            </div>

            {/* Quick Prompt Pills */}
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                'Does this pull request introduce an authorization vulnerability?',
                'Explain the highest severity issue',
                'Are there any sensitive secrets or credential leaks?',
                'What unit tests should I add for these changes?',
              ].map((pill) => (
                <button
                  key={pill}
                  onClick={() => handleSendChat(undefined, pill)}
                  disabled={isChatLoading}
                  className="rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-[11px] text-slate-300 hover:border-slate-700 hover:text-white disabled:opacity-50 transition"
                >
                  {pill}
                </button>
              ))}
            </div>

            {/* Chat Message History */}
            {chatMessages.length > 0 && (
              <div className="space-y-3 max-h-96 overflow-y-auto rounded-lg bg-slate-950/80 p-3 border border-slate-800/80">
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-none'
                          : 'bg-slate-900 text-slate-200 border border-slate-800 rounded-bl-none'
                      }`}
                    >
                      {msg.role === 'assistant' && msg.ragUsed && (
                        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium text-emerald-400">
                          <Database className="h-3 w-3" />
                          <span>Grounded in retrieved source code chunks</span>
                        </div>
                      )}
                      {msg.text}

                      {/* Verified Source Citations */}
                      {msg.role === 'assistant' && msg.references && msg.references.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-1.5">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <BookOpen className="h-3 w-3 text-indigo-400" />
                            Verified Source References ({msg.references.length}):
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.references.map((ref, rIdx) => {
                              const repoFullName = (data?.job?.repository as any)?.fullName || 'repo';
                              const headSha = (data?.job?.pullRequest as any)?.headSha || 'head';
                              const lineAnchor = ref.startLine
                                ? ref.endLine && ref.endLine !== ref.startLine
                                  ? `#L${ref.startLine}-L${ref.endLine}`
                                  : `#L${ref.startLine}`
                                : '';
                              const targetUrl =
                                ref.githubUrl ||
                                `https://github.com/${repoFullName}/blob/${headSha}/${ref.filePath}${lineAnchor}`;

                              return (
                                <a
                                  key={rIdx}
                                  href={targetUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-950 border border-slate-800 hover:border-indigo-500/60 hover:bg-slate-900 text-[10px] text-indigo-300 transition group"
                                  title={ref.snippet || `${ref.filePath}:${ref.startLine || 1}`}
                                >
                                  <FileCode className="h-2.5 w-2.5 text-indigo-400 group-hover:text-indigo-300" />
                                  <span className="font-mono">
                                    {ref.filePath}:{ref.startLine ?? 1}
                                    {ref.endLine && ref.endLine !== ref.startLine ? `-${ref.endLine}` : ''}
                                  </span>
                                  <ExternalLink className="h-2.5 w-2.5 opacity-60 group-hover:opacity-100" />
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.time}</span>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 p-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    <span>Retrieving relevant source chunks and reasoning...</span>
                  </div>
                )}
              </div>
            )}

            {/* Chat Input Bar */}
            <form onSubmit={(e) => handleSendChat(e)} className="flex gap-2">
              <input
                type="text"
                value={chatQuestion}
                onChange={(e) => setChatQuestion(e.target.value)}
                placeholder="Ask about this pull request, specific findings, or edge-case tests..."
                disabled={isChatLoading}
                className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isChatLoading || !chatQuestion.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition"
              >
                {isChatLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span>Ask</span>
              </button>
            </form>
          </div>

          {/* Testing and Security Observations Footer */}
          {report && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              {report.keyConcerns && report.keyConcerns.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Key Concerns
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-400">
                    {report.keyConcerns.map((kc, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-amber-400 mt-0.5">•</span>
                        <span>{kc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.testingRecommendations && report.testingRecommendations.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Testing Recommendations
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-400">
                    {report.testingRecommendations.map((tr, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-blue-400 mt-0.5">•</span>
                        <span>{tr}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
