# syntax=docker/dockerfile:1
FROM node:22-alpine

# su-exec laat de entrypoint zijn root-rechten vallen na het goedzetten van /data.
RUN apk add --no-cache su-exec

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY server ./server
COPY web ./web

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /data && chown -R node:node /data /app

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=8080 \
    HOST=0.0.0.0

EXPOSE 8080
VOLUME ["/data"]

# Geen curl in de image nodig: Node heeft zelf fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>{process.exitCode=r.ok?0:1}).catch(()=>{process.exitCode=1})"

ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "server/index.js"]
