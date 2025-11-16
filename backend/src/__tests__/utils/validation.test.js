const { validateBase64Size, validateBase64Fields, isValidUrl, validateUrlFields } = require('../../utils/validation');

describe('Validation Utilities', () => {
  describe('validateBase64Size', () => {
    test('should validate empty string', () => {
      const result = validateBase64Size('', 20);
      expect(result.valid).toBe(true);
      expect(result.error).toBe(null);
    });

    test('should validate null value', () => {
      const result = validateBase64Size(null, 20);
      expect(result.valid).toBe(true);
    });

    test('should validate small base64 string', () => {
      const smallBase64 = Buffer.from('hello world').toString('base64');
      const result = validateBase64Size(smallBase64, 20);
      expect(result.valid).toBe(true);
      expect(result.sizeMB).toBeLessThan(0.001);
    });

    test('should reject oversized base64 string', () => {
      // Create a base64 string larger than 1MB
      const largeData = 'A'.repeat(2 * 1024 * 1024); // 2MB of data
      const largeBase64 = Buffer.from(largeData).toString('base64');

      const result = validateBase64Size(largeBase64, 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
      expect(result.sizeMB).toBeGreaterThan(1);
    });

    test('should handle data URI prefix', () => {
      const data = 'hello world';
      const base64WithPrefix = `data:image/png;base64,${Buffer.from(data).toString('base64')}`;

      const result = validateBase64Size(base64WithPrefix, 20);
      expect(result.valid).toBe(true);
    });

    test('should respect custom size limit', () => {
      const data = 'A'.repeat(100 * 1024); // ~100KB
      const base64 = Buffer.from(data).toString('base64');

      const result1 = validateBase64Size(base64, 0.05); // 50KB limit
      expect(result1.valid).toBe(false);

      const result2 = validateBase64Size(base64, 1); // 1MB limit
      expect(result2.valid).toBe(true);
    });
  });

  describe('validateBase64Fields', () => {
    test('should validate multiple fields', () => {
      const body = {
        image_base64: Buffer.from('small image').toString('base64'),
        audio_base64: Buffer.from('small audio').toString('base64')
      };

      const result = validateBase64Fields(body, ['image_base64', 'audio_base64'], 20);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect oversized fields', () => {
      const largeData = 'A'.repeat(2 * 1024 * 1024);
      const body = {
        image_base64: Buffer.from(largeData).toString('base64')
      };

      const result = validateBase64Fields(body, ['image_base64'], 1);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('image_base64');
    });

    test('should validate only specified fields', () => {
      const largeData = 'A'.repeat(2 * 1024 * 1024);
      const body = {
        image_base64: Buffer.from('small').toString('base64'),
        other_field: Buffer.from(largeData).toString('base64')
      };

      const result = validateBase64Fields(body, ['image_base64'], 1);
      expect(result.valid).toBe(true);
    });

    test('should handle missing fields', () => {
      const body = {};

      const result = validateBase64Fields(body, ['image_base64'], 20);
      expect(result.valid).toBe(true);
    });
  });

  describe('isValidUrl', () => {
    test('should accept valid HTTP URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('http://example.com/path')).toBe(true);
    });

    test('should accept valid HTTPS URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('https://example.com:8080/path')).toBe(true);
    });

    test('should reject non-HTTP(S) protocols', () => {
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('file:///etc/passwd')).toBe(false);
      expect(isValidUrl('javascript:alert(1)')).toBe(false);
    });

    test('should reject localhost', () => {
      expect(isValidUrl('http://localhost')).toBe(false);
      expect(isValidUrl('http://localhost:8080')).toBe(false);
    });

    test('should reject loopback addresses', () => {
      expect(isValidUrl('http://127.0.0.1')).toBe(false);
      expect(isValidUrl('http://127.0.0.1:8080')).toBe(false);
      expect(isValidUrl('http://[::1]')).toBe(false);
    });

    test('should reject private IP ranges (10.x.x.x)', () => {
      expect(isValidUrl('http://10.0.0.1')).toBe(false);
      expect(isValidUrl('http://10.255.255.255')).toBe(false);
    });

    test('should reject private IP ranges (192.168.x.x)', () => {
      expect(isValidUrl('http://192.168.1.1')).toBe(false);
      expect(isValidUrl('http://192.168.0.100')).toBe(false);
    });

    test('should reject private IP ranges (172.16-31.x.x)', () => {
      expect(isValidUrl('http://172.16.0.1')).toBe(false);
      expect(isValidUrl('http://172.31.255.255')).toBe(false);
    });

    test('should reject cloud metadata endpoints', () => {
      expect(isValidUrl('http://169.254.169.254')).toBe(false);
      expect(isValidUrl('http://metadata.google.internal')).toBe(false);
    });

    test('should reject link-local addresses', () => {
      expect(isValidUrl('http://169.254.1.1')).toBe(false);
    });

    test('should reject invalid URLs', () => {
      expect(isValidUrl('not a url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl(null)).toBe(false);
      expect(isValidUrl(undefined)).toBe(false);
    });

    test('should accept public IP addresses', () => {
      expect(isValidUrl('http://8.8.8.8')).toBe(true);
      expect(isValidUrl('http://1.1.1.1')).toBe(true);
    });

    test('should accept public domain names', () => {
      expect(isValidUrl('https://www.example.com')).toBe(true);
      expect(isValidUrl('https://api.github.com')).toBe(true);
    });
  });

  describe('validateUrlFields', () => {
    test('should validate multiple URL fields', () => {
      const body = {
        url1: 'https://example.com',
        url2: 'https://api.example.com'
      };

      const result = validateUrlFields(body, ['url1', 'url2']);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect invalid URLs', () => {
      const body = {
        url1: 'http://localhost',
        url2: 'https://example.com'
      };

      const result = validateUrlFields(body, ['url1', 'url2']);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('url1');
    });

    test('should validate only specified fields', () => {
      const body = {
        url1: 'https://example.com',
        url2: 'http://localhost'
      };

      const result = validateUrlFields(body, ['url1']);
      expect(result.valid).toBe(true);
    });

    test('should handle missing fields', () => {
      const body = {};

      const result = validateUrlFields(body, ['url1']);
      expect(result.valid).toBe(true);
    });
  });
});
