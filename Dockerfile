FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

ENV NODE_ENV=production

EXPOSE 8787

CMD ["node", "dist/src/index.js"]
