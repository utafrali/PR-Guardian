# Contributing to PR Guardian

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

1. Clone the repository:
```bash
git clone https://github.com/utafrali/PR-Guardian.git
cd PR-Guardian
```

2. Install dependencies:
```bash
npm install
```

3. Run tests:
```bash
npm test
```

4. Type check:
```bash
npm run typecheck
```

## Project Structure

```
src/
  index.ts              # Probot app entry
  config.ts             # Config schema (Zod)
  handlers/             # Webhook event handlers
  reviewers/            # Review logic (AI, template, tests, labels, welcome)
  github/               # GitHub API helpers (comments, labels, checks, diff)
  utils/                # Shared utilities (AI client, config loader, logger)
test/
  fixtures/             # Test data
  reviewers/            # Reviewer tests
```

## Adding a New Reviewer

1. Create a new file in `src/reviewers/`
2. Export an async function that accepts `ReviewContext` and returns `ReviewResult`
3. Register it in `src/handlers/pull-request.ts`
4. Add tests in `test/reviewers/`

## Code Style

- TypeScript strict mode
- ESLint + Prettier for formatting
- Vitest for testing
- Concise commit messages in imperative mood

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes with tests
4. Run `npm test && npm run typecheck && npm run lint`
5. Open a PR with a clear description

## Reporting Issues

Use the GitHub issue templates:
- **Bug Report** — for bugs and unexpected behavior
- **Feature Request** — for new features and enhancements
