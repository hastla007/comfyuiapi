FROM nvidia/cuda:12.8.0-devel-ubuntu22.04

# ----------------------------------------------------------------------
# Base environment
# ----------------------------------------------------------------------
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# System dependencies & build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10-dev \
    python3-pip \
    python3.10-distutils \
    git \
    wget \
    ca-certificates \
    ffmpeg \
    libgl1-mesa-glx \
    libglib2.0-0 \
    build-essential \
    cmake \
    ninja-build \
    && rm -rf /var/lib/apt/lists/*

# Ensure python3 -> python3.10
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.10 1

# Upgrade pip + tooling
RUN python3 -m pip install --upgrade pip setuptools wheel

# ----------------------------------------------------------------------
# PyTorch nightly (cu128) + low-level deps
# ----------------------------------------------------------------------
# Install PyTorch nightly with cu128 (matches CUDA 12.8 runtime)
RUN python3 -m pip install --pre --no-cache-dir \
    torch torchvision torchaudio \
    --index-url https://download.pytorch.org/whl/nightly/cu128

# Quick check to verify Torch and CUDA
RUN python3 -c "import torch; print('Torch:', torch.__version__); print('CUDA available:', torch.cuda.is_available())"

# GPU / CUDA tuning
ENV TORCH_CUDA_ARCH_LIST="8.9" \
    FORCE_CUDA=1 \
    CUDA_HOME=/usr/local/cuda

# Triton before sageattention (for custom CUDA kernels)
RUN python3 -m pip install --no-cache-dir "triton<3.4"

# SageAttention (no build isolation to reuse env)
RUN python3 -m pip install --no-cache-dir --no-build-isolation sageattention

# ----------------------------------------------------------------------
# ComfyUI core
# ----------------------------------------------------------------------
WORKDIR /app

# Clone ComfyUI and install its requirements
RUN git clone https://github.com/comfyanonymous/ComfyUI.git . && \
    python3 -m pip install --no-cache-dir -r requirements.txt

# Create common directories
RUN mkdir -p /app/models /app/workflows /app/output /app/input /app/custom_nodes

# ----------------------------------------------------------------------
# Custom nodes
# ----------------------------------------------------------------------
WORKDIR /app/custom_nodes

# ComfyUI-Manager
RUN git clone https://github.com/ltdrdata/ComfyUI-Manager.git && \
    cd ComfyUI-Manager && python3 -m pip install --no-cache-dir -r requirements.txt

# DyPE, WanAnimatePreprocess, LTXVideo, Crystools, rgthree-comfy
RUN git clone https://github.com/wildminder/ComfyUI-DyPE.git && \
    (cd ComfyUI-DyPE && if [ -f requirements.txt ]; then python3 -m pip install --no-cache-dir -r requirements.txt; fi) && \
    git clone https://github.com/kijai/ComfyUI-WanAnimatePreprocess.git && \
    (cd ComfyUI-WanAnimatePreprocess && if [ -f requirements.txt ]; then python3 -m pip install --no-cache-dir -r requirements.txt; fi) && \
    git clone https://github.com/Lightricks/ComfyUI-LTXVideo.git && \
    (cd ComfyUI-LTXVideo && if [ -f requirements.txt ]; then python3 -m pip install --no-cache-dir -r requirements.txt; fi) && \
    git clone https://github.com/crystian/ComfyUI-Crystools.git && \
    (cd ComfyUI-Crystools && if [ -f requirements.txt ]; then python3 -m pip install --no-cache-dir -r requirements.txt; fi) && \
    git clone https://github.com/rgthree/rgthree-comfy.git && \
    (cd rgthree-comfy && if [ -f requirements.txt ]; then python3 -m pip install --no-cache-dir -r requirements.txt; fi)

# ----------------------------------------------------------------------
# Runtime config
# ----------------------------------------------------------------------
WORKDIR /app

EXPOSE 8188

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8188/ || exit 1

CMD ["python3", "main.py", "--listen", "0.0.0.0", "--port", "8188"]
