FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 TORCH_HOME=/models MODEL_DIR=/models OMP_NUM_THREADS=4
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl libchromaprint-tools && apt-get clean
WORKDIR /app
RUN pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install -r requirements.txt
# The separator is Kim Mel-Band RoFormer (MIT weights, fetched from their Hugging Face source and checked by sha256),
# pulled at build time so the first job is not a one-gigabyte download. No Demucs: its weights are research-only.
COPY roformer.py chunked.py ./
RUN python -c "import roformer; roformer.fetch_weights()"
# The ears: CLAP for descriptors and embeddings, Whisper for the words. Pulled at build so jobs never wait on a download.
ENV HF_HOME=/models/hf
RUN python -c "from transformers import ClapModel, ClapProcessor; ClapModel.from_pretrained('laion/clap-htsat-unfused'); ClapProcessor.from_pretrained('laion/clap-htsat-unfused')"
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"
COPY . .
EXPOSE 8080
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}"]
