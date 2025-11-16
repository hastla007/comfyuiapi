FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy application code
COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
