# Stage 1: Build the React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the Express Backend
FROM node:20-alpine AS backend-builder
RUN apk add --no-cache python3 make g++
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

# Stage 3: Production Runtime Image
FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copy compiled backend
COPY --from=backend-builder /app/backend/dist ./dist
# Copy backend migrations/scripts
COPY backend/migrations ./migrations
COPY backend/scripts ./scripts
# Copy openapi spec
COPY openapi.yaml ../openapi.yaml
COPY fixtures.json ../fixtures.json
# Copy compiled frontend into the backend public directory
COPY --from=frontend-builder /app/frontend/dist ./public

EXPOSE 3000

CMD ["node", "dist/index.js"]
