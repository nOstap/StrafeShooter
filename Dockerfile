# Game server + client in one container (Cloud Run / any Docker host).
# Game settings come from environment variables (see server/.env for the keys).
FROM node:24-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY server ./server
COPY public ./public

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server/server.js"]
