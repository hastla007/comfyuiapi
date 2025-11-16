# Quick Start Guide

Get up and running with ComfyUI Docker Manager in minutes!

## Prerequisites Check

Before starting, ensure you have:

```bash
# Check Docker
docker --version
# Expected: Docker version 24.0+

# Check Docker Compose
docker-compose --version
# Expected: Docker Compose version 2.0+

# Check NVIDIA drivers
nvidia-smi
# Should show your GPU(s)

# Check NVIDIA Docker runtime
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
# Should show GPU info
```

If any checks fail, see the [Installation section in README.md](README.md#installation).

## 5-Minute Setup

### 1. Clone and Configure

```bash
git clone https://github.com/yourusername/comfyuiapi.git
cd comfyuiapi
cp .env.example .env
```

### 2. Add Models (Optional for testing)

For initial testing, you can skip this step. However, to generate images, you'll need at least one checkpoint:

```bash
# Create model directories
mkdir -p models/checkpoints models/vae models/loras

# Download a model (example: SD 1.5)
# You can download from https://civitai.com/ or https://huggingface.co/
# Place .safetensors or .ckpt files in models/checkpoints/
```

### 3. Build the ComfyUI Image

**IMPORTANT**: Before starting the system, you must build the ComfyUI Docker image:

```bash
# Option A: Using the build script (recommended)
chmod +x build-comfyui-image.sh
./build-comfyui-image.sh

# Option B: Using Docker Compose directly
docker compose build comfyui-1
```

This step takes 5-15 minutes the first time. See [BUILD.md](BUILD.md) for detailed instructions.

### 4. Start the System

```bash
# Start all services
docker compose up -d

# Watch the logs
docker-compose logs -f
```

Wait for messages indicating services are ready:
- `ComfyUI API Server running on port 3000`
- `Database initialized successfully`

Press `Ctrl+C` to stop watching logs (services continue running).

### 5. Access the Interface

Open your browser and go to:

**Web Interface**: http://localhost:8080

You should see the ComfyUI Manager dashboard!

### 6. Test Your First Container

The docker-compose file includes two pre-configured containers:

1. Go to http://localhost:8188 - ComfyUI Instance 1
2. Go to http://localhost:8189 - ComfyUI Instance 2

Both should load the ComfyUI interface.

### 7. Create a New Container

In the web interface at http://localhost:8080:

1. Click **"+ Create New Container"**
2. Enter:
   - **Name**: `my-test-container`
   - **Port**: `8190`
3. Click **"Create Container"**
4. Wait a few seconds
5. Click **"Open"** to access your new ComfyUI instance

## Next Steps

### Add More Models

```bash
# Navigate to models directory
cd models/

# Create subdirectories
mkdir -p checkpoints vae loras controlnet upscale_models embeddings

# Add your models to the appropriate directories
# All containers will automatically have access to these models
```

### Stop the System

```bash
# Stop all containers
docker-compose down

# Stop and remove volumes (WARNING: deletes database)
docker-compose down -v
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f comfyui-1

# Last 100 lines
docker-compose logs --tail=100 api
```

### Restart a Service

```bash
# Restart specific service
docker-compose restart api
docker-compose restart comfyui-1

# Rebuild and restart
docker-compose up -d --build api
```

## Common Issues

### Port Already in Use

```bash
# Find what's using the port
sudo lsof -i :8080  # or :3000, :8188, etc.

# Kill the process or change the port in docker-compose.yml
```

### GPU Not Accessible

```bash
# Ensure NVIDIA Container Toolkit is installed
sudo apt install -y nvidia-container-toolkit

# Restart Docker
sudo systemctl restart docker

# Test again
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
```

### Container Build Fails

```bash
# Clean up and rebuild
docker-compose down
docker system prune -a
docker-compose build --no-cache
docker-compose up -d
```

### Database Connection Failed

```bash
# Reset database
docker-compose down -v
docker-compose up -d db
sleep 30  # Wait for DB to initialize
docker-compose up -d
```

## Production Deployment

For production use:

1. **Change passwords** in `.env`:
   ```bash
   DB_PASSWORD=your_secure_random_password_here
   ```

2. **Set up reverse proxy** (nginx/traefik) with SSL

3. **Configure firewall**:
   ```bash
   # Only allow necessary ports
   sudo ufw allow 80/tcp   # HTTP
   sudo ufw allow 443/tcp  # HTTPS
   sudo ufw enable
   ```

4. **Enable authentication** (implement in backend)

5. **Set up backups** for database and models

6. **Monitor resources**:
   ```bash
   docker stats
   nvidia-smi -l 1
   ```

## Getting Help

- Full documentation: [README.md](README.md)
- Report issues: GitHub Issues
- Check logs: `docker-compose logs -f`

## Useful Commands

```bash
# Check system status
docker-compose ps

# Access a container shell
docker exec -it comfyui-instance-1 /bin/bash

# View resource usage
docker stats

# Check GPU usage
watch -n 1 nvidia-smi

# Restart everything
docker-compose restart

# Update and rebuild
git pull
docker-compose up -d --build

# Cleanup unused images
docker image prune -a
```

Enjoy using ComfyUI Docker Manager!
