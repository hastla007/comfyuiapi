FROM nvidia/cuda:12.8.0-devel-ubuntu22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    git \
    wget \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Clone ComfyUI
RUN git clone https://github.com/comfyanonymous/ComfyUI.git . && \
    pip3 install --no-cache-dir -r requirements.txt

# Install additional dependencies for GPU
RUN pip3 install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Create directories for models, workflows, and output
RUN mkdir -p /app/models /app/workflows /app/output /app/input /app/custom_nodes

# Install ComfyUI-Manager
RUN cd /app/custom_nodes && \
    git clone https://github.com/ltdrdata/ComfyUI-Manager.git && \
    cd ComfyUI-Manager && \
    pip3 install --no-cache-dir -r requirements.txt

# Pre-install common custom nodes
RUN cd /app/custom_nodes && \
    git clone https://github.com/wildminder/ComfyUI-DyPE.git && \
    (cd ComfyUI-DyPE && if [ -f requirements.txt ]; then pip3 install --no-cache-dir -r requirements.txt; fi) && \
    git clone https://github.com/kijai/ComfyUI-WanAnimatePreprocess.git && \
    (cd ComfyUI-WanAnimatePreprocess && if [ -f requirements.txt ]; then pip3 install --no-cache-dir -r requirements.txt; fi) && \
    git clone https://github.com/rgthree/rgthree-comfy.git && \
    (cd rgthree-comfy && if [ -f requirements.txt ]; then pip3 install --no-cache-dir -r requirements.txt; fi)

# Expose ComfyUI port
EXPOSE 8188

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8188/ || exit 1

# Start ComfyUI
CMD ["python3", "main.py", "--listen", "0.0.0.0", "--port", "8188"]
