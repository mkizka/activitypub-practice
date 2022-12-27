FROM node:18-alpine
ENV NODE_ENV production
WORKDIR /code
COPY package.json pnpm-lock.yaml ./
RUN npm i -g npm pnpm && pnpm i
COPY . .
EXPOSE 8000
CMD pnpm start
