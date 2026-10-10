import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { ReviewFinding } from '@codesense/shared';

export interface RuleContext {
  filePath: string;
  sourceCode: string;
  addedLines: Set<number>;
  findings: ReviewFinding[];
}

function isLineInDiff(line: number, ctx: RuleContext): boolean {
  return !ctx.addedLines || ctx.addedLines.size === 0 || ctx.addedLines.has(line);
}

export function runPotentialBugRules(ast: t.File | null, ctx: RuleContext): void {
  if (ast && (ast as any).type) {
    try {
      traverse(ast, {
    // 1. Suspicious Equality check (== vs ===, or NaN comparisons)
    BinaryExpression(path) {
      const node = path.node;
      const line = node.loc?.start.line;
      if (!line || !isLineInDiff(line, ctx)) return;

      // Check comparison against NaN (both identifier NaN and MemberExpression Number.NaN)
      const isNaNIdentifier = (n: any) => t.isIdentifier(n, { name: 'NaN' });
      const isNumberNaN = (n: any) =>
        t.isMemberExpression(n) &&
        t.isIdentifier(n.object, { name: 'Number' }) &&
        t.isIdentifier(n.property, { name: 'NaN' });

      const isComparingNaN =
        (isNaNIdentifier(node.left) ||
          isNaNIdentifier(node.right) ||
          isNumberNaN(node.left) ||
          isNumberNaN(node.right)) &&
        (node.operator === '===' || node.operator === '!==' || node.operator === '==' || node.operator === '!=');

      if (isComparingNaN) {
        ctx.findings.push({
          id: `bug-nan-${ctx.filePath}-${line}`,
          ruleId: 'suspicious-nan-comparison',
          title: 'Direct comparison with NaN always fails',
          category: 'potential_bug',
          severity: 'high',
          filePath: ctx.filePath,
          line,
          explanation:
            'In JavaScript, NaN is not equal to anything, including itself (NaN === NaN is false). Comparing with NaN directly causes the condition to behave unexpectedly.',
          suggestion: 'Use Number.isNaN(value) to reliably check for NaN values.',
          confidence: 'high',
          source: 'static_analysis',
          isDeterministic: true,
        });
      }

      // Check loose equality (== and !=) when not comparing against null
      if (node.operator === '==' || node.operator === '!=') {
        const isNullCheck = t.isNullLiteral(node.left) || t.isNullLiteral(node.right);
        if (!isNullCheck) {
          ctx.findings.push({
            id: `bug-loose-eq-${ctx.filePath}-${line}`,
            ruleId: 'suspicious-equality',
            title: `Unsafe loose equality operator "${node.operator}"`,
            category: 'potential_bug',
            severity: 'medium',
            filePath: ctx.filePath,
            line,
            explanation: `Using "${node.operator}" performs implicit type coercion, which can introduce subtle bugs when comparing numbers, booleans, and strings.`,
            suggestion: `Replace "${node.operator}" with strict equality "${node.operator === '==' ? '===' : '!=='}".`,
            confidence: 'high',
            source: 'static_analysis',
            isDeterministic: true,
          });
        }
      }
    },

    // 2. Unreachable code detection
    BlockStatement(path) {
      const body = path.node.body;
      for (let i = 0; i < body.length - 1; i++) {
        const stmt = body[i];
        if (
          t.isReturnStatement(stmt) ||
          t.isThrowStatement(stmt) ||
          t.isBreakStatement(stmt) ||
          t.isContinueStatement(stmt)
        ) {
          const unreachableStmt = body[i + 1];
          // Function declarations are hoisted in JavaScript and thus not unreachable
          if (t.isFunctionDeclaration(unreachableStmt)) {
            continue;
          }
          const line = unreachableStmt.loc?.start.line;
          if (line && isLineInDiff(line, ctx)) {
            ctx.findings.push({
              id: `bug-unreachable-${ctx.filePath}-${line}`,
              ruleId: 'unreachable-code',
              title: 'Unreachable code detected after terminating statement',
              category: 'potential_bug',
              severity: 'high',
              filePath: ctx.filePath,
              line,
              explanation:
                'Statements following a return, throw, break, or continue in the same block will never execute, indicating dead code or logic errors.',
              suggestion: 'Remove the unreachable statements or fix the control flow.',
              confidence: 'high',
              source: 'static_analysis',
              isDeterministic: true,
            });
            break;
          }
        }
      }
    },

    // 3. Constant condition detection
    IfStatement(path) {
      const test = path.node.test;
      const line = path.node.loc?.start.line;
      if (!line || !isLineInDiff(line, ctx)) return;

      if (t.isBooleanLiteral(test)) {
        ctx.findings.push({
          id: `bug-const-cond-${ctx.filePath}-${line}`,
          ruleId: 'constant-condition',
          title: `Constant condition in if statement: if (${test.value})`,
          category: 'potential_bug',
          severity: 'medium',
          filePath: ctx.filePath,
          line,
          explanation: `The condition is hardcoded to ${test.value}. One branch will always execute while the alternate branch is dead code.`,
          suggestion: 'Ensure the condition uses dynamic variables or remove the redundant check.',
          confidence: 'high',
          source: 'static_analysis',
          isDeterministic: true,
        });
      }
    },

    // 4. Suspicious async function without await
    Function(path) {
      if (path.node.async) {
        let hasAwait = false;
        path.traverse({
          AwaitExpression() {
            hasAwait = true;
          },
          // Support for-await loop constructs: for await (const x of iter)
          ForOfStatement(forPath) {
            if (forPath.node.await) {
              hasAwait = true;
            }
          },
          // Don't count await inside nested functions
          Function(nestedPath) {
            nestedPath.skip();
          },
        });

        const line = path.node.loc?.start.line;
        if (!hasAwait && line && isLineInDiff(line, ctx)) {
          ctx.findings.push({
            id: `bug-async-no-await-${ctx.filePath}-${line}`,
            ruleId: 'suspicious-async',
            title: 'Async function contains no await expressions',
            category: 'potential_bug',
            severity: 'low',
            filePath: ctx.filePath,
            line,
            explanation:
              'Declaring a function as async introduces Promise overhead and can mask synchronous execution without awaiting any asynchronous tasks.',
            suggestion: 'Remove the async keyword or await the intended asynchronous operation.',
            confidence: 'medium',
            source: 'static_analysis',
            isDeterministic: true,
          });
        }
      }
    },

    // 5. Swallowed error in catch block
    CatchClause(path) {
      const body = path.node.body.body;
      const line = path.node.loc?.start.line;
      if (body.length === 0 && line && isLineInDiff(line, ctx)) {
        ctx.findings.push({
          id: `bug-swallowed-error-${ctx.filePath}-${line}`,
          ruleId: 'swallowed-error',
          title: 'Empty catch block silently swallows errors',
          category: 'potential_bug',
          severity: 'medium',
          filePath: ctx.filePath,
          line,
          explanation:
            'Silently discarding exceptions without logging or handling them conceals runtime failures, complicating debugging.',
          suggestion: 'Log the error, re-throw it, or document why ignoring it is safe.',
          confidence: 'high',
          source: 'static_analysis',
          isDeterministic: true,
        });
      }
    },
      });
    } catch {
      // Graceful fallback
    }
  }
}
