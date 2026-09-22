# Trigger CI pipeline for Azure Functions
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the function app (compiles TS to dist/)
RUN npm run build

# Start production image using the official Azure Functions Node.js runtime
FROM mcr.microsoft.com/azure-functions/node:4-node22

ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true

WORKDIR /home/site/wwwroot

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies
RUN npm install --omit=dev

# Copy built artifacts and necessary files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/host.json ./

# (Optional) Copy local.settings.json if you want to bake in defaults, but generally not recommended for production.
