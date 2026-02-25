# Configuration Reference

PR Guardian is configured via a `.pr-guardian.yml` file in your repository root. All settings are optional with sensible defaults.

## Full Configuration

```yaml
review:
  enabled: true                    # Enable AI code review
  provider: claude-code            # claude-code (default) or api
  model: claude-sonnet             # AI model (claude-sonnet or claude-haiku)
  focus:                           # Review focus areas
    - security
    - bugs
    - performance
  ignore:                          # File patterns to skip
    - "**/*.test.ts"
    - "docs/**"
  severity_threshold: warning      # Minimum severity to report (critical, warning, nit)

template:
  enabled: true                    # Enable PR template compliance check
  required_sections:               # Sections that must be filled
    - "Description"
    - "Testing"
  block_merge: false               # Fail check run if sections are missing

tests:
  enabled: true                    # Enable test coverage check
  warn_no_tests: true              # Warn if code changes lack test changes
  coverage_diff: true              # Show coverage change (future)

labels:
  enabled: true                    # Enable auto-labeling

welcome:
  enabled: true                    # Welcome first-time contributors
  message: "Thanks for contributing! Please check our CONTRIBUTING.md"
```

## Section Details

### `review`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable AI review |
| `provider` | string | `claude-code` | `claude-code` (CLI session, no API key) or `api` (direct Anthropic API, requires `ANTHROPIC_API_KEY`) |
| `model` | string | `claude-sonnet` | AI model (`claude-sonnet` or `claude-haiku`) |
| `focus` | string[] | `[security, bugs, performance]` | Areas to focus on |
| `ignore` | string[] | `[]` | Glob patterns for files to skip |
| `severity_threshold` | string | `warning` | Minimum severity to report |

### `template`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable template check |
| `required_sections` | string[] | `[Description, Testing]` | Required PR template sections |
| `block_merge` | boolean | `false` | Fail check if sections are missing |

### `tests`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable test check |
| `warn_no_tests` | boolean | `true` | Warn when code changes lack tests |
| `coverage_diff` | boolean | `true` | Show coverage change (future) |

### `labels`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable auto-labeling |

### `welcome`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable welcome message |
| `message` | string | See default | Custom welcome message |

## Label Mapping

Auto-labeling maps file changes to labels:

| Pattern | Label |
|---------|-------|
| `docs/`, `*.md` | `docs` |
| `*.test.*`, `*.spec.*` | `test` |
| `.github/workflows/` | `ci` |
| `package.json`, lock files | `dependencies` |
| PR title contains `fix` | `bug` |
| PR title contains `feat` | `feature` |
| `BREAKING CHANGE` in body | `breaking-change` |
