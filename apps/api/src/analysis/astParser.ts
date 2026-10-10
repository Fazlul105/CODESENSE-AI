import { parse, ParserPlugin } from '@babel/parser';
import * as t from '@babel/types';

export function parseSourceCode(sourceCode: string, filename: string): t.File | null {
  const isTypeScript = filename.endsWith('.ts') || filename.endsWith('.tsx');
  const isJsx = filename.endsWith('.jsx') || filename.endsWith('.tsx');

  const plugins: ParserPlugin[] = [
    'asyncGenerators',
    'classProperties',
    'dynamicImport',
    'exportDefaultFrom',
    'nullishCoalescingOperator',
    'optionalChaining',
    'objectRestSpread',
  ];

  if (isTypeScript) {
    plugins.push('typescript');
  }
  if (isJsx) {
    plugins.push('jsx');
  }

  try {
    return parse(sourceCode, {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      plugins,
      errorRecovery: true,
    });
  } catch (err: any) {
    // Attempt fallback with script mode
    try {
      return parse(sourceCode, {
        sourceType: 'unambiguous',
        plugins,
        errorRecovery: true,
      });
    } catch {
      return null;
    }
  }
}
