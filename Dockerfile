# Builds and runs the dedicated server from compiled JavaScript.
# The build context must include the bedrock-data resources submodule.
FROM eclipse-temurin:25-jdk-jammy@sha256:917e4ad2363fb761904f2e515237171bb6867521f03b1ab2cbf466c8ebd92399 AS temurin-jdk

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

RUN pnpm install --frozen-lockfile \
    && pnpm --filter @jsprismarine/bedrock-data run generate \
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
CMD ["node", "--conditions=jsprismarine:dist", "--unhandled-rejections=strict", "./dist/Server.es.js"]
