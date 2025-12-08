# Deepgram WebSocket Proxy - Fly.io Deployment
FROM denoland/deno:1.40.0

WORKDIR /app

# Copy server code
COPY server.ts .

# Cache dependencies
RUN deno cache server.ts

# Expose port
EXPOSE 8080

# Run server
CMD ["run", "--allow-net", "--allow-env", "server.ts"]
