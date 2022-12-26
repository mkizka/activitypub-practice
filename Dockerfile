FROM node:18-alpine
WORKDIR /code
COPY package.json pnpm-lock.yaml ./
RUN npm i -g npm pnpm && pnpm i
COPY . .
EXPOSE 8000
CMD pnpm start
