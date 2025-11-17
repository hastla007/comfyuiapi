# Workflow Loading Fix

## Issue
Users were seeing "No workflows found" in the ComfyUI interface, and workflows were not loading when assigned to instances.

## Root Cause
The system was missing the `.env` file, which prevented the backend from starting properly. Without a running backend:
1. The workflow scanner doesn't run on startup
2. Workflow JSON files in `/workflows/` directory are not imported into the database
3. The API returns an empty array
4. The frontend displays "No workflows found"

## How Workflow Loading Works

### 1. **Workflow Storage**
- Workflow JSON files are stored in the `./workflows/` directory (host filesystem)
- These files contain ComfyUI workflow definitions
- Currently includes 7 workflows:
  - FlashVSR-Video-Upscaler.json
  - Flux-DyPE-FP8.json
  - InfiniteTalk-WAN21-I2V-FP8-Lip-Sync.json
  - InfiniteTalk-WAN22-V2V-FP8-Lip-Sync.json
  - WAN2-2-Animate.json
  - flux_dev_t5fp16.json
  - flux_schnell_t5fp8.json

### 2. **Workflow Scanner (backend/src/services/workflowScanner.js)**
On backend startup, the scanner:
- Scans the workflows directory (`WORKFLOWS_DIR` env variable, default: `/app/workflows`)
- Reads all `.json` files
- Extracts workflow name (from `name` field in JSON, or uses filename)
- Imports/updates workflows in PostgreSQL database
- Logs import summary

### 3. **Volume Mounting (docker-compose.yml)**
```yaml
# Backend API container
volumes:
  - ./workflows:/app/workflows  # Scanner reads from here

# ComfyUI instance containers
volumes:
  - ./workflows/instance-1:/app/workflows  # Instance reads workflow.json from here
  - ./workflows/instance-2:/app/workflows
```

### 4. **Workflow Assignment Flow**
When a workflow is assigned to a container instance:
1. API receives request: `POST /api/workflows/:id/assign/:containerId`
2. Updates database: `containers.workflow_id = :id`
3. Fetches workflow JSON from database
4. Writes to filesystem: `./workflows/instance-{id}/workflow.json`
5. Restarts container (if running) to load new workflow

### 5. **API Endpoint**
- `GET /api/workflows` - Returns all workflows from database
- Frontend fetches and displays these workflows

## The Fix

### Changes Made

1. **Created `.env` file** from `.env.example`
   - Required for backend to start properly
   - Contains database credentials and configuration

2. **Added `WORKFLOWS_DIR` to `.env` and `.env.example`**
   ```env
   # Workflows directory path (default: /app/workflows)
   # In Docker: /app/workflows (mounted from ./workflows)
   # In development: /home/user/comfyuiapi/workflows or set to your local path
   WORKFLOWS_DIR=/app/workflows
   ```

### Why This Works

With the `.env` file in place:
1. Backend can connect to the database (has `DB_PASSWORD`)
2. Backend starts successfully
3. Workflow scanner runs automatically on startup
4. All 7 workflow JSON files are imported into the database
5. API endpoint `/api/workflows` returns the workflows
6. Frontend displays the workflows
7. Workflows can now be assigned to container instances

## Required Actions

### For Docker Deployment (Production)

1. **Set secure passwords** in `.env`:
   ```bash
   # Generate secure passwords
   openssl rand -base64 32

   # Update these in .env:
   DB_PASSWORD=<generated_password>
   ADMIN_TOKEN=<generated_token>
   GRAFANA_ADMIN_PASSWORD=<generated_password>
   ```

2. **Start the system**:
   ```bash
   # Build the ComfyUI image first (if not done)
   ./build-comfyui-image.sh

   # Start all services
   docker compose up -d

   # Check logs to verify workflow import
   docker compose logs -f api | grep workflow
   ```

   You should see output like:
   ```
   Scanning workflows directory: /app/workflows
   Found 7 workflow file(s)
   ✓ Imported workflow: FlashVSR-Video-Upscaler
   ✓ Imported workflow: Flux-DyPE-FP8
   ...
   Workflow import summary: 7 imported, 0 updated, 0 skipped
   ```

3. **Verify workflows are loaded**:
   - Open http://localhost:8080 (web interface)
   - You should see all 7 workflows listed
   - Workflows can now be assigned to container instances

### For Development (Local)

If running the backend outside Docker:

1. **Update `WORKFLOWS_DIR` in `.env`**:
   ```env
   WORKFLOWS_DIR=/home/user/comfyuiapi/workflows
   ```

2. **Start the backend**:
   ```bash
   cd backend
   npm install
   npm start
   ```

3. **Verify workflows are imported**:
   Check console output for workflow scanner logs.

## Verification

After implementing the fix:

1. **Check database**:
   ```bash
   docker exec -it comfyui-db psql -U comfyui -d comfyui -c "SELECT id, name FROM workflows;"
   ```
   Should show 7 workflows.

2. **Check API endpoint**:
   ```bash
   curl http://localhost:3000/api/workflows
   ```
   Should return JSON with all workflows.

3. **Check web interface**:
   - Navigate to http://localhost:8080
   - Workflows page should display all 7 workflows
   - No "No workflows found" message

4. **Test workflow assignment**:
   - Select a container instance
   - Assign a workflow from the dropdown
   - Verify the workflow file is created in `./workflows/instance-{id}/workflow.json`
   - Access the ComfyUI instance and verify workflow is loaded

## Additional Notes

- Workflows are scanned **only on backend startup**
- To import new workflows:
  1. Add `.json` files to `./workflows/` directory
  2. Restart the backend: `docker compose restart api`
  3. Check logs to verify import

- Workflow JSON files must be valid ComfyUI workflow format
- Workflow names must be unique (database constraint)
- If a workflow file has a `name` field, that's used; otherwise filename is used

## Related Files
- `backend/src/services/workflowScanner.js` - Workflow scanner implementation
- `backend/src/routes/workflows.js` - Workflow API endpoints
- `docker-compose.yml` - Volume mount configuration
- `.env.example` - Environment variable template
- `.env` - Active configuration (git-ignored)
