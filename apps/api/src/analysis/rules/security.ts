import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { RuleContext } from './potentialBugs';

const SECRET_PATTERNS = [
  { name: 'GitHub Personal Access Token', regex: /gh[pousr]_[A-Za-z0-9_]{36,255}|github_pat_[A-Za-z0-9_]{82}/ },
  { name: 'AWS Access Key ID', regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/ },
  { name: 'Generic API Key/Secret', regex: /(?:api[_-]?key|secret[_-]?key|auth[_-]?token)\s*[:=]\s*["']([A-Za-z0-9_\-]{20,})["']/i },
  { name: 'Private Key Header', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'JWT Token Literal', regex: /eyJ[A-Za-z0-9-_]{10,}\.eyJ[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,}/ },
];

const SENSITIVE_PROPERTY_NAMES = new Set([
  'password',
  'passwd',
  'creditcard',
  'credit_card',
  'ssn',
  'token',
  'accesstoken',
  'access_token',
  'secret',
  'apikey',
  'api_key',
  'privkey',
  'privatekey',
  'cvv',
  'pin',
]);

const SECRET_ENV_VARS = new Set([
  'MONGODB_URI',
  'DATABASE_URL',
  'DB_PASSWORD',
  'API_KEY',
  'SECRET',
  'JWT_SECRET',
  'SESSION_SECRET',
  'AWS_SECRET_ACCESS_KEY',
  'GITHUB_TOKEN',
  'PRIVATE_KEY',
  'ENCRYPTION_KEY',
]);

function isLineInDiff(line: number, ctx: RuleContext): boolean {
  return !ctx.addedLines || ctx.addedLines.size === 0 || ctx.addedLines.has(line);
}

function getMemberName(node: t.Node): string | null {
  if (t.isIdentifier(node)) return node.name;
  if (t.isStringLiteral(node)) return node.value;
  return null;
}

export function runSecurityRules(ast: t.File | null, ctx: RuleContext): void {
  // Track variables derived from req.body or client input for authorization tracking
  const clientInputVars = new Set<string>();

  if (ast && (ast as any).type) {
    try {
      // First pass: identify variables assigned from req.body (e.g. const role = req.body.role)
      traverse(ast, {
        VariableDeclarator(path) {
          const init = path.node.init;
          const id = path.node.id;
          if (t.isIdentifier(id) && init) {
            // Check req.body.role or req.body.isAdmin
            if (t.isMemberExpression(init)) {
              const obj = init.object;
              const prop = getMemberName(init.property);
              if (
                t.isMemberExpression(obj) &&
                t.isIdentifier(obj.object, { name: 'req' }) &&
                t.isIdentifier(obj.property, { name: 'body' })
              ) {
                if (prop && /role|isadmin|admin|permission|group/i.test(prop)) {
                  clientInputVars.add(id.name);
                }
              }
            }
          }
        },
      });

      // Second pass: Traverse AST for security vulnerabilities
      traverse(ast, {
        CallExpression(path) {
          const callee = path.node.callee;
          const line = path.node.loc?.start.line;
          if (!line || !isLineInDiff(line, ctx)) return;

          // 1. eval() or window.eval() / global.eval()
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

          // 2. setTimeout / setInterval with string literal
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

          // 3. OS Command Injection (child_process.exec, execSync, or spawn with shell: true)
          const isExecCall =
            (t.isIdentifier(callee, { name: 'exec' }) || t.isIdentifier(callee, { name: 'execSync' })) ||
            (t.isMemberExpression(callee) &&
              t.isIdentifier(callee.object, { name: 'child_process' }) &&
              (t.isIdentifier(callee.property, { name: 'exec' }) || t.isIdentifier(callee.property, { name: 'execSync' })));

          if (isExecCall && path.node.arguments.length > 0) {
            const firstArg = path.node.arguments[0];
            const isDynamic =
              t.isBinaryExpression(firstArg) ||
              (t.isTemplateLiteral(firstArg) && firstArg.expressions.length > 0) ||
              t.isIdentifier(firstArg);

            if (isDynamic) {
              ctx.findings.push({
                id: `sec-os-exec-${ctx.filePath}-${line}`,
                ruleId: 'no-unsafe-child-process',
                title: 'Unsafe OS command execution (Command Injection hazard)',
                category: 'security',
                severity: 'critical',
                filePath: ctx.filePath,
                line,
                explanation:
                  'Executing shell commands built from dynamic variables exposes the system to Command Injection attacks. An attacker can append shell operators (&, ;, |) to run arbitrary system binaries.',
                suggestion: 'Use child_process.execFile() or spawn() with argument arrays and shell: false.',
                confidence: 'high',
                source: 'static_analysis',
                isDeterministic: true,
              });
            }
          }

          // 4. SQL Injection (db.query, client.query, connection.query with string concatenation)
          if (
            t.isMemberExpression(callee) &&
            t.isIdentifier(callee.property, { name: 'query' }) &&
            path.node.arguments.length > 0
          ) {
            const queryArg = path.node.arguments[0];
            const isConcatenatedSql =
              (t.isBinaryExpression(queryArg) && queryArg.operator === '+') ||
              (t.isTemplateLiteral(queryArg) && queryArg.expressions.length > 0);

            if (isConcatenatedSql) {
              ctx.findings.push({
                id: `sec-sql-injection-${ctx.filePath}-${line}`,
                ruleId: 'no-sql-injection',
                title: 'Potential SQL Injection via dynamic query concatenation',
                category: 'security',
                severity: 'critical',
                filePath: ctx.filePath,
                line,
                explanation:
                  'Constructing SQL query strings with string concatenation or template literals bypasses query parameterization and allows SQL Injection.',
                suggestion: 'Use parameterized queries (e.g., query("SELECT * FROM users WHERE id = $1", [id])).',
                confidence: 'high',
                source: 'static_analysis',
                isDeterministic: true,
              });
            }
          }

          // 5. Insecure Cryptographic Hash Algorithms (MD5, SHA1)
          if (
            t.isMemberExpression(callee) &&
            t.isIdentifier(callee.property, { name: 'createHash' }) &&
            path.node.arguments.length > 0 &&
            t.isStringLiteral(path.node.arguments[0])
          ) {
            const algo = path.node.arguments[0].value.toLowerCase();
            if (algo === 'md5' || algo === 'sha1') {
              ctx.findings.push({
                id: `sec-weak-hash-${ctx.filePath}-${line}`,
                ruleId: 'no-insecure-hash',
                title: `Use of weak or broken hash algorithm (${algo.toUpperCase()})`,
                category: 'security',
                severity: 'medium',
                filePath: ctx.filePath,
                line,
                explanation: `${algo.toUpperCase()} has known collision vulnerabilities and should not be used for cryptographic security, password hashing, or digital signatures.`,
                suggestion: 'Use SHA-256 (crypto.createHash("sha256")) or bcrypt/argon2 for password hashing.',
                confidence: 'high',
                source: 'static_analysis',
                isDeterministic: true,
              });
            }
          }

          // 6. Sensitive Data Logging in console.log or logger
          const isLoggerCall =
            (t.isMemberExpression(callee) &&
              (t.isIdentifier(callee.object, { name: 'console' }) || t.isIdentifier(callee.object, { name: 'logger' }))) ||
            (t.isIdentifier(callee, { name: 'log' }) || t.isIdentifier(callee, { name: 'debug' }));

          if (isLoggerCall) {
            for (const arg of path.node.arguments) {
              // Check 6A: Logging secret environment variables (e.g. process.env.MONGODB_URI, process.env.API_KEY)
              if (t.isMemberExpression(arg)) {
                if (
                  t.isMemberExpression(arg.object) &&
                  t.isIdentifier(arg.object.object, { name: 'process' }) &&
                  t.isIdentifier(arg.object.property, { name: 'env' })
                ) {
                  const envName = getMemberName(arg.property);
                  if (envName && (SECRET_ENV_VARS.has(envName) || /secret|key|token|password|auth|uri/i.test(envName))) {
                    ctx.findings.push({
                      id: `sec-log-env-${ctx.filePath}-${line}`,
                      ruleId: 'no-secret-env-leak',
                      title: `Exposing secret environment variable (${envName}) in logs`,
                      category: 'security',
                      severity: 'critical',
                      filePath: ctx.filePath,
                      line,
                      explanation: `Printing process.env.${envName} in application logs exposes sensitive infrastructure credentials in plain text.`,
                      suggestion: 'Remove secret logging or use an obfuscation filter before outputting.',
                      confidence: 'high',
                      source: 'static_analysis',
                      isDeterministic: true,
                    });
                    break;
                  }
                }

                // Check 6B: Logging sensitive object properties (e.g. user.password, user.creditCard, user.ssn)
                const propName = getMemberName(arg.property);
                if (propName && SENSITIVE_PROPERTY_NAMES.has(propName.toLowerCase())) {
                  ctx.findings.push({
                    id: `sec-log-sensitive-${ctx.filePath}-${line}`,
                    ruleId: 'no-sensitive-logging',
                    title: `Logging sensitive user field (${propName}) in logs`,
                    category: 'security',
                    severity: 'high',
                    filePath: ctx.filePath,
                    line,
                    explanation: `Logging sensitive user data (e.g., .${propName}) can expose plaintext passwords, tokens, or PII into persistent log repositories (CWE-532).`,
                    suggestion: 'Mask or omit sensitive fields before passing to logger or console.log.',
                    confidence: 'high',
                    source: 'static_analysis',
                    isDeterministic: true,
                  });
                  break;
                }
              }

              // Check 6C: Logging entire process.env (console.log('Env:', process.env))
              if (
                t.isMemberExpression(arg) &&
                t.isIdentifier(arg.object, { name: 'process' }) &&
                t.isIdentifier(arg.property, { name: 'env' })
              ) {
                ctx.findings.push({
                  id: `sec-log-all-env-${ctx.filePath}-${line}`,
                  ruleId: 'no-secret-env-leak',
                  title: 'Exposing entire process.env object in application logs',
                  category: 'security',
                  severity: 'critical',
                  filePath: ctx.filePath,
                  line,
                  explanation: 'Dumping the entire process.env dictionary into logs leaks all secret API keys, database credentials, and session secrets.',
                  suggestion: 'Never log the full process.env object.',
                  confidence: 'high',
                  source: 'static_analysis',
                  isDeterministic: true,
                });
                break;
              }
            }
          }

          // 7. Unsafe Deserialization (serialize.unserialize)
          if (
            t.isMemberExpression(callee) &&
            t.isIdentifier(callee.property, { name: 'unserialize' })
          ) {
            ctx.findings.push({
              id: `sec-unserialize-${ctx.filePath}-${line}`,
              ruleId: 'no-unsafe-deserialization',
              title: 'Unsafe object deserialization (RCE risk)',
              category: 'security',
              severity: 'critical',
              filePath: ctx.filePath,
              line,
              explanation:
                'Calling unserialize() on untrusted user strings enables Remote Code Execution (RCE) via object prototype pollution and IIFE payloads.',
              suggestion: 'Use JSON.parse() instead of node-serialize.',
              confidence: 'high',
              source: 'static_analysis',
              isDeterministic: true,
            });
          }

          // 8. Server-Side Request Forgery (SSRF) via axios / fetch with request params
          const isHttpReq =
            (t.isMemberExpression(callee) &&
              (t.isIdentifier(callee.object, { name: 'axios' }) || t.isIdentifier(callee.object, { name: 'http' }) || t.isIdentifier(callee.object, { name: 'https' }))) ||
            t.isIdentifier(callee, { name: 'fetch' });

          if (isHttpReq && path.node.arguments.length > 0) {
            const urlArg = path.node.arguments[0];
            if (
              t.isMemberExpression(urlArg) &&
              t.isMemberExpression(urlArg.object) &&
              t.isIdentifier(urlArg.object.object, { name: 'req' }) &&
              (t.isIdentifier(urlArg.object.property, { name: 'query' }) || t.isIdentifier(urlArg.object.property, { name: 'body' }))
            ) {
              ctx.findings.push({
                id: `sec-ssrf-${ctx.filePath}-${line}`,
                ruleId: 'no-ssrf',
                title: 'Potential Server-Side Request Forgery (SSRF) via unvalidated request URL',
                category: 'security',
                severity: 'high',
                filePath: ctx.filePath,
                line,
                explanation:
                  'Passing untrusted client URLs directly to HTTP request clients allows attackers to probe internal cloud metadata services (169.254.169.254) or intranet services.',
                suggestion: 'Validate target URLs against an explicit allowlist of authorized hostnames.',
                confidence: 'high',
                source: 'static_analysis',
                isDeterministic: true,
              });
            }
          }
        },

        // 9. Client-Controlled Authorization Decision (e.g. const isAdmin = (role == 'admin'))
        BinaryExpression(path) {
          const line = path.node.loc?.start.line;
          if (!line || !isLineInDiff(line, ctx)) return;

          const { left, right } = path.node;

          // Check if either side is a variable derived from req.body (e.g. role) and compared with 'admin'
          const checkRoleComparison = (identNode: t.Node, literalNode: t.Node) => {
            if (
              t.isIdentifier(identNode) &&
              clientInputVars.has(identNode.name) &&
              t.isStringLiteral(literalNode) &&
              /admin|root|superuser/i.test(literalNode.value)
            ) {
              ctx.findings.push({
                id: `sec-client-role-${ctx.filePath}-${line}`,
                ruleId: 'no-client-controlled-role',
                title: 'Trusting client-controlled request body for privileged role check',
                category: 'security',
                severity: 'high',
                filePath: ctx.filePath,
                line,
                explanation:
                  'Comparing client-supplied input (from req.body) to evaluate administrative privileges allows authorization bypass. Role and permissions must be verified from trusted server-side session identity and verified database records.',
                suggestion: 'Authorize using req.user role verified on the server side, not req.body.',
                confidence: 'high',
                source: 'static_analysis',
                isDeterministic: true,
              });
            }
          };

          checkRoleComparison(left, right);
          checkRoleComparison(right, left);
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
      // Graceful fallback on AST traversal errors
    }
  }

  // 10. Line-by-line secret leak detection (filtered by diff if diff is provided)
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
