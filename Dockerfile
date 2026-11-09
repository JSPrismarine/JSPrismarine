# Builds and runs the dedicated server from compiled JavaScript.
# The build context must include the bedrock-data resources submodule.
FROM eclipse-temurin:25-jdk-jammy@sha256:e4f029273ed9e4444697df30bb6098dbe51477291598aebc54dd0b48d95d6ae7 AS temurin-jdk

FROM node:26-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072 AS builder

COPY --from=temurin-jdk /opt/java/openjdk /opt/java/openjdk

ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="${JAVA_HOME}/bin:${PATH}"

WORKDIR /app

# Java 26.3's data pack generator and dumper need a JDK 25.
RUN java --version && javac --version

# Node 25 and later no longer ship Corepack, so install the pnpm that `packageManager` pins.
COPY package.json ./
RUN npm install --global "$(node -p "require('./package.json').packageManager")"

COPY . .

# The overworld generator reads Java's worldgen data from `node_modules/.cache/jsprismarine`, and
# without it the server cannot build the default world. `ensure:worldgen` fails the build rather
# than ship an image that cannot start. The server jar it generates the data from is not needed
# at run time, so it is removed.
RUN pnpm install --frozen-lockfile \
    && pnpm --filter @jsprismarine/bedrock-data run generate \
    && pnpm --filter @jsprismarine/bedrock-data run ensure:worldgen \
    && rm -rf node_modules/.cache/jsprismarine/java-server \
    && pnpm run server:build

FROM node:26-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072 AS runtime

WORKDIR /app

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
RUN mkdir /data && chown node:node /data

ENV NODE_ENV=production
ENV JSP_DIR=/data
# Containers never get the terminal UI, even when run with -it; stdin lines are commands.
ENV JSP_NO_TUI=1

USER node
WORKDIR /app/packages/server
EXPOSE 19132/udp

# Node runs as PID 1 so SIGTERM reaches the server, which saves the world before it exits.
CMD ["node", "--conditions=jsprismarine:dist", "--unhandled-rejections=strict", "./dist/Server.js"]
