# ComfyUI Docker Manager

A comprehensive Docker-based application for managing multiple ComfyUI instances with NVIDIA GPU support. This system provides a web interface and REST API for creating, managing, and monitoring ComfyUI containers, each with its own workflow configuration.

## Features

- 🐳 **Multi-Container Management**: Run multiple ComfyUI instances simultaneously
- 🎮 **NVIDIA GPU Support**: Full GPU acceleration for all containers
- 🌐 **Web Interface**: Modern React-based UI for easy management
- 🔌 **REST API**: Complete API for programmatic container control
- 📊 **Real-time Monitoring**: Track container status, logs, and statistics
- 🔄 **Workflow Management**: Assign and manage different workflows per container
- 🔧 **Easy Scaling**: Add new containers with a few clicks
- 💾 **Shared Resources**: Common model storage across all instances

## Architecture

```
┌─────────────────────────────────────────────────┐
│           Frontend (React + Nginx)              │
│              Port 8080                          │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│         Backend API (Node.js)                   │
│              Port 3000                          │
└────────────────┬────────────────────────────────┘
                 │
    ┌────────────┼────────────┬──────────┐
    ▼            ▼            ▼          ▼
┌────────┐  ┌─────────┐  ┌─────────┐  ┌──────────┐
│ ComfyUI│  │ ComfyUI │  │ ComfyUI │  │PostgreSQL│
│   #1   │  │   #2    │  │   #3    │  │    DB    │
│  8188  │  │  8189   │  │  8190   │  │   5432   │
└────────┘  └─────────┘  └─────────┘  └──────────┘
     │           │            │
     └───────────┴────────────┴──────────────┐
                                             ▼
                                    ┌─────────────────┐
                                    │ Shared Volumes  │
                                    │ - Models        │
                                    │ - Workflows     │
                                    │ - Output        │
                                    └─────────────────┘
```

## Prerequisites

### System Requirements
- **OS**: Linux (Ubuntu 20.04+ recommended)
- **GPU**: NVIDIA GPU with CUDA support
- **RAM**: 16GB minimum (32GB+ recommended)
- **Storage**: 50GB+ free space (more for models)

### Software Requirements
- Docker 24.0+
- Docker Compose 2.0+
- NVIDIA Container Toolkit
- NVIDIA GPU drivers (535.0+)

## Installation

### 1. Install Docker and Docker Compose

```bash
# Update package list
sudo apt update

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin
```

### 2. Install NVIDIA Container Toolkit

```bash
# Add NVIDIA package repositories
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list

# Install nvidia-container-toolkit
sudo apt update
sudo apt install -y nvidia-container-toolkit

# Restart Docker
sudo systemctl restart docker

# Test GPU access
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
```

### 3. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/comfyuiapi.git
cd comfyuiapi

# Create environment file
cp .env.example .env

# Review and modify .env if needed
nano .env
```

### 4. Add Models

Place your ComfyUI models in the `models/` directory:

```
models/
├── checkpoints/          # Stable Diffusion checkpoints
├── vae/                  # VAE models
├── loras/                # LoRA models
├── embeddings/           # Textual inversions
├── controlnet/           # ControlNet models
└── upscale_models/       # Upscaling models
```

You can download models from:
- [Civitai](https://civitai.com/)
- [Hugging Face](https://huggingface.co/)
- [ComfyUI Model Repository](https://comfyanonymous.github.io/ComfyUI_examples/)

## Usage

### Start the Application

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

### Access the Web Interface

Open your browser and navigate to:
- **Frontend**: http://localhost:8080
- **API**: http://localhost:3000
- **ComfyUI Instance 1**: http://localhost:8188
- **ComfyUI Instance 2**: http://localhost:8189

### Create a New Container

1. Open the web interface at http://localhost:8080
2. Click "Create New Container"
3. Enter a name and port number
4. Click "Create Container"
5. Wait for the container to start
6. Click "Open" to access the ComfyUI interface

### Managing Containers

**Start a container:**
```bash
# Via Web UI: Click the "Start" button
# Via API:
curl -X POST http://localhost:3000/api/containers/{container_id}/start
```

**Stop a container:**
```bash
# Via Web UI: Click the "Stop" button
# Via API:
curl -X POST http://localhost:3000/api/containers/{container_id}/stop
```

**View logs:**
```bash
# Via API:
curl http://localhost:3000/api/containers/{container_id}/logs?tail=100

# Via Docker:
docker logs comfyui-instance-1
```

## API Documentation

### Container Endpoints

#### Get All Containers
```bash
GET /api/containers
```

#### Create Container
```bash
POST /api/containers
Content-Type: application/json

{
  "name": "comfyui-sdxl",
  "port": 8190,
  "workflowId": 1
}
```

#### Start Container
```bash
POST /api/containers/:id/start
```

#### Stop Container
```bash
POST /api/containers/:id/stop
```

#### Restart Container
```bash
POST /api/containers/:id/restart
```

#### Delete Container
```bash
DELETE /api/containers/:id
```

#### Get Container Logs
```bash
GET /api/containers/:id/logs?tail=100
```

#### Get Container Stats
```bash
GET /api/containers/:id/stats
```

### Workflow Endpoints

#### Get All Workflows
```bash
GET /api/workflows
```

#### Create Workflow
```bash
POST /api/workflows
Content-Type: application/json

{
  "name": "SDXL Workflow",
  "description": "Basic SDXL generation",
  "workflowJson": { ... }
}
```

#### Assign Workflow to Container
```bash
POST /api/workflows/:id/assign/:containerId
```

## Configuration

### Environment Variables

Edit `.env` file to customize:

```bash
# Database
DB_HOST=db
DB_PORT=5432
DB_NAME=comfyui
DB_USER=comfyui
DB_PASSWORD=your_secure_password

# API
NODE_ENV=production
PORT=3000

# Docker
DOCKER_HOST=unix:///var/run/docker.sock
```

### GPU Configuration

By default, all containers have access to all GPUs. To limit GPU access per container, modify `docker-compose.yml`:

```yaml
environment:
  - NVIDIA_VISIBLE_DEVICES=0  # Only GPU 0
```

Or for multiple specific GPUs:
```yaml
environment:
  - NVIDIA_VISIBLE_DEVICES=0,1  # GPU 0 and 1
```

## Scaling

### Add More Containers

You can dynamically add containers through the web UI or by modifying `docker-compose.yml`:

```yaml
comfyui-3:
  build: ./comfyui
  container_name: comfyui-instance-3
  ports:
    - "8190:8188"
  volumes:
    - ./models:/app/models
    - ./workflows/instance-3:/app/workflows
    - ./output:/app/output
  environment:
    - NVIDIA_VISIBLE_DEVICES=all
    - INSTANCE_ID=3
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
  networks:
    - comfyui-network
  restart: unless-stopped
```

Then restart:
```bash
docker-compose up -d
```

## Troubleshooting

### GPU Not Detected

```bash
# Check NVIDIA drivers
nvidia-smi

# Test Docker GPU access
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi

# Restart Docker
sudo systemctl restart docker
```

### Container Won't Start

```bash
# Check logs
docker-compose logs comfyui-1

# Check if port is available
sudo netstat -tlnp | grep 8188

# Rebuild containers
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Out of Memory

```bash
# Check GPU memory
nvidia-smi

# Reduce number of running containers
# Or upgrade to a GPU with more VRAM
```

### Database Connection Issues

```bash
# Reset database
docker-compose down -v
docker-compose up -d db
# Wait 30 seconds
docker-compose up -d
```

## Development

### Run in Development Mode

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd frontend
npm install
npm start
```

### Project Structure

```
comfyuiapi/
├── backend/              # Node.js API server
│   ├── src/
│   │   ├── index.js      # Entry point
│   │   ├── database.js   # Database setup
│   │   ├── docker.js     # Docker API
│   │   └── routes/       # API routes
│   ├── Dockerfile
│   └── package.json
├── frontend/             # React web interface
│   ├── src/
│   │   ├── App.js
│   │   ├── components/
│   │   └── index.js
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── comfyui/              # ComfyUI Docker image
│   └── Dockerfile
├── models/               # Shared models
├── workflows/            # Container workflows
├── output/               # Generated images
├── config/               # Configuration files
├── docker-compose.yml    # Main orchestration
└── README.md
```

## Security Considerations

⚠️ **Important Security Notes:**

1. **Change Default Passwords**: Update database password in `.env`
2. **Firewall**: Only expose necessary ports
3. **Network**: Use Docker networks for isolation
4. **Updates**: Keep Docker and NVIDIA drivers updated
5. **Access Control**: Implement authentication for production use

## Performance Tips

1. **Use SSD storage** for models and output
2. **Allocate sufficient RAM** (32GB+ recommended)
3. **Monitor GPU temperature** during heavy workloads
4. **Use appropriate batch sizes** based on GPU VRAM
5. **Clean output directory** regularly to save space

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Create an issue on GitHub
- Check existing documentation
- Review Docker and ComfyUI documentation

## Acknowledgments

- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) - The amazing UI for Stable Diffusion
- [NVIDIA Container Toolkit](https://github.com/NVIDIA/nvidia-docker) - GPU support in Docker
- Docker community for excellent documentation

## Roadmap

- [ ] Authentication and user management
- [ ] Resource usage monitoring dashboard
- [ ] Automated model downloading
- [ ] Workflow templates library
- [ ] Multi-node GPU cluster support
- [ ] API rate limiting
- [ ] Container auto-scaling
- [ ] Backup and restore functionality