-- Add container capacity fields
ALTER TABLE containers 
ADD COLUMN IF NOT EXISTS max_concurrent_jobs INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS health_status VARCHAR(50) DEFAULT 'healthy',
ADD COLUMN IF NOT EXISTS cpu_limit_percent DECIMAL(5,2) DEFAULT 100,
ADD COLUMN IF NOT EXISTS memory_limit_percent DECIMAL(5,2) DEFAULT 100;

-- Create table to track active jobs per container
CREATE TABLE IF NOT EXISTS container_active_jobs (
  id SERIAL PRIMARY KEY,
  container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'processing',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  UNIQUE(container_id, job_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_container_active_jobs_container 
  ON container_active_jobs(container_id, status);
CREATE INDEX IF NOT EXISTS idx_container_active_jobs_job 
  ON container_active_jobs(job_id);

-- Create view for container load information
CREATE OR REPLACE VIEW container_load_status AS
SELECT 
  c.id,
  c.name,
  c.port,
  c.status,
  c.max_concurrent_jobs,
  c.health_status,
  COUNT(CASE WHEN caj.status = 'processing' THEN 1 END) as active_job_count,
  COUNT(CASE WHEN caj.status = 'processing' THEN 1 END)::float / 
    NULLIF(c.max_concurrent_jobs, 0) * 100 as load_percent
FROM containers c
LEFT JOIN container_active_jobs caj ON c.id = caj.container_id
GROUP BY c.id, c.name, c.port, c.status, c.max_concurrent_jobs, c.health_status;
