FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY cloudrun/ ./cloudrun/
COPY src/ ./src/
CMD ["node", "cloudrun/job.js"]