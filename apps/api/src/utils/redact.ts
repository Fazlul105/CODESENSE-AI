/**
 * Secret and sensitive data redaction utility for CodeSense AI.
 * Prevents credentials, API keys, tokens, and private keys from leaking into
 * logs, database findings, LLM prompts, and exported reports.
 */

export interface RedactionPattern {
  name: string;
  regex: RegExp;
  mask: (...args: any[]) => string;
}

export const REDACTION_PATTERNS: RedactionPattern[] = [
  // GitHub Personal Access Tokens and OAuth tokens
  {
    name: 'GitHub Token',
    regex: /\b(gh[pousr]_[A-Za-z0-9_]{36,255}|github_pat_[A-Za-z0-9_]{82})\b/g,
    mask: (m: string) => `${m.slice(0, 4)}****************${m.slice(-3)}`,
  },
  // AWS Access Key ID
  {
    name: 'AWS Access Key ID',
    regex: /\b((?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16})\b/g,
    mask: (m: string) => `${m.slice(0, 4)}************${m.slice(-2)}`,
  },
  // JWT tokens (3 base64url segments separated by dots)
  {
    name: 'JWT Token',
    regex: /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_.-]{10,})\b/g,
    mask: () => '[REDACTED_JWT_TOKEN]',
  },
  // Private Key Headers and blocks
  {
    name: 'Private Key',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    mask: () => '-----BEGIN PRIVATE KEY-----\n[REDACTED_PRIVATE_KEY_CONTENT]\n-----END PRIVATE KEY-----',
  },
  // Connection strings containing passwords (MongoDB, PostgreSQL, MySQL, Redis, etc.)
  {
    name: 'Connection String Credentials',
    regex: /((?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/)([^:]+):([^@]+)@/gi,
    mask: (_match: string, protocol: string) => `${protocol}[REDACTED_USER]:[REDACTED_PASSWORD]@`,
  },
  // Generic API Keys / Secrets / Auth Tokens assignment patterns in code
  {
    name: 'Generic API Key / Secret Literal',
    regex: /((?:api[_-]?key|secret[_-]?key|auth[_-]?token|client[_-]?secret|access[_-]?token|password|passwd)\s*[:=]\s*["'])([^"'\r\n]{8,})(["'])/gi,
    mask: (_match: string, prefix: string, secret: string, suffix: string) => {
      const visibleStart = secret.slice(0, 2);
      const visibleEnd = secret.slice(-2);
      return `${prefix}${visibleStart}****[REDACTED_SECRET]****${visibleEnd}${suffix}`;
    },
  },
  // Bearer tokens in headers or strings
  {
    name: 'Bearer Token',
    regex: /(Bearer\s+)[A-Za-z0-9_.\-~+/]{20,}/gi,
    mask: (_match: string, prefix: string) => `${prefix}[REDACTED_BEARER_TOKEN]`,
  },
];

/**
 * Redacts known sensitive patterns from text.
 * Preserves syntax context while obfuscating secret values.
 */
export function redactSensitiveData(text: string | null | undefined): string {
  if (!text) return '';
  let sanitized = text;

  for (const pattern of REDACTION_PATTERNS) {
    sanitized = sanitized.replace(pattern.regex, (...args: any[]) => pattern.mask(...args));
  }

  return sanitized;
}

/**
 * Deeply redacts sensitive strings within arbitrary objects or arrays.
 */
export function redactObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return redactSensitiveData(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const copy: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (/password|secret|token|apiKey|authorization|passwd/i.test(key) && typeof value === 'string') {
        copy[key] = '[REDACTED_SECRET]';
      } else {
        copy[key] = redactObject(value);
      }
    }
    return copy;
  }
  return obj;
}
