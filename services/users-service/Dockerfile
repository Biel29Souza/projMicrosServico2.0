# FROM node:20-alpine
# WORKDIR /app

# COPY services/users-service/package.json ./package.json
# RUN npm install --only=production

# COPY services/users-service/src ./src

# COPY common ./common

# ENV PORT=3001
# EXPOSE 3001
# CMD ["npm","start"]


FROM node:20-alpine
WORKDIR /app

COPY services/users-service/package.json ./package.json
RUN npm install --only=production

# Adicione estas duas linhas
COPY services/users-service/prisma ./prisma
RUN npx prisma generate

COPY services/users-service/src ./src
COPY common ./common

ENV PORT=3001
EXPOSE 3001
CMD ["npm","start"]