const { validateBase64Size, validateBase64Fields } = require('../../utils/validation');

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
});
