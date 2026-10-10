import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { RuleContext } from './potentialBugs';

const SECRET_PATTERNS = [
  { name: 'GitHub Personal Access Token', regex: /gh[pousr]_[A-Za-z0-9_]{36,255}/ },
  { name: 'AWS Access Key ID', regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/ },
  { name: 'Generic API Key/Secret', regex: /(?:api[_-]?key|secret[_-]?key|auth[_-]?token)\s*[:=]\s*["']([A-Za-z0-9_\-]{20,})["']/i },
  { name: 'Private Key Header', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'JWT Token Literal', regex: /eyJ[A-Za-z0-9-_]{10,}\.eyJ[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,}/ },
];

function isLineInDiff(line: number, ctx: RuleContext): boolean {
  return !ctx.addedLines || ctx.addedLines.size === 0 || ctx.addedLines.has(line);
}

export function runSecurityRules(ast: t.File | null, ctx: RuleContext): void {
  // 1. AST Traversal for dangerous functions and APIs
  if (ast && (ast as any).type) {
    try {
      traverse(ast, {
        CallExpression(path) {
      const callee = path.node.callee;
      const line = path.node.loc?.start.line;
      if (!line || !isLineInDiff(line, ctx)) return;

      // Check direct eval() or window.eval() / global.eval()
      const isDirectEval = t.isIdentifier(callee, { name: 'eval' });
      const isMemberEval =
        t.isMemberExpression(callee) &&
        (t.isIdentifier(callee.object, { name: 'window' }) || t.isIdentifier(callee.object, { name: 'global' })) &&
        t.isIdentifier(callee.property, { name: 'eval' });

      if (isDirectEval || isMemberEval) {
        ctx.findings.push({
          id: `sec-eval-${ctx.filePath}-${line}`,
          ruleId: 'no-eval',
          title: 'Dangerous use of eval() function',
          category: 'security',
          severity: 'critical',
          filePath: ctx.filePath,
          line,
          explanation:
            'eval() parses and executes arbitrary strings as JavaScript code with local privileges, opening high-severity Remote Code Execution (RCE) and Cross-Site Scripting (XSS) vectors.',
          suggestion: 'Refactor to use JSON.parse(), direct property lookups, or safe expression interpreters.',
          confidence: 'high',
          source: 'static_analysis',
          isDeterministic: true,
        });
      }

      // Check setTimeout / setInterval with string literal
      if (
        (t.isIdentifier(callee, { name: 'setTimeout' }) || t.isIdentifier(callee, { name: 'setInterval' })) &&
        path.node.arguments.length > 0 &&
        t.isStringLiteral(path.node.arguments[0])
      ) {
        ctx.findings.push({
          id: `sec-timer-string-${ctx.filePath}-${line}`,
          ruleId: 'no-implied-eval',
          title: 'Implied eval via timer string argument',
          category: 'security',
          severity: 'high',
          filePath: ctx.filePath,
          line,
          explanation:
            'Passing string code to setTimeout or setInterval acts like eval and exposes execution of dynamic unsanitized code.',
          suggestion: 'Pass a function callback instead of a string argument.',
          confidence: 'high',
          source: 'static_analysis',
          isDeterministic: true,
        });
      }
    },

    NewExpression(path) {
      const callee = path.node.callee;
      const line = path.node.loc?.start.line;
      if (!line || !isLineInDiff(line, ctx)) return;

      if (t.isIdentifier(callee, { name: 'Function' })) {
        ctx.findings.push({
          id: `sec-function-ctor-${ctx.filePath}-${line}`,
          ruleId: 'no-new-func',
          title: 'Dynamic code execution via Function constructor',
          category: 'security',
          severity: 'critical',
          filePath: ctx.filePath,
          line,
          explanation:
            'new Function(...) constructs and executes executable code from strings at runtime, similar to eval.',
          suggestion: 'Refactor using regular static functions or explicit lookup tables.',
          confidence: 'high',
          source: 'static_analysis',
          isDeterministic: true,
        });
      }
    },

    // Check innerHTML and dangerouslySetInnerHTML
    JSXAttribute(path) {
      const line = path.node.loc?.start.line;
      if (!line || !isLineInDiff(line, ctx)) return;

      if (path.node.name.name === 'dangerouslySetInnerHTML') {
        ctx.findings.push({
          id: `sec-react-danger-html-${ctx.filePath}-${line}`,
          ruleId: 'no-dangerously-set-inner-html',
          title: 'Potential XSS via dangerouslySetInnerHTML',
          category: 'security',
          severity: 'high',
          filePath: ctx.filePath,
          line,
          explanation:
            'dangerouslySetInnerHTML bypasses React auto-escaping mechanisms and may expose users to Stored or Reflected Cross-Site Scripting (XSS).',
          suggestion: 'Sanitize HTML with DOMPurify before injecting, or render React nodes directly.',
          confidence: 'high',
          source: 'static_analysis',
          isDeterministic: true,
        });
      }
    },

    AssignmentExpression(path) {
      const left = path.node.left;
      const line = path.node.loc?.start.line;
      if (!line || !isLineInDiff(line, ctx)) return;

      if (t.isMemberExpression(left) && t.isIdentifier(left.property, { name: 'innerHTML' })) {
        ctx.findings.push({
          id: `sec-raw-innerhtml-${ctx.filePath}-${line}`,
          ruleId: 'no-raw-inner-html',
          title: 'Direct DOM manipulation via innerHTML',
          category: 'security',
          severity: 'high',
          filePath: ctx.filePath,
          line,
          explanation:
            'Assigning unsanitized input to element.innerHTML creates Cross-Site Scripting (XSS) vulnerabilities.',
          suggestion: 'Use textContent, createElement, or sanitize input using DOMPurify.',
          confidence: 'high',
          source: 'static_analysis',
          isDeterministic: true,
        });
      }
    },
      });
    } catch {
      // Graceful fallback on traversal failure
    }
  }

  // 2. Line-by-line secret leak detection (filtered by diff if diff is provided)
  const lines = ctx.sourceCode.split('\n');
  lines.forEach((lineText, index) => {
    const lineNum = index + 1;
    if (!isLineInDiff(lineNum, ctx)) return;

    for (const pattern of SECRET_PATTERNS) {
      if (pattern.regex.test(lineText)) {
        ctx.findings.push({
          id: `sec-secret-${ctx.filePath}-${lineNum}`,
          ruleId: 'hardcoded-secret',
          title: `Potential hardcoded secret (${pattern.name})`,
          category: 'security',
          severity: 'critical',
          filePath: ctx.filePath,
          line: lineNum,
          explanation: `Detected potential ${pattern.name} embedded in source code. Committing credentials to source control introduces severe unauthorized access risks.`,
          suggestion: 'Store credentials in environment variables or a secure secret manager (e.g., Vault, AWS Secrets Manager).',
          confidence: 'high',
          source: 'static_analysis',
          isDeterministic: true,
        });
        break;
      }
    }
  });
}
