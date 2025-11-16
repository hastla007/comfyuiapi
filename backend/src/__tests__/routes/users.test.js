const request = require('supertest');
const express = require('express');
const usersRoutes = require('../../routes/users');
const { pool } = require('../../database');
const { requireAdmin } = require('../../middleware/auth');

// Mock dependencies
jest.mock('../../database');
jest.mock('../../middleware/auth');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/admin/users', usersRoutes);

describe('Users Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock admin middleware to always allow
    requireAdmin.mockImplementation((req, res, next) => next());
  });

  describe('GET /api/admin/users', () => {
    test('should list all users', async () => {
      const mockUsers = [
        { id: 1, email: 'user1@example.com', name: 'User 1', credits: 100, created_at: new Date() },
        { id: 2, email: 'user2@example.com', name: 'User 2', credits: 200, created_at: new Date() }
      ];

      pool.query.mockResolvedValue({ rows: mockUsers });

      const response = await request(app)
        .get('/api/admin/users')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.users).toHaveLength(2);
      expect(response.body.users[0].email).toBe('user1@example.com');
    });

    test('should handle database errors', async () => {
      pool.query.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/admin/users')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('internal_error');
    });
  });

  describe('GET /api/admin/users/:id', () => {
    test('should get specific user', async () => {
      const mockUser = {
        id: 1,
        email: 'user@example.com',
        name: 'Test User',
        credits: 100,
        created_at: new Date()
      };

      pool.query.mockResolvedValue({ rows: [mockUser] });

      const response = await request(app)
        .get('/api/admin/users/1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.email).toBe('user@example.com');
    });

    test('should return 404 for non-existent user', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/api/admin/users/999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('user_not_found');
    });

    test('should reject invalid user ID', async () => {
      const response = await request(app)
        .get('/api/admin/users/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('invalid_request');
    });
  });
});
