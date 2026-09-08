FROM node:22-slim AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN corepack enable \
  && yarn install --frozen-lockfile --ignore-scripts
COPY tsconfig.json ./
COPY shared ./shared
COPY server ./server
COPY services/upscale-executor ./services/upscale-executor
ARG UPSCALE_BUILD_ID=local
RUN node services/upscale-executor/build.mjs "$UPSCALE_BUILD_ID"

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build --chown=node:node /app/dist/upscale-executor/index.mjs ./index.mjs
USER node
EXPOSE 8080
CMD ["node", "index.mjs"]
