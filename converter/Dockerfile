FROM python:3.13-slim

# PYTHONDONTWRITEBYTECODE：不写 .pyc，镜像里不需要；也让只读根文件系统的限制更容易满足
# PYTHONUNBUFFERED：日志直接打到 stdout，不要缓冲
# ORT_DISABLE_TELEMETRY：onnxruntime 的遥测关掉
# HOME=/tmp：非 root 用户没有自己的 home 目录，有些库会写 $HOME/.xxx，统一放到 tmpfs /tmp
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    ORT_DISABLE_TELEMETRY=1 \
    HOME=/tmp

RUN pip install --no-cache-dir uv==0.8.17

WORKDIR /app

# 先只装依赖，源码变化时可以复用这一层缓存
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app

# 非 root 运行
RUN useradd --system --uid 10001 app
USER app

EXPOSE 8001
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health')"

CMD ["fastapi", "run", "app/main.py", "--host", "0.0.0.0", "--port", "8001", "--proxy-headers", "--forwarded-allow-ips=*"]
