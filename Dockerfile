# Dockerfile para el frontend (Next.js)

FROM node:18-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY . .
# Setea variables de entorno para el build (si no se pasan en el comando)
ARG NEXT_PUBLIC_API
ARG NEXT_PUBLIC_WS
ENV NEXT_PUBLIC_API=${NEXT_PUBLIC_API}
ENV NEXT_PUBLIC_WS=${NEXT_PUBLIC_WS}
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["npm", "start"]
