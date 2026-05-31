# Official Playwright image: Chromium + all required system libraries + Node 22 preinstalled.
# The tag MUST match the playwright version in package.json (currently 1.60.0) so the
# browser bundled in the image matches the API the npm package expects.
FROM mcr.microsoft.com/playwright:v1.60.0-noble

WORKDIR /app

# Install deps first so this layer is cached unless the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Chromium is already in the image (at $PLAYWRIGHT_BROWSERS_PATH); this is a no-op
# safety net in case the base image's browser cache ever drifts.
RUN npx playwright install chromium

COPY . .

# Render provides $PORT at runtime; server.js already reads process.env.PORT.
EXPOSE 3000
CMD ["node", "server.js"]
