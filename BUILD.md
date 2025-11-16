# Building the ComfyUI Docker Image

This guide explains how to build the ComfyUI Docker image (`comfyuiapi-comfyui:latest`).

## Prerequisites

Before building, ensure you have:

- Docker 24.0+ installed
- Docker Compose 2.0+ installed
- Stable internet connection (for downloading dependencies)
- At least 15GB of free disk space
- (Optional) NVIDIA GPU and drivers for testing

## Method 1: Using the Build Script (Recommended)

We provide a convenient build script that handles everything:

```bash
# Make the script executable (first time only)
chmod +x build-comfyui-image.sh

# Run the build script
./build-comfyui-image.sh
```

The script will:
- Check if Docker and Docker Compose are installed
- Build the ComfyUI image with the correct tag
- Verify the image was created successfully
- Show you the next steps

## Method 2: Using Docker Compose Directly

Build the image using Docker Compose:

```bash
# Build the comfyui-1 service (creates the image)
docker compose build comfyui-1

# Or build all services
docker compose build
```

## Method 3: Using Docker Build Directly

Build the image directly from the Dockerfile:

```bash
# Navigate to the comfyui directory
cd comfyui

# Build the image with the correct tag
docker build -t comfyuiapi-comfyui:latest .

# Return to project root
cd ..
```

## Verifying the Build

After building, verify the image exists:

```bash
docker images | grep comfyuiapi-comfyui
```

You should see output like:
```
comfyuiapi-comfyui   latest   abc123def456   5 minutes ago   15.2GB
```

## What Gets Built

The ComfyUI image includes:

- **Base**: NVIDIA CUDA 12.8.0 on Ubuntu 22.04
- **ComfyUI**: Latest version from GitHub
- **PyTorch**: GPU-enabled version for CUDA 12.1
- **ComfyUI-Manager**: For managing custom nodes and models
- **Python 3.10**: With all required dependencies

### Directory Structure Inside Image

```
/app/
├── models/          # Models (mounted from host)
├── workflows/       # Workflows (mounted from host)
├── output/          # Generated images (mounted from host)
├── input/           # Input files
├── custom_nodes/    # Custom nodes including ComfyUI-Manager
└── main.py          # ComfyUI entry point
```

## Build Time

The first build typically takes **5-15 minutes** depending on:

- Internet connection speed (downloads ~5GB of packages)
- CPU performance (compilation and installation)
- Disk I/O speed

Subsequent rebuilds are faster due to Docker's layer caching.

## Troubleshooting

### Build Fails: "Cannot connect to the Docker daemon"

**Problem**: Docker is not running or not accessible.

**Solution**:
```bash
# Start Docker service (Linux)
sudo systemctl start docker

# Or restart Docker Desktop (Windows/Mac)
```

### Build Fails: "network timeout" or "connection refused"

**Problem**: Network issues during package downloads.

**Solution**:
```bash
# Retry the build - Docker will resume from the last successful layer
docker compose build comfyui-1

# Or rebuild from scratch
docker compose build --no-cache comfyui-1
```

### Build Fails: "no space left on device"

**Problem**: Not enough disk space.

**Solution**:
```bash
# Clean up unused Docker resources
docker system prune -a

# Check available space
df -h
```

### Build Succeeds but Image Not Found

**Problem**: Image built with wrong tag.

**Solution**:
```bash
# List all images
docker images

# If you see an image with <none> tag, re-tag it:
docker tag <IMAGE_ID> comfyuiapi-comfyui:latest

# Or rebuild with the script
./build-comfyui-image.sh
```

### "ERROR: failed to solve: nvidia/cuda:12.8.0-devel-ubuntu22.04"

**Problem**: Cannot pull the base CUDA image.

**Solution**:
```bash
# Try pulling the base image first
docker pull nvidia/cuda:12.8.0-devel-ubuntu22.04

# Then rebuild
docker compose build comfyui-1
```

## Rebuilding After Changes

If you modify the Dockerfile, rebuild with:

```bash
# Using build script
./build-comfyui-image.sh

# Or using Docker Compose
docker compose build --no-cache comfyui-1
```

The `--no-cache` flag ensures all layers are rebuilt from scratch.

## Build on Different Platforms

### Linux (Ubuntu/Debian)

```bash
./build-comfyui-image.sh
```

### macOS

Note: The image includes NVIDIA CUDA, which won't work on macOS. For testing without GPU:

```bash
# You can build the image, but containers won't have GPU access
docker compose build comfyui-1
```

### Windows

```powershell
# Using PowerShell or Git Bash
bash build-comfyui-image.sh

# Or using Docker Compose directly
docker compose build comfyui-1
```

## Next Steps After Building

Once the image is built:

1. **Start the system**:
   ```bash
   docker compose up -d
   ```

2. **Access the web interface**:
   - Open http://localhost:8080

3. **Create containers**:
   - Use the web UI to create new ComfyUI containers
   - Or use the API endpoints

4. **Test ComfyUI**:
   - Visit http://localhost:8188 (pre-configured instance 1)
   - Visit http://localhost:8189 (pre-configured instance 2)

## Advanced: Custom Image Tags

To build with a custom tag:

```bash
# Edit docker-compose.yml and change the image name
# Or build directly:
docker build -t my-custom-comfyui:v1.0 ./comfyui

# Update .env file:
echo "COMFYUI_IMAGE=my-custom-comfyui:v1.0" >> .env
```

## Keeping the Image Updated

To update ComfyUI to the latest version:

```bash
# Rebuild without cache to get latest ComfyUI
docker compose build --no-cache comfyui-1

# Restart containers with new image
docker compose down
docker compose up -d
```

## CI/CD Builds

The project includes GitHub Actions workflow (`.github/workflows/ci.yml`) that:

- Automatically builds images on push to `main`
- Pushes to Docker Hub (requires secrets)
- Tags with both `:latest` and git SHA

For automated builds, configure:

1. Docker Hub credentials in GitHub Secrets
2. Update `DOCKER_USERNAME` in workflow
3. Push to `main` branch

## Resources

- [ComfyUI GitHub](https://github.com/comfyanonymous/ComfyUI)
- [Docker Documentation](https://docs.docker.com/)
- [NVIDIA Container Toolkit](https://github.com/NVIDIA/nvidia-docker)
- [PyTorch Installation](https://pytorch.org/get-started/locally/)

## Getting Help

If you encounter build issues:

1. Check the troubleshooting section above
2. Review build logs carefully
3. Search existing GitHub issues
4. Create a new issue with:
   - Build command used
   - Full error output
   - Docker version (`docker --version`)
   - OS and version
