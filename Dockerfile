# Build frontend
FROM oven/bun:1-alpine AS frontend-builder

WORKDIR /app/web

# Copy only dependency files first for better caching
COPY web/package.json ./

# Install dependencies (this layer will be cached unless package files change)
RUN bun install --frozen-lockfile

# Copy source files (this invalidates cache only when source changes)
COPY web/ ./

# Build the frontend
RUN bun run build

# Build backend
FROM golang:1.25.5-alpine AS backend-builder

RUN apk add --no-cache gcc musl-dev

WORKDIR /app

# Copy go mod files first for better dependency caching
COPY go.mod go.sum ./

# Download dependencies (cached unless go.mod/go.sum changes)
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# Copy source code
COPY . .

# Build with cache mounts for faster rebuilds
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=1 GOOS=linux go build -a -ldflags '-linkmode external -extldflags "-static"' -o chat .

# Final image
FROM alpine:latest

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy compiled binary and built frontend
COPY --from=backend-builder /app/chat .
COPY --from=frontend-builder /app/web/dist ./web/dist

RUN mkdir -p /data

EXPOSE 8080

CMD ["./chat"]

