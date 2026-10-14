import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { sha256, hmacSha256 } from '../src/serialization/crypto';

describe('Cryptographic Parity Verification vs node:crypto Engine', () => {
  const testMessages = [
    '',
    'abc',
    'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    'The quick brown fox jumps over the lazy dog',
    'The quick brown fox jumps over the lazy cog',
    'a'.repeat(1000),
    'GameCore 0-Dependency Deterministic Game Engine v1.1.2 🚀 테스트 문자열 한글 포함',
    JSON.stringify({ entities: [{ id: 1, hp: 100 }, { id: 2, hp: 200 }], seed: 'seed-42' }),
  ];

  const testKeys = [
    'secret',
    'Jefe',
    'super-secure-gamecore-hmac-key-12345',
    'k'.repeat(100), // 블록 길이(64)보다 긴 키
  ];

  describe('NIST FIPS 180-4 SHA-256 Parity', () => {
    for (const msg of testMessages) {
      const label = msg.length > 30 ? `${msg.slice(0, 30)}... (len: ${msg.length})` : msg || '<empty>';
      it(`matches node:crypto for "${label}"`, () => {
        const expected = crypto.createHash('sha256').update(msg, 'utf8').digest('hex');
        const actual = sha256(msg);
        expect(actual).toBe(expected);
      });
    }
  });

  describe('RFC 2104 / RFC 4231 HMAC-SHA-256 Parity', () => {
    for (const key of testKeys) {
      for (const msg of testMessages.slice(0, 5)) {
        const keyLabel = key.length > 20 ? `${key.slice(0, 20)}...` : key;
        const msgLabel = msg.length > 20 ? `${msg.slice(0, 20)}...` : msg || '<empty>';

        it(`matches node:crypto HMAC with key "${keyLabel}" and msg "${msgLabel}"`, () => {
          const expected = crypto.createHmac('sha256', key).update(msg, 'utf8').digest('hex');
          const actual = hmacSha256(msg, key);
          expect(actual).toBe(expected);
        });
      }
    }
  });
});
