# Runs the dedicated server from source, the same way `pnpm run start` does.
# The build context must include the bedrock-data resources submodule.
FROM node:26-slim@sha256:36793bcbb160a6a16cede1e62b93f84e26b78a972a8a4c0b879c1c12f22761ec

WORKDIR /app

# Node 25 and later no longer ship Corepack, so install the pnpm that `packageManager` pins.
COPY package.json ./
RUN npm install --global "$(node -p "require('./package.json').packageManager")"

COPY . .

RUN pnpm install --frozen-lockfile \
    && pnpm --filter @jsprismarine/bedrock-data run generate \
    && mkdir /data \
    && chown node:node /data

ENV NODE_ENV=production
ENV JSP_DIR=/data

USER node
WORKDIR /app/packages/server
EXPOSE 19132/udp

# Node runs as PID 1 so SIGTERM reaches the server, which saves the world before it exits.
CMD ["node", "--unhandled-rejections=strict", "--import", "tsx", "./src/Server.ts"]
