# Playwright's official image ships Chromium + all system libs the headless browser needs.
# The tag MUST match the playwright version resolved in package-lock.json (1.60.0) or the
# pre-installed browser won't match what the npm package expects at runtime.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

# Copy workspace manifests first so `npm ci` is cached across source-only changes.
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

# Full install (incl. devDeps): the backend runs via tsx and the web build needs vite/tsc.
RUN npm ci

COPY . .

# Build the SPA into apps/web/dist; the backend serves it from the same origin as /api.
RUN npm run build -w @bya/web

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "start", "-w", "@bya/backend"]
