# PR Guardian

AI-powered GitHub App that automatically reviews every pull request.

PR Guardian analyzes your PRs for bugs, security issues, and performance problems using Claude AI. It checks PR template compliance, verifies test coverage, auto-labels PRs, and welcomes first-time contributors.

## Features

- **AI Code Review** — Analyzes diffs for bugs, security vulnerabilities, and performance issues with severity levels (critical/warning/nit)
- **Template Compliance** — Checks PR body against your PR template's required sections
- **Test Coverage Check** — Warns when code changes don't include test changes
- **Auto-Labeling** — Labels PRs based on changed files (`bug`, `feature`, `docs`, `refactor`, `test`, `ci`)
- **Welcome Message** — Greets first-time contributors with repo conventions

## Quick Start

### Option 1: GitHub Action with Claude Code (recommended)

Uses your existing Claude Code session — no API key needed:

```yaml
# .github/workflows/pr-guardian.yml
name: PR Guardian
on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: utafrali/PR-Guardian@v1
```

### Option 2: GitHub Action with API key

If you prefer direct API calls instead of Claude Code:

```yaml
# .github/workflows/pr-guardian.yml
name: PR Guardian
on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: utafrali/PR-Guardian@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

Then set `provider: api` in your `.pr-guardian.yml`:

```yaml
review:
  provider: api
```

### Option 3: GitHub App

Install PR Guardian from the GitHub Marketplace for real-time reviews.

## Configuration

Create `.pr-guardian.yml` in your repository root:

```yaml
review:
  enabled: true
  provider: claude-code        # or api for direct Anthropic API calls
  model: claude-sonnet         # or claude-haiku for faster/cheaper reviews
  focus:
    - security
    - bugs
    - performance
  ignore:
    - "**/*.test.ts"
    - "docs/**"
  severity_threshold: warning  # only comment on warning + critical

template:
  enabled: true
  required_sections:
    - "Description"
    - "Testing"
  block_merge: false

tests:
  enabled: true
  warn_no_tests: true

labels:
  enabled: true

welcome:
  enabled: true
  message: "Thanks for contributing! Please check our CONTRIBUTING.md"
```

All sections are optional. PR Guardian uses sensible defaults when no config file is found.

## How It Works

1. A pull request is opened or updated
2. PR Guardian fetches the diff and your `.pr-guardian.yml` config
3. All enabled reviewers run in parallel:
   - AI Review sends the diff to Claude for analysis
   - Template Check verifies PR body against your template
   - Test Coverage checks for missing tests
   - Auto Label applies labels based on changed files
   - Welcome greets first-time contributors
4. Results are posted as PR comments and a Check Run summary

## Self-Hosting

See [docs/self-hosting.md](docs/self-hosting.md) for instructions on running PR Guardian on your own infrastructure.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Ways to contribute:
- Add review rules for specific languages/frameworks
- Add language support for test detection
- Improve AI review prompts
- Add integrations (Slack, JIRA, etc.)

## License

MIT
