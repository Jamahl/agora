FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install || true
COPY . .
EXPOSE 3000
CMD ["pnpm", "dev"]
