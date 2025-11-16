const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ComfyUI API',
      version: '1.0.0',
      description: 'API for managing ComfyUI Docker containers and workflow execution',
      contact: {
        name: 'API Support',
        email: 'support@example.com'
      }
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      },
      schemas: {
        Container: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Docker container ID' },
            name: { type: 'string', description: 'Container name' },
            status: { type: 'string', enum: ['running', 'stopped', 'created'] },
            port: { type: 'integer', description: 'Container port' },
            workflow_id: { type: 'integer', description: 'Assigned workflow ID' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        Workflow: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Workflow ID' },
            name: { type: 'string', description: 'Workflow name' },
            description: { type: 'string', description: 'Workflow description' },
            file_path: { type: 'string', description: 'Path to workflow JSON file' },
            workflow_json: { type: 'object', description: 'Workflow configuration' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        Job: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Job ID' },
            workflow_id: { type: 'integer', description: 'Workflow ID' },
            container_id: { type: 'string', description: 'Container ID' },
            status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'] },
            priority: { type: 'integer', minimum: 1, maximum: 10 },
            input_data: { type: 'object', description: 'Job input parameters' },
            output_data: { type: 'object', description: 'Job output results' },
            progress: { type: 'integer', minimum: 0, maximum: 100 },
            created_at: { type: 'string', format: 'date-time' },
            started_at: { type: 'string', format: 'date-time' },
            completed_at: { type: 'string', format: 'date-time' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', description: 'Error message' }
          }
        }
      }
    },
    tags: [
      { name: 'Containers', description: 'Container management endpoints' },
      { name: 'Workflows', description: 'Workflow management endpoints' },
      { name: 'Jobs', description: 'Job queue and execution endpoints' },
      { name: 'Media', description: 'Media file management endpoints' },
      { name: 'Health', description: 'Health check and monitoring endpoints' },
      { name: 'Admin', description: 'Administrative endpoints' }
    ]
  },
  apis: ['./src/routes/*.js'] // Path to the API routes
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
