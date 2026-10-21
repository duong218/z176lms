// Kiểm tra nhanh: maxAge của cookie refresh khớp hạn (exp) của token, không còn cứng 7 ngày.
// Chạy: node test/test_refresh_cookie.mjs   (từ thư mục server/)
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { refreshCookieOptions } from '../src/services/auth.service.js';

const token = jwt.sign({ sub: 'u1', type: 'refresh' }, 'test-secret', { expiresIn: '1d' });
const { maxAge, httpOnly } = refreshCookieOptions(token);

assert.ok(httpOnly, 'cookie phải httpOnly');
assert.ok(Math.abs(maxAge - 24 * 3600 * 1000) < 5000, `maxAge lệch hạn token: ${maxAge}`);
assert.equal(refreshCookieOptions('khong-phai-jwt').maxAge, undefined);

console.log('OK: maxAge cookie refresh khớp hạn token (1 ngày)');
