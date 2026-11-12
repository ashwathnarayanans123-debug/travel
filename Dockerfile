FROM python:3.13-slim
WORKDIR /app
COPY server.py ./
COPY public ./public
RUN mkdir /data && chown -R 10001:10001 /data /app
USER 10001:10001
ENV DATA_DIR=/data PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')"
CMD ["python", "server.py"]
