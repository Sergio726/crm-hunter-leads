# CRM Lite — panel web (Next.js 16, standalone)
# Build:
#   docker build -t crm-lite-web \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co \
#     --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
#     .
# Run (las de runtime van como env, nunca como build arg):
#   docker run -p 3000:3000 \
#     -e N8N_BASE_URL=... -e N8N_WEBHOOK_SECRET=... \
#     -e SUPABASE_SERVICE_ROLE_KEY=... \
#     crm-lite-web

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Las NEXT_PUBLIC_* se inyectan en tiempo de build (quedan en el bundle del cliente).
# Son públicas por diseño (URL del proyecto + publishable key), por eso pueden tener
# default acá; otra instalación las pisa con --build-arg.
ARG NEXT_PUBLIC_SUPABASE_URL=https://koyihquworbcxuydyslm.supabase.co
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_e_iEi26x16a5SjT_-17fhg_H6oFkQBn
ARG NEXT_PUBLIC_SITE_URL=
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
# OJO: SUPABASE_SERVICE_ROLE_KEY y las API keys de prospección NO van acá.
# Son secretos de servidor: van como env del contenedor en tiempo de ejecución.
# Como build arg quedarían grabados en las capas de la imagen.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
