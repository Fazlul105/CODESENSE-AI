import { describe, it, expect } from 'vitest';
import { redactSensitiveData, redactObject } from './redact';

describe('redactSensitiveData utility', () => {
  it('redacts GitHub Personal Access Tokens', () => {
    const raw = 'const token = "ghp_111122223333444455556666777788889999";';
    const redacted = redactSensitiveData(raw);
    expect(redacted).not.toContain('111122223333444455556666777788889999');
    expect(redacted).toContain('ghp_');
  });

  it('redacts AWS Access Key IDs', () => {
    const raw = 'const key = "AKIAIOSFODNN7EXAMPLE";';
    const redacted = redactSensitiveData(raw);
    expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(redacted).toContain('AKIA');
  });

  it('redacts Private Keys', () => {
    const raw = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y7...SECRET_KEY_BODY...
-----END RSA PRIVATE KEY-----`;
    const redacted = redactSensitiveData(raw);
    expect(redacted).not.toContain('SECRET_KEY_BODY');
    expect(redacted).toContain('[REDACTED_PRIVATE_KEY_CONTENT]');
  });

  it('redacts MongoDB connection strings containing credentials', () => {
    const raw = 'mongodb+srv://admin_user:SuperSecretPassword123@cluster0.abc.mongodb.net/db';
    const redacted = redactSensitiveData(raw);
    expect(redacted).not.toContain('SuperSecretPassword123');
    expect(redacted).not.toContain('admin_user');
    expect(redacted).toContain('[REDACTED_USER]:[REDACTED_PASSWORD]@');
  });

  it('redacts generic API key assignment literals', () => {
    const raw = 'const apiKey = "example_mock_secret_token_value_998877";';
    const redacted = redactSensitiveData(raw);
    expect(redacted).not.toContain('mock_secret_token_value');
    expect(redacted).toContain('[REDACTED_SECRET]');
  });

  it('redacts nested objects via redactObject', () => {
    const obj = {
      user: 'alice',
      password: 'MySecretPassword99!',
      nested: {
        api_key: 'ghp_abcdefabcdefabcdefabcdefabcdefabcdef',
      },
    };
    const redacted = redactObject(obj);
    expect(redacted.password).not.toContain('MySecretPassword99!');
    expect(redacted.nested.api_key).not.toContain('abcdefabcdefabcdefabcdefabcdefabcdef');
    expect(redacted.user).toBe('alice');
  });
});
