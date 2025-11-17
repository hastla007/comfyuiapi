FROM nvidia/cuda:12.8.0-devel-ubuntu22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install system dependencies + build tools for PyTorch CUDA extensions
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    python3.10-distutils \
    git \
    wget \
    libgl1-mesa-glx \
    libglib2.0-0 \
    build-essential \
    cmake \
    ninja-build \
    && rm -rf /var/lib/apt/lists/*

# Ensure python3 -> python3.10
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.10 1

# Upgrade pip + wheel
RUN python3 -m pip install --upgrade pip setuptools wheel

# Install GPU PyTorch (cu124 works with CUDA 12.8 runtime)
RUN python3 -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124

# Verify torch is installed and CUDA is active
RUN python3 -c "import torch; print('Torch:', torch.__version__); print('CUDA:', torch.cuda.is_available())"

# RTX 5070 = Compute Capability 8.9
ENV TORCH_CUDA_ARCH_LIST="8.9"
ENV FORCE_CUDA=1
ENV CUDA_HOME=/usr/local/cuda

# Install triton before sageattention
RUN python3 -m pip install --no-cache-dir "triton<3.4"

# Install sageattention (requires no build isolation)
RUN python3 -m pip install --no-cache-dir --no-build-isolation sageattention

# ----------------------------------------------------------------------
# ComfyUI Installation
# ----------------------------------------------------------------------
WORKDIR /app

# Clone ComfyUI
RUN git clone https://github.com/comfyanonymous/ComfyUI.git . && \
    python3 -m pip install --no-cache-dir -r requirements.txt

# Create directories
RUN mkdir -p /app/models /app/workflows /app/output /app/input /app/custom_nodes

# Install ComfyUI-Manager
RUN cd /app/custom_nodes && \
    git clone https://github.com/ltdrdata/ComfyUI-Manager.git && \
    cd ComfyUI-Manager && python3 -m pip install --no-cache-dir -r requirements.txt

# Install additional custom nodes
RUN cd /app/custom_nodes && \
    git clone https://github.com/wildminder/ComfyUI-DyPE.git && \
    (cd ComfyUI-DyPE && if [ -f requirements.txt ]; then python3 -m pip install --no-cache-dir -r requirements.txt; fi) && \
    git clone https://github.com/kijai/ComfyUI-WanAnimatePreprocess.git && \
    (cd ComfyUI-WanAnimatePreprocess && if [ -f requirements.txt ]; then python3 -m pip install --no-cache-dir -r requirements.txt; fi) && \
    git clone https://github.com/rgthree/rgthree-comfy.git && \
    (cd rgthree-comfy && if [ -f requirements.txt ]; then python3 -m pip install --no-cache-dir -r requirements.txt; fi)

# Expose ComfyUI port
EXPOSE 8188

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8188/ || exit 1

# Start ComfyUI
CMD ["python3", "main.py", "--listen", "0.0.0.0", "--port", "8188"]
FROM nvidia/cuda:12.8.0-devel-ubuntu22.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install system dependencies + build tools for PyTorch CUDA extensions
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    python3.10-distutils \
    git \
    wget \
    libgl1-mesa-glx \
    libglib2.0-0 \
    build-essential \
    cmake \
    ninja-build \
    && rm -rf /var/lib/apt/lists/*

# Ensure python3 -> python3.10
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.10 1

# Upgrade pip + wheel
RUN python3 -m pip install --upgrade pip setuptools wheel

# Install GPU PyTorch (cu124 works with CUDA 12.8 runtime)
RUN python3 -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu128

# Verify torch is installed and CUDA is active
RUN python3 -c "import torch; print('Torch:', torch.__version__); print('CUDA:', torch.cuda.is_available())"

# RTX 5070 = Compute Capability 8.9
ENV TORCH_CUDA_ARCH_LIST="8.9"
ENV FORCE_CUDA=1
ENV CUDA_HOME=/usr/local/cuda

# Install triton before sageattention
RUN python3 -m pip install --no-cache-dir "triton<3.4"

# Install sageattention (requires no build isolation)
RUN python3 -m pip install --no-cache-dir --no-build-isolation sageattention

# ----------------------------------------------------------------------
# ComfyUI Installation
# ----------------------------------------------------------------------
WORKDIR /app

# Clone ComfyUI
RUN git clone https://github.com/comfyanonymous/ComfyUI.git . && \
    python3 -m pip install --no-cache-dir -r requirements.txt

# Create directories
RUN mkdir -p /app/models /app/workflows /app/output /app/input /app/custom_nodes

# Install ComfyUI-Manager
RUN cd /app/custom_nodes && \
    git clone https://github.com/ltdrdata/ComfyUI-Manager.git && \
    cd ComfyUI-Manager && python3 -m pip install --no-cache-dir -r requirements.txt

# Install additional custom nodes
RUN cd /app/custom_nodes && \
    git clone https://github.com/wildminder/ComfyUI-DyPE.git && \
    (cd ComfyUI-DyPE && if [ -f requirements.txt ]; then python3 -m pip install --no-cache-dir -r requirements.txt; fi) && \
    git clone https://github.com/kijai/ComfyUI-WanAnimatePreprocess.git && \
    (cd ComfyUI-WanAnimatePreprocess && if [ -f requirements.txt ]; then pip3 install --no-cache-dir -r requirements.txt; fi) && \
    git clone https://github.com/Lightricks/ComfyUI-LTXVideo.git && \
    (cd ComfyUI-LTXVideo && if [ -f requirements.txt ]; then pip3 install --no-cache-dir -r requirements.txt; fi) && \
    git clone https://github.com/crystian/ComfyUI-Crystools.git && \
    (cd ComfyUI-Crystools && if [ -f requirements.txt ]; then pip3 install --no-cache-dir -r requirements.txt; fi) && \
    git clone https://github.com/rgthree/rgthree-comfy.git && \
    (cd rgthree-comfy && if [ -f requirements.txt ]; then python3 -m pip install --no-cache-dir -r requirements.txt; fi)

# Expose ComfyUI port
EXPOSE 8188

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8188/ || exit 1

# Start ComfyUI
CMD ["python3", "main.py", "--listen", "0.0.0.0", "--port", "8188"]
