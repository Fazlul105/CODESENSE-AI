FROM node:20-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY package*.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm ci
RUN npm run build --workspace=@codesense/shared
RUN npm run build --workspace=@codesense/web

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=@codesense/web"]
