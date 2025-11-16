#!/bin/bash

# Build script for ComfyUI Docker image
# This script builds the comfyuiapi-comfyui:latest image

set -e  # Exit on error

echo "========================================="
echo "Building ComfyUI Docker Image"
echo "========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed or not in PATH"
    echo "Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if docker-compose is available (try both v1 and v2 syntax)
COMPOSE_CMD=""
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    echo "❌ Error: Docker Compose is not installed"
    echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✓ Docker found: $(docker --version)"
echo "✓ Docker Compose found: $($COMPOSE_CMD version --short 2>/dev/null || echo 'installed')"
echo ""

# Navigate to the project directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "Building ComfyUI image from: $SCRIPT_DIR/comfyui"
echo ""
echo "This may take 5-15 minutes depending on your internet connection..."
echo "The image will download CUDA toolkit, Python, PyTorch, and ComfyUI."
echo ""

# Build the image
echo "Running: $COMPOSE_CMD build comfyui-1"
$COMPOSE_CMD build comfyui-1

echo ""
echo "========================================="
echo "✓ Build Complete!"
echo "========================================="
echo ""

# Verify the image was created
if docker images | grep -q "comfyuiapi-comfyui"; then
    echo "✓ Image 'comfyuiapi-comfyui:latest' successfully created"
    echo ""
    docker images | grep "comfyuiapi-comfyui" || true
    echo ""
    echo "You can now create ComfyUI containers!"
    echo ""
    echo "Next steps:"
    echo "1. Start the system: $COMPOSE_CMD up -d"
    echo "2. Access the web interface: http://localhost:8080"
    echo "3. Create new containers through the UI"
else
    echo "⚠️  Warning: Image may not have been created successfully"
    echo "Please check the build output above for errors"
    exit 1
fi
