FROM python:3.13-slim
WORKDIR /app
COPY server.py ./
COPY public ./public
RUN mkdir /data && chown -R 10001:10001 /data /app
USER 10001:10001
ENV DATA_DIR=/data PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
EXPOSE 8080 10000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import os, urllib.request; p = os.environ.get('PORT', '8080'); urllib.request.urlopen(f'http://localhost:{p}/health')"
CMD ["python", "server.py"]
