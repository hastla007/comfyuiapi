-- ======================================================
-- COMPREHENSIVE DATABASE MIGRATION FOR ALL 10 FEATURES
-- ======================================================

-- ============================================
-- FEATURE 2: User Authentication & Multi-Tenancy
-- ============================================

-- Update users table with full authentication support
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create organization members table
CREATE TABLE IF NOT EXISTS organization_members (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, user_id)
);

-- Add organization_id to containers and jobs
ALTER TABLE containers ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;

-- ============================================
-- FEATURE 3: Workflow Marketplace
-- ============================================

-- Create marketplace workflows table
CREATE TABLE IF NOT EXISTS marketplace_workflows (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER REFERENCES workflows(id) ON DELETE CASCADE,
  author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  tags TEXT[],
  version VARCHAR(50) DEFAULT '1.0.0',
  is_published BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  downloads_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP
);

-- Create workflow ratings table
CREATE TABLE IF NOT EXISTS workflow_ratings (
  id SERIAL PRIMARY KEY,
  marketplace_workflow_id INTEGER REFERENCES marketplace_workflows(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(marketplace_workflow_id, user_id)
);

-- Create workflow versions table
CREATE TABLE IF NOT EXISTS workflow_versions (
  id SERIAL PRIMARY KEY,
  marketplace_workflow_id INTEGER REFERENCES marketplace_workflows(id) ON DELETE CASCADE,
  version VARCHAR(50) NOT NULL,
  workflow_json JSONB NOT NULL,
  changelog TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(marketplace_workflow_id, version)
);

-- ============================================
-- FEATURE 4: Advanced Job Management
-- ============================================

-- Create job templates table
CREATE TABLE IF NOT EXISTS job_templates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  workflow_id INTEGER REFERENCES workflows(id) ON DELETE SET NULL,
  parameters JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create job dependencies table
CREATE TABLE IF NOT EXISTS job_dependencies (
  id SERIAL PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  depends_on_job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, depends_on_job_id)
);

-- Create scheduled jobs table
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  workflow_id INTEGER REFERENCES workflows(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  cron_expression VARCHAR(100) NOT NULL,
  parameters JSONB,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMP,
  next_run_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add batch_id to jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS batch_id VARCHAR(100);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parent_job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL;

-- ============================================
-- FEATURE 5: Smart Container Auto-Scaling
-- ============================================

-- Create container pools table
CREATE TABLE IF NOT EXISTS container_pools (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  min_containers INTEGER DEFAULT 1,
  max_containers INTEGER DEFAULT 10,
  target_queue_depth INTEGER DEFAULT 5,
  scale_up_threshold INTEGER DEFAULT 3,
  scale_down_threshold INTEGER DEFAULT 1,
  idle_timeout_minutes INTEGER DEFAULT 30,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add pool_id to containers
ALTER TABLE containers ADD COLUMN IF NOT EXISTS pool_id INTEGER REFERENCES container_pools(id) ON DELETE SET NULL;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create scaling events table
CREATE TABLE IF NOT EXISTS scaling_events (
  id SERIAL PRIMARY KEY,
  pool_id INTEGER REFERENCES container_pools(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  container_count_before INTEGER,
  container_count_after INTEGER,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- FEATURE 6: Distributed Storage
-- ============================================

-- Create storage backends table
CREATE TABLE IF NOT EXISTS storage_backends (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  config JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create media files table
CREATE TABLE IF NOT EXISTS media_files (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  storage_backend_id INTEGER REFERENCES storage_backends(id) ON DELETE SET NULL,
  filename VARCHAR(255) NOT NULL,
  path TEXT NOT NULL,
  size_bytes BIGINT,
  mime_type VARCHAR(100),
  storage_key TEXT,
  cdn_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

-- Add storage quotas to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT DEFAULT 10737418240; -- 10GB default
ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT DEFAULT 0;

-- ============================================
-- FEATURE 7: Result Caching
-- ============================================

-- Create cache entries table
CREATE TABLE IF NOT EXISTS cache_entries (
  id SERIAL PRIMARY KEY,
  cache_key VARCHAR(255) UNIQUE NOT NULL,
  workflow_id INTEGER REFERENCES workflows(id) ON DELETE CASCADE,
  parameters_hash VARCHAR(64) NOT NULL,
  result JSONB NOT NULL,
  output_url TEXT,
  hit_count INTEGER DEFAULT 0,
  ttl_seconds INTEGER DEFAULT 3600,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at ON cache_entries(expires_at);
CREATE INDEX IF NOT EXISTS idx_cache_entries_parameters_hash ON cache_entries(parameters_hash);

-- ============================================
-- FEATURE 8: GPU Resource Management
-- ============================================

-- Create GPU resources table
CREATE TABLE IF NOT EXISTS gpu_resources (
  id SERIAL PRIMARY KEY,
  gpu_index INTEGER NOT NULL,
  gpu_uuid VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  total_memory_mb INTEGER,
  allocated_memory_mb INTEGER DEFAULT 0,
  allocation_policy VARCHAR(50) DEFAULT 'shared',
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add GPU allocation to containers
ALTER TABLE containers ADD COLUMN IF NOT EXISTS gpu_resource_id INTEGER REFERENCES gpu_resources(id) ON DELETE SET NULL;
ALTER TABLE containers ADD COLUMN IF NOT EXISTS gpu_memory_limit_mb INTEGER;

-- Create GPU usage logs
CREATE TABLE IF NOT EXISTS gpu_usage_logs (
  id SERIAL PRIMARY KEY,
  gpu_resource_id INTEGER REFERENCES gpu_resources(id) ON DELETE CASCADE,
  container_id INTEGER REFERENCES containers(id) ON DELETE SET NULL,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  memory_used_mb INTEGER,
  utilization_percent DECIMAL(5,2),
  temperature_celsius INTEGER,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- FEATURE 9: Job Queue Optimization
-- ============================================

-- Add priority levels and SLA to jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority_level VARCHAR(50) DEFAULT 'normal';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMP;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS estimated_cost_credits DECIMAL(10,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS actual_cost_credits DECIMAL(10,2);

-- Create queue configuration table
CREATE TABLE IF NOT EXISTS queue_configs (
  id SERIAL PRIMARY KEY,
  priority_level VARCHAR(50) UNIQUE NOT NULL,
  weight INTEGER DEFAULT 1,
  max_concurrent INTEGER DEFAULT 5,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default queue configs
INSERT INTO queue_configs (priority_level, weight, max_concurrent)
VALUES
  ('critical', 10, 10),
  ('high', 5, 5),
  ('normal', 3, 3),
  ('low', 1, 1)
ON CONFLICT (priority_level) DO NOTHING;

-- ============================================
-- FEATURE 10: Enhanced Security
-- ============================================

-- Enhance API keys table
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_rotated_at TIMESTAMP;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rotation_policy VARCHAR(50) DEFAULT 'manual';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS allowed_ips TEXT[];

-- Create audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  request_id VARCHAR(100),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- Create security events table
CREATE TABLE IF NOT EXISTS security_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ip_address VARCHAR(45),
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  data JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- ============================================
-- ADDITIONAL INDEXES FOR PERFORMANCE
-- ============================================

-- Jobs indexes
CREATE INDEX IF NOT EXISTS idx_jobs_batch_id ON jobs(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_parent_job_id ON jobs(parent_job_id) WHERE parent_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_priority_level ON jobs(priority_level);
CREATE INDEX IF NOT EXISTS idx_jobs_sla_deadline ON jobs(sla_deadline) WHERE sla_deadline IS NOT NULL;

-- Marketplace workflows indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_workflows_category ON marketplace_workflows(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_workflows_tags ON marketplace_workflows USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_marketplace_workflows_published ON marketplace_workflows(is_published) WHERE is_published = true;

-- Organization members indexes
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_org_id ON organization_members(organization_id);

COMMIT;
