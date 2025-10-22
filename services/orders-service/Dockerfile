# FROM node:20-alpine
# WORKDIR /app

# COPY services/orders-service/package.json ./package.json
# RUN npm install --only=production

# COPY services/orders-service/src ./src
# COPY common ./common

# ENV PORT=3002
# EXPOSE 3002
# CMD ["npm","start"]

FROM node:20-alpine
WORKDIR /app

COPY services/orders-service/package.json ./package.json
RUN npm install --only=production

COPY services/orders-service/prisma ./prisma
# Adicione estas duas linhas
RUN npx prisma generate

COPY services/orders-service/src ./src
COPY common ./common

ENV PORT=3002
EXPOSE 3002
CMD ["npm","start"]