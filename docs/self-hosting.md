# Self-Hosting PR Guardian

Run PR Guardian as a GitHub App on your own infrastructure.

## Prerequisites

- Node.js 20+
- A GitHub App (create one at https://github.com/settings/apps)
- An Anthropic API key

## GitHub App Setup

1. Create a new GitHub App with these permissions:
   - **Pull requests**: Read & Write
   - **Checks**: Read & Write
   - **Contents**: Read
   - **Issues**: Read & Write

2. Subscribe to these webhook events:
   - `pull_request`
   - `installation`
   - `pull_request_review_comment`

3. Generate a private key and note your App ID

## Environment Variables

```bash
APP_ID=your-app-id
PRIVATE_KEY_PATH=path/to/private-key.pem
WEBHOOK_SECRET=your-webhook-secret
ANTHROPIC_API_KEY=your-anthropic-api-key
LOG_LEVEL=info                    # optional: debug, info, warn, error
```

## Running

```bash
# Install dependencies
npm install

# Build
npm run build

# Start
npm start
```

The server starts on port 3000 by default. Configure your GitHub App's webhook URL to point to `https://your-server.com/api/github/webhooks`.

## Docker

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
ENV NODE_ENV=production
CMD ["npm", "start"]
```

```bash
docker build -t pr-guardian .
docker run -p 3000:3000 --env-file .env pr-guardian
```
