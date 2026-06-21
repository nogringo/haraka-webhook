FROM node:24-alpine

# Haraka's tls plugin shells out to `openssl` to generate dhparams.pem on startup
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV SPOOL_DIR=/var/spool/haraka-webhook

VOLUME ["/var/spool/haraka-webhook"]
EXPOSE 25/tcp

CMD ["npm", "start"]
