# ComfyUI API Monitoring & Observability Guide

This document describes the monitoring and observability features added to the ComfyUI API system.

## Features Added

### 1. Frontend Pages ✅

The following new pages have been added to the frontend:

- **Logs Page** (`/logs`): Real-time log viewer with filtering and search
- **Queue Page** (`/queue`): Live job queue visualization with status tracking
- **Jobs Page** (`/jobs`): Job history with statistics and analytics
- **Files Page** (`/files`): Media file browser with preview capabilities
- **System Info Page** (`/system`): System metrics and resource monitoring dashboard
- **Settings Page** (`/settings`): Application configuration management
- **API Documentation Page** (`/api-docs`): Interactive Swagger API documentation

### 2. Monitoring & Observability ✅

#### Prometheus Metrics
- HTTP request metrics (rate, duration, status codes)
- Job processing metrics (total, duration, active count)
- Queue length tracking
- Container status metrics
- Database connection pool metrics
- System resource metrics (CPU, memory, disk)

**Access**: http://localhost:9090 (Prometheus UI)

#### Grafana Dashboards
- Pre-configured dashboards for API monitoring
- Real-time visualization of metrics
- Request rate and duration tracking
- Job processing analytics
- System resource monitoring

**Access**: http://localhost:3001
- Username: `admin`
- Password: `admin`

#### Health Checks
Comprehensive health check endpoints:

- `GET /api/health` - Overall system health
- `GET /api/health/detailed` - Detailed component health
- `GET /api/health/live` - Liveness probe
- `GET /api/health/ready` - Readiness probe
- `GET /api/health/metrics` - Prometheus metrics endpoint
- `GET /api/health/metrics/custom` - Custom JSON metrics for frontend
- `GET /api/health/logs` - Recent log entries

#### API Documentation
- Swagger/OpenAPI 3.0 documentation
- Interactive API explorer
- Request/response schemas
- Authentication documentation

**Access**: http://localhost:3000/api-docs

### 3. Testing Infrastructure ✅

#### Backend Testing
- **Jest**: Unit test framework
- **Supertest**: API integration testing
- Test files in `backend/src/__tests__/`

Run tests:
```bash
cd backend
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage
```

#### Frontend Testing
- **Jest + React Testing Library**: Component testing
- Test files in `frontend/src/__tests__/`

Run tests:
```bash
cd frontend
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage
```

#### E2E Testing
- **Cypress**: End-to-end testing framework
- Test files in `cypress/e2e/`

Run tests:
```bash
npx cypress open        # Interactive mode
npx cypress run         # Headless mode
```

#### CI/CD Pipeline
- **GitHub Actions**: Automated testing and deployment
- Workflow file: `.github/workflows/ci.yml`

Pipeline stages:
1. Backend tests with PostgreSQL service
2. Frontend tests and build
3. E2E tests with Cypress
4. Docker image build and push (main branch only)
5. Deployment (main branch only)

## Quick Start

### 1. Start all services including monitoring

```bash
docker-compose up -d
```

Services started:
- API: http://localhost:3006
- Frontend: http://localhost:8081
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001
- PostgreSQL: localhost:5432

### 2. View Metrics

#### Prometheus
1. Open http://localhost:9090
2. Query examples:
   - `rate(http_requests_total[5m])` - Request rate
   - `http_request_duration_seconds` - Request duration
   - `active_jobs` - Active job count
   - `queue_length` - Queue size

#### Grafana
1. Open http://localhost:3001
2. Login with admin/admin
3. Navigate to the "ComfyUI API Monitoring" dashboard
4. View real-time metrics and charts

#### Frontend Dashboard
1. Open http://localhost:8081
2. Navigate to "System Info" page
3. View real-time system metrics and health status

### 3. View Logs

#### Backend Logs (File-based)
```bash
tail -f backend/logs/combined.log
tail -f backend/logs/error.log
```

#### Frontend Logs Viewer
1. Open http://localhost:8081
2. Navigate to "Logs" page
3. Filter by level, search, auto-refresh

### 4. API Health Checks

```bash
# Basic health
curl http://localhost:3006/api/health

# Detailed health
curl http://localhost:3006/api/health/detailed

# Custom metrics
curl http://localhost:3006/api/health/metrics/custom
```

## Architecture

### Monitoring Stack
```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       ├──────────────────────────────┐
       │                              │
┌──────▼──────┐              ┌────────▼────────┐
│   Grafana   │◄─────────────┤   Prometheus    │
│   :3001     │              │     :9090       │
└─────────────┘              └────────┬────────┘
                                      │
                              ┌───────▼────────┐
                              │  ComfyUI API   │
                              │  Metrics       │
                              │  /api/health/  │
                              │  metrics       │
                              └────────────────┘
```

### Frontend Architecture
```
App (React Router)
├── Layout (Navigation)
└── Pages
    ├── ContainersPage
    ├── WorkflowsPage
    ├── LogsPage (Real-time)
    ├── QueuePage (Real-time)
    ├── JobsPage (Analytics)
    ├── FilesPage (Browser)
    ├── SystemInfoPage (Metrics)
    ├── SettingsPage
    └── ApiDocsPage (Swagger UI)
```

## Metrics Reference

### HTTP Metrics
- `http_requests_total` - Total HTTP requests (counter)
- `http_request_duration_seconds` - Request duration (histogram)

### Job Metrics
- `jobs_total` - Total jobs processed (counter)
- `job_duration_seconds` - Job processing duration (histogram)
- `active_jobs` - Currently active jobs (gauge)
- `queue_length` - Jobs in queue (gauge)

### Container Metrics
- `containers_total` - Total containers by status (gauge)

### Database Metrics
- `database_connections_active` - Active DB connections (gauge)

### System Metrics
- `process_cpu_seconds_total` - CPU usage
- `process_resident_memory_bytes` - Memory usage
- `nodejs_heap_size_total_bytes` - Node.js heap size

## Configuration

### Prometheus
Configuration file: `monitoring/prometheus/prometheus.yml`

Scrape targets:
- ComfyUI API: `api:3000/api/health/metrics`
- Prometheus self-monitoring

### Grafana
- Datasources: `monitoring/grafana/datasources/prometheus.yml`
- Dashboards: `monitoring/grafana/dashboards/`

### Environment Variables
```env
# API
NODE_ENV=production
PORT=3000
DB_HOST=db
DB_PORT=5432

# Frontend
REACT_APP_API_URL=http://localhost:3006/api

# Monitoring
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001
```

## Troubleshooting

### Prometheus not scraping metrics
1. Check API is running: `curl http://localhost:3006/api/health`
2. Check metrics endpoint: `curl http://localhost:3006/api/health/metrics`
3. Verify Prometheus config: `docker exec comfyui-prometheus cat /etc/prometheus/prometheus.yml`

### Grafana dashboard empty
1. Check Prometheus datasource connection in Grafana
2. Verify metrics are being collected: http://localhost:9090/targets
3. Check time range in Grafana (try "Last 5 minutes")

### Tests failing
```bash
# Backend tests
cd backend && npm install && npm test

# Frontend tests
cd frontend && npm install && npm test

# E2E tests
docker-compose up -d
npx cypress run
```

## Development

### Adding New Metrics
1. Define metric in `backend/src/middleware/metrics.js`
2. Instrument code to collect metric
3. Metric automatically exported to Prometheus

### Adding New Dashboard Panels
1. Create/modify dashboard JSON in `monitoring/grafana/dashboards/`
2. Restart Grafana: `docker-compose restart grafana`

### Writing Tests
- Backend: `backend/src/__tests__/`
- Frontend: `frontend/src/__tests__/`
- E2E: `cypress/e2e/`

## Production Recommendations

1. **Security**:
   - Change default Grafana password
   - Enable authentication for Prometheus
   - Use HTTPS for all services
   - Implement proper API key management

2. **Performance**:
   - Adjust Prometheus retention period
   - Configure log rotation
   - Set appropriate resource limits

3. **Alerting**:
   - Set up Prometheus Alertmanager
   - Configure alert rules for critical metrics
   - Integrate with notification channels (Slack, PagerDuty, etc.)

4. **Backup**:
   - Backup Prometheus data regularly
   - Backup Grafana dashboards and datasources
   - Backup application logs

## Support

For issues or questions:
- Check logs: `docker-compose logs -f api`
- Health check: `curl http://localhost:3006/api/health/detailed`
- View metrics: http://localhost:9090
