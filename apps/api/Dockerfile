FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN npm ci
RUN npm run build --workspace=@codesense/shared
RUN npm run build --workspace=@codesense/api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

EXPOSE 5001
CMD ["node", "apps/api/dist/index.js"]
