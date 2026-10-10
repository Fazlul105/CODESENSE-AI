import { describe, it, expect } from 'vitest';
import { parsePullRequestUrl, isSupportedLanguageFile } from '../integrations/github';
import { parseGitPatch, extractCodeSnippet } from './diffMapper';
import { parseSourceCode } from './astParser';
import { runPotentialBugRules } from './rules/potentialBugs';
import { runSecurityRules } from './rules/security';
import { runCodeQualityRules } from './rules/codeQuality';
import { calculateHeuristicRisk, calculateChangeEntropy } from './riskCalculator';

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

describe('Shannon Change Entropy Calculation', () => {
  it('returns 0.0 for single file modification or zero churn', () => {
    expect(calculateChangeEntropy([{ additions: 50, deletions: 10 }])).toBe(0.0);
    expect(calculateChangeEntropy([])).toBe(0.0);
    expect(calculateChangeEntropy([{ additions: 0, deletions: 0 }, { additions: 0, deletions: 0 }])).toBe(0.0);
  });

  it('returns 1.0 for completely uniform distribution across multiple files', () => {
    const files = [
      { additions: 50, deletions: 50 },
      { additions: 50, deletions: 50 },
      { additions: 50, deletions: 50 },
      { additions: 50, deletions: 50 },
    ];
    expect(calculateChangeEntropy(files)).toBe(1.0);
  });

  it('calculates correct bounded entropy for skewed changes across files', () => {
    const files = [
      { additions: 900, deletions: 100 },
      { additions: 5, deletions: 5 },
      { additions: 2, deletions: 1 },
    ];
    const entropy = calculateChangeEntropy(files);
    expect(entropy).toBeGreaterThan(0.0);
    expect(entropy).toBeLessThan(0.5); // Highly concentrated in file 1
  });
});

describe('Enhanced SAST Security Detection Rules', () => {
  it('detects unsafe OS command execution via child_process.exec', () => {
    const code = `
      const { exec } = require('child_process');
      exec("ping -c 4 " + targetHost);
    `;
    const ast = parseSourceCode(code, 'command.js')!;
    const findings: any[] = [];
    runSecurityRules(ast, {
      filePath: 'command.js',
      sourceCode: code,
      addedLines: new Set([3]),
      findings,
    });

    const execFinding = findings.find((f) => f.ruleId === 'no-unsafe-child-process');
    expect(execFinding).toBeDefined();
    expect(execFinding.severity).toBe('critical');
  });

  it('detects SQL injection via dynamic query string concatenation', () => {
    const code = `
      function getUser(id) {
        return db.query("SELECT * FROM users WHERE id = '" + id + "'");
      }
    `;
    const ast = parseSourceCode(code, 'db.js')!;
    const findings: any[] = [];
    runSecurityRules(ast, {
      filePath: 'db.js',
      sourceCode: code,
      addedLines: new Set([3]),
      findings,
    });

    const sqlFinding = findings.find((f) => f.ruleId === 'no-sql-injection');
    expect(sqlFinding).toBeDefined();
    expect(sqlFinding.severity).toBe('critical');
  });

  it('detects logging of secret environment variables (e.g. process.env.MONGODB_URI)', () => {
    const code = `
      console.log('Database URL:', process.env.MONGODB_URI);
      console.log('API Key:', process.env.API_KEY);
    `;
    const ast = parseSourceCode(code, 'extended.js')!;
    const findings: any[] = [];
    runSecurityRules(ast, {
      filePath: 'extended.js',
      sourceCode: code,
      addedLines: new Set([2, 3]),
      findings,
    });

    const envLeaks = findings.filter((f) => f.ruleId === 'no-secret-env-leak');
    expect(envLeaks.length).toBe(2);
    expect(envLeaks[0].severity).toBe('critical');
  });

  it('detects logging of sensitive PII and password fields (user.password, user.creditCard)', () => {
    const code = `
      console.log('Password:', user.password);
      console.log('Credit Card:', user.creditCard);
      console.log('SSN:', user.ssn);
    `;
    const ast = parseSourceCode(code, 'logging.js')!;
    const findings: any[] = [];
    runSecurityRules(ast, {
      filePath: 'logging.js',
      sourceCode: code,
      addedLines: new Set([2, 3, 4]),
      findings,
    });

    const sensitiveLogs = findings.filter((f) => f.ruleId === 'no-sensitive-logging');
    expect(sensitiveLogs.length).toBe(3);
    expect(sensitiveLogs[0].severity).toBe('high');
  });

  it('detects broken authorization when trusting client-controlled req.body role values', () => {
    const code = `
      const role = req.body.role;
      const isAdmin = (role == 'admin');
    `;
    const ast = parseSourceCode(code, 'validation.js')!;
    const findings: any[] = [];
    runSecurityRules(ast, {
      filePath: 'validation.js',
      sourceCode: code,
      addedLines: new Set([2, 3]),
      findings,
    });

    const roleFinding = findings.find((f) => f.ruleId === 'no-client-controlled-role');
    expect(roleFinding).toBeDefined();
    expect(roleFinding.severity).toBe('high');
  });

  it('detects insecure hash algorithms (MD5 / SHA1)', () => {
    const code = `
      const hash = crypto.createHash('md5').update(pwd).digest('hex');
    `;
    const ast = parseSourceCode(code, 'crypto.js')!;
    const findings: any[] = [];
    runSecurityRules(ast, {
      filePath: 'crypto.js',
      sourceCode: code,
      addedLines: new Set([2]),
      findings,
    });

    const hashFinding = findings.find((f) => f.ruleId === 'no-insecure-hash');
    expect(hashFinding).toBeDefined();
    expect(hashFinding.severity).toBe('medium');
  });

  it('detects SSRF when unvalidated request query parameters are passed to axios.get', () => {
    const code = `
      const res = await axios.get(req.query.url);
    `;
    const ast = parseSourceCode(code, 'proxy.js')!;
    const findings: any[] = [];
    runSecurityRules(ast, {
      filePath: 'proxy.js',
      sourceCode: code,
      addedLines: new Set([2]),
      findings,
    });

    const ssrfFinding = findings.find((f) => f.ruleId === 'no-ssrf');
    expect(ssrfFinding).toBeDefined();
    expect(ssrfFinding.severity).toBe('high');
  });
});

describe('NodeGoat PR #437 Security Fixture Benchmark', () => {
  it('correctly flags intentionally vulnerable patterns from NodeGoat PR #437', () => {
    // Exact snippets from NodeGoat PR #437 files
    const extendedCode = `
      console.log('Database URL:', process.env.MONGODB_URI);
      console.log('API Key:', process.env.API_KEY);
      console.log('Secret:', process.env.SECRET);
    `;
    const loggingCode = `
      console.log('Password:', user.password);
      console.log('Credit Card:', user.creditCard);
      console.log('SSN:', user.ssn);
      console.log('Environment Variables:', process.env);
    `;
    const validationCode = `
      const role = req.body.role;
      const isAdmin = (role == 'admin');
    `;

    const findings: any[] = [];
    const ast1 = parseSourceCode(extendedCode, 'app/routes/extended.js')!;
    runSecurityRules(ast1, {
      filePath: 'app/routes/extended.js',
      sourceCode: extendedCode,
      addedLines: new Set([2, 3, 4]),
      findings,
    });

    const ast2 = parseSourceCode(loggingCode, 'app/routes/logging.js')!;
    runSecurityRules(ast2, {
      filePath: 'app/routes/logging.js',
      sourceCode: loggingCode,
      addedLines: new Set([2, 3, 4, 5]),
      findings,
    });

    const ast3 = parseSourceCode(validationCode, 'app/routes/validation.js')!;
    runSecurityRules(ast3, {
      filePath: 'app/routes/validation.js',
      sourceCode: validationCode,
      addedLines: new Set([2, 3]),
      findings,
    });

    // Verify critical/high security issues are now properly identified instead of being swallowed as generic console.log
    const secretLeaks = findings.filter((f) => f.ruleId === 'no-secret-env-leak');
    expect(secretLeaks.length).toBeGreaterThanOrEqual(4); // 3 specific env vars + full process.env

    const piiLogs = findings.filter((f) => f.ruleId === 'no-sensitive-logging');
    expect(piiLogs.length).toBe(3); // password, creditCard, ssn

    const roleBypass = findings.filter((f) => f.ruleId === 'no-client-controlled-role');
    expect(roleBypass.length).toBe(1);
  });
});
