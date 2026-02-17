FROM mcr.microsoft.com/devcontainers/typescript-node:20

# Install additional tools
RUN apt-get update && apt-get install -y \
    curl \
    git \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install global npm packages
RUN npm install -g \
    npm@latest \
    pnpm \
    vitest \
    @biomejs/biome

# Set working directory
WORKDIR /workspaces/go-go-scope

# Switch to non-root user
USER node
