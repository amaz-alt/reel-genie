FROM node:20-slim

# Chromium runtime deps for Remotion's headless renderer (Remotion bundles Chrome
# Headless Shell + a static ffmpeg itself; we only need the shared libs here).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation fonts-noto-color-emoji \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 \
    libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libnspr4 libnss3 \
    libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 \
    libxext6 libxfixes3 libxkbcommon0 libxrandr2 wget xdg-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install worker deps (versions pinned in package.json)
COPY render-worker/package.json render-worker/package-lock.json* ./
RUN npm install --omit=optional

# Copy worker source + shared remotion templates
COPY render-worker/src ./src
COPY remotion ./remotion

# Bake Remotion's Chrome Headless Shell into the image so first render is fast
# and the container works even if egress to Remotion's CDN is later blocked.
# We call the same ensureBrowser() API the `remotion browser ensure` CLI wraps —
# avoids relying on `npx` bin resolution inside the slim image.
RUN node -e "import('@remotion/renderer').then(m => m.ensureBrowser()).then(() => console.log('chrome headless shell ready')).catch((e) => { console.error(e); process.exit(1); })"

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

CMD ["node", "src/server.mjs"]
