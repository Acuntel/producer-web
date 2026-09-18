FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 TORCH_HOME=/models OMP_NUM_THREADS=4
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl libchromaprint-tools && apt-get clean
WORKDIR /app
RUN pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install -r requirements.txt
# Pull the separation models at build time so the first job is not a five-minute download.
# htdemucs_6s adds guitar and piano to the four; the four-stem model stays as the fallback.
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs')"
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs_6s')"
# The ears: CLAP for descriptors and embeddings, Whisper for the words. Pulled at build so jobs never wait on a download.
ENV HF_HOME=/models/hf
RUN python -c "from transformers import ClapModel, ClapProcessor; ClapModel.from_pretrained('laion/clap-htsat-unfused'); ClapProcessor.from_pretrained('laion/clap-htsat-unfused')"
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"
COPY . .
EXPOSE 8080
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}"]
