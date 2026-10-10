import { describe, it, expect } from 'vitest';
import { parsePullRequestUrl, isSupportedLanguageFile } from '../integrations/github';
import { parseGitPatch, extractCodeSnippet } from './diffMapper';
import { parseSourceCode } from './astParser';
import { runPotentialBugRules } from './rules/potentialBugs';
import { runSecurityRules } from './rules/security';
import { runCodeQualityRules } from './rules/codeQuality';
import { calculateHeuristicRisk } from './riskCalculator';

describe('GitHub URL Parser', () => {
  it('parses standard GitHub pull request URL', () => {
    const res = parsePullRequestUrl('https://github.com/facebook/react/pull/28000');
    expect(res).toEqual({ owner: 'facebook', repo: 'react', pullNumber: 28000 });
  });

  it('parses shorthand owner/repo#number format', () => {
    const res = parsePullRequestUrl('vercel/next.js#50123');
    expect(res).toEqual({ owner: 'vercel', repo: 'next.js', pullNumber: 50123 });
  });

  it('throws on invalid or malformed URL', () => {
    expect(() => parsePullRequestUrl('https://example.com/not-github')).toThrow();
  });
});

describe('Language Support Check', () => {
  it('recognizes TypeScript and JavaScript files', () => {
    expect(isSupportedLanguageFile('src/auth.ts').isSupported).toBe(true);
    expect(isSupportedLanguageFile('components/Button.tsx').isSupported).toBe(true);
    expect(isSupportedLanguageFile('index.js').isSupported).toBe(true);
  });

  it('flags unsupported or binary files with skip reasons', () => {
    expect(isSupportedLanguageFile('image.png').isSupported).toBe(false);
    expect(isSupportedLanguageFile('package-lock.json').isSupported).toBe(false);
  });
});

describe('Diff Mapper', () => {
  it('parses git patch hunks and extracts added lines', () => {
    const patch = `@@ -10,3 +10,4 @@
 context line
-old line
+new line 1
+new line 2
 trailing line`;

    const { addedLines } = parseGitPatch(patch);
    expect(addedLines.has(11)).toBe(true);
    expect(addedLines.has(12)).toBe(true);
    expect(addedLines.has(10)).toBe(false);
  });

  it('extracts code snippets with context', () => {
    const code = `line 1\nline 2\nline 3\nline 4\nline 5`;
    const snippet = extractCodeSnippet(code, 3, 1);
    expect(snippet).toContain('>    3 | line 3');
    expect(snippet).toContain('   2 | line 2');
  });
});

describe('Static Analysis Bug Rules', () => {
  it('detects NaN direct comparisons and loose equality', () => {
    const code = `
      function test(x, y) {
        if (x === NaN) return false;
        if (y == 42) return true;
        return null;
      }
    `;
    const ast = parseSourceCode(code, 'test.js')!;
    const findings: any[] = [];
    runPotentialBugRules(ast, {
      filePath: 'test.js',
      sourceCode: code,
      addedLines: new Set([3, 4]),
      findings,
    });

    const nanFinding = findings.find((f) => f.ruleId === 'suspicious-nan-comparison');
    expect(nanFinding).toBeDefined();
    expect(nanFinding.severity).toBe('high');

    const looseEqFinding = findings.find((f) => f.ruleId === 'suspicious-equality');
    expect(looseEqFinding).toBeDefined();
  });

  it('detects unreachable code after return', () => {
    const code = `
      function dead() {
        return 1;
        console.log("never reached");
      }
    `;
    const ast = parseSourceCode(code, 'test.js')!;
    const findings: any[] = [];
    runPotentialBugRules(ast, {
      filePath: 'test.js',
      sourceCode: code,
      addedLines: new Set([4]),
      findings,
    });

    const unreachable = findings.find((f) => f.ruleId === 'unreachable-code');
    expect(unreachable).toBeDefined();
    expect(unreachable.line).toBe(4);
  });

  it('detects Number.NaN comparison and avoids false positive on safe Number.isNaN', () => {
    const code = `
      function check(val) {
        if (val === Number.NaN) return false;
        if (Number.isNaN(val)) return true;
        return null;
      }
    `;
    const ast = parseSourceCode(code, 'test.js')!;
    const findings: any[] = [];
    runPotentialBugRules(ast, {
      filePath: 'test.js',
      sourceCode: code,
      addedLines: new Set([3, 4]),
      findings,
    });

    const nanFinding = findings.find((f) => f.ruleId === 'suspicious-nan-comparison');
    expect(nanFinding).toBeDefined();
    expect(nanFinding.line).toBe(3);
    // Line 4 (Number.isNaN) should not trigger any finding
    expect(findings.filter((f) => f.line === 4).length).toBe(0);
  });

  it('does not flag hoisted function declarations as unreachable', () => {
    const code = `
      function calculate() {
        return helper();
        function helper() { return 42; }
      }
    `;
    const ast = parseSourceCode(code, 'test.js')!;
    const findings: any[] = [];
    runPotentialBugRules(ast, {
      filePath: 'test.js',
      sourceCode: code,
      addedLines: new Set([3, 4]),
      findings,
    });

    const unreachable = findings.find((f) => f.ruleId === 'unreachable-code');
    expect(unreachable).toBeUndefined();
  });

  it('recognizes for-await loops in async functions and avoids false positive', () => {
    const code = `
      async function streamData(stream) {
        for await (const chunk of stream) {
          console.log(chunk);
        }
      }
    `;
    const ast = parseSourceCode(code, 'test.js')!;
    const findings: any[] = [];
    runPotentialBugRules(ast, {
      filePath: 'test.js',
      sourceCode: code,
      addedLines: new Set([2, 3, 4]),
      findings,
    });

    const asyncFinding = findings.find((f) => f.ruleId === 'suspicious-async');
    expect(asyncFinding).toBeUndefined();
  });

  it('scopes findings strictly to added/modified diff lines', () => {
    const code = `
      console.log("unmodified legacy line 1");
      if (x === NaN) return false;
    `;
    const ast = parseSourceCode(code, 'test.js')!;
    const findings: any[] = [];
    // Only line 3 was added in the PR
    runPotentialBugRules(ast, {
      filePath: 'test.js',
      sourceCode: code,
      addedLines: new Set([3]),
      findings,
    });

    expect(findings.some((f) => f.line === 3)).toBe(true);
    // Line 2 was not in addedLines and must not be flagged
    expect(findings.some((f) => f.line === 2)).toBe(false);
  });
});

describe('Static Analysis Security Rules', () => {
  it('detects eval and hardcoded secrets', () => {
    const code = `
      const token = "ghp_123456789012345678901234567890123456";
      eval("window.x = 1");
    `;
    const ast = parseSourceCode(code, 'sec.js')!;
    const findings: any[] = [];
    runSecurityRules(ast, {
      filePath: 'sec.js',
      sourceCode: code,
      addedLines: new Set([2, 3]),
      findings,
    });

    const evalFinding = findings.find((f) => f.ruleId === 'no-eval');
    expect(evalFinding).toBeDefined();
    expect(evalFinding.severity).toBe('critical');

    const secretFinding = findings.find((f) => f.ruleId === 'hardcoded-secret');
    expect(secretFinding).toBeDefined();
  });

  it('detects window.eval and global.eval as critical security violations', () => {
    const code = `
      window.eval("attackerPayload()");
      global.eval("rootPrivileges()");
    `;
    const ast = parseSourceCode(code, 'sec2.js')!;
    const findings: any[] = [];
    runSecurityRules(ast, {
      filePath: 'sec2.js',
      sourceCode: code,
      addedLines: new Set([2, 3]),
      findings,
    });

    const evalFindings = findings.filter((f) => f.ruleId === 'no-eval');
    expect(evalFindings.length).toBe(2);
    expect(evalFindings[0].severity).toBe('critical');
    expect(evalFindings[1].severity).toBe('critical');
  });
});

describe('Heuristic Risk Scoring', () => {
  it('assigns high or critical risk when critical findings exist', () => {
    const assessment = calculateHeuristicRisk({
      additions: 150,
      deletions: 50,
      changedFilesCount: 8,
      findings: [
        {
          id: '1',
          ruleId: 'no-eval',
          title: 'eval',
          category: 'security',
          severity: 'critical',
          filePath: 'x.js',
          line: 1,
          explanation: '',
          confidence: 'high',
          source: 'static_analysis',
          isDeterministic: true,
        },
      ],
    });

    expect(assessment.overallScore).toBeGreaterThanOrEqual(40);
    expect(assessment.factors.length).toBeGreaterThan(0);
    expect(assessment.method).toBe('heuristic');
  });
});
