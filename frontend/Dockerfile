# Stage 1: Build the React application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy dependency configurations
COPY package*.json ./

# Install packages
RUN npm install

# Copy source files
COPY . .

# Pass backend URL environment variable at build time (Vite requires build-time variables)
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Build the client production assets
RUN npm run build

# Stage 2: Serve the static files via Nginx
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose Nginx port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
