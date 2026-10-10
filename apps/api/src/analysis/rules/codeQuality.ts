import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { RuleContext } from './potentialBugs';

function isLineInDiff(line: number, ctx: RuleContext): boolean {
  return !ctx.addedLines || ctx.addedLines.size === 0 || ctx.addedLines.has(line);
}

export function runCodeQualityRules(ast: t.File | null, ctx: RuleContext): void {
  // 1. AST Traversal
  if (ast && (ast as any).type) {
    try {
      traverse(ast, {
    // Console log statement detection
    CallExpression(path) {
      const callee = path.node.callee;
      const line = path.node.loc?.start.line;
      if (!line || !isLineInDiff(line, ctx)) return;

      if (
        t.isMemberExpression(callee) &&
        t.isIdentifier(callee.object, { name: 'console' }) &&
        t.isIdentifier(callee.property, { name: 'log' })
      ) {
        ctx.findings.push({
          id: `qual-console-${ctx.filePath}-${line}`,
          ruleId: 'no-console-log',
          title: 'Leftover console.log in code',
          category: 'code_quality',
          severity: 'informational',
          filePath: ctx.filePath,
          line,
          explanation:
            'console.log statements left in committed code can pollute application logs and potentially leak sensitive runtime data in production.',
          suggestion: 'Remove console.log or replace it with a structured logging framework (e.g. Pino, Winston).',
          confidence: 'high',
          source: 'static_analysis',
          isDeterministic: true,
        });
      }
    },

    // Duplicate property keys in object literals
    ObjectExpression(path) {
      const keysSeen = new Set<string>();
      for (const prop of path.node.properties) {
        if (t.isObjectProperty(prop)) {
          let keyName = '';
          if (t.isIdentifier(prop.key)) {
            keyName = prop.key.name;
          } else if (t.isStringLiteral(prop.key)) {
            keyName = prop.key.value;
          }

          if (keyName) {
            if (keysSeen.has(keyName)) {
              const line = prop.loc?.start.line || path.node.loc?.start.line || 1;
              if (isLineInDiff(line, ctx)) {
                ctx.findings.push({
                  id: `qual-dup-key-${ctx.filePath}-${line}`,
                  ruleId: 'no-duplicate-keys',
                  title: `Duplicate object key "${keyName}"`,
                  category: 'code_quality',
                  severity: 'medium',
                  filePath: ctx.filePath,
                  line,
                  explanation: `The object defines property "${keyName}" multiple times. The latter definition silently overrides earlier values.`,
                  suggestion: `Remove or rename duplicate "${keyName}" property.`,
                  confidence: 'high',
                  source: 'static_analysis',
                  isDeterministic: true,
                });
              }
            } else {
              keysSeen.add(keyName);
            }
          }
        }
      }
    },

    // Excessive nesting complexity (> 3 levels of nested if/loops)
    IfStatement(path) {
      let depth = 0;
      let curr: any = path.parentPath;
      let prevNode: any = path.node;
      while (curr) {
        // If this is an 'else if' branch, do not count the parent if as extra nesting
        if (curr.isIfStatement() && curr.node.alternate === prevNode) {
          prevNode = curr.node;
          curr = curr.parentPath;
          continue;
        }

        if (
          curr.isIfStatement() ||
          curr.isForStatement() ||
          curr.isWhileStatement() ||
          curr.isDoWhileStatement() ||
          curr.isSwitchStatement()
        ) {
          depth++;
        }
        prevNode = curr.node;
        curr = curr.parentPath;
      }

      if (depth >= 4) {
        const line = path.node.loc?.start.line;
        if (line && isLineInDiff(line, ctx)) {
          ctx.findings.push({
            id: `qual-nesting-${ctx.filePath}-${line}`,
            ruleId: 'excessive-nesting-depth',
            title: `Excessive control flow nesting depth (${depth} levels)`,
            category: 'maintainability',
            severity: 'low',
            filePath: ctx.filePath,
            line,
            explanation:
              'Deeply nested conditional blocks increase cyclomatic complexity, making code difficult to read, reason about, and test thoroughly.',
            suggestion: 'Use guard clauses, early returns, or decompose into helper functions.',
            confidence: 'medium',
            source: 'static_analysis',
            isDeterministic: true,
          });
        }
      }
    },
      });
    } catch {
      // Graceful fallback
    }
  }

  // 2. Unresolved TODO / FIXME markers in source code (filtered by diff if diff provided)
  const lines = ctx.sourceCode.split('\n');
  lines.forEach((lineText, index) => {
    const lineNum = index + 1;
    if (!isLineInDiff(lineNum, ctx)) return;

    const match = lineText.match(/\/\/\s*(TODO|FIXME|HACK|XXX)\b:?\s*(.*)$/i);
    if (match) {
      ctx.findings.push({
        id: `qual-todo-${ctx.filePath}-${lineNum}`,
        ruleId: 'unresolved-todo',
        title: `Unresolved ${match[1].toUpperCase()} comment`,
        category: 'code_quality',
        severity: 'informational',
        filePath: ctx.filePath,
        line: lineNum,
        explanation: `Found an unresolved ${match[1].toUpperCase()} comment: "${match[2].trim() || 'No description provided'}". Ensure technical debt is addressed before merge.`,
        suggestion: 'Resolve the outstanding item or track it in your issue tracker.',
        confidence: 'high',
        source: 'static_analysis',
        isDeterministic: true,
      });
    }
  });
}
