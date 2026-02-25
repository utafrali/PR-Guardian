# Privacy Policy

**Effective Date:** February 25, 2026
**Last Updated:** February 25, 2026

PR Guardian ("the App") is an open-source GitHub App that provides automated pull request reviews. This privacy policy explains what data the App accesses, how it is used, and your rights.

## Data We Access

When installed on a repository, PR Guardian accesses the following data through the GitHub API:

| Data | Purpose |
|------|---------|
| Pull request diffs | Code review analysis |
| Pull request metadata | Title, description, author, branch names — used for context |
| Repository file content | `.pr-guardian.yml` config and PR templates only |
| Contributor history | First-time contributor detection (search API) |

## Data We Do NOT Collect

- **No personal data is stored.** PR Guardian processes data in memory during review and discards it immediately after.
- **No analytics or tracking.** We do not use cookies, tracking pixels, or any analytics services.
- **No data is sold.** We never sell, rent, or share any data with third parties.
- **No data leaves GitHub.** When using the `claude-code` provider (default), all processing happens locally. When using the `api` provider, PR diff content is sent to Anthropic's API for analysis — see [Anthropic's Privacy Policy](https://www.anthropic.com/privacy).

## AI Processing

PR Guardian sends code diffs to AI models for review:

- **Claude Code CLI (default):** Runs locally on the host machine. No data is sent to external services.
- **Anthropic API (optional):** When configured with `provider: api`, PR diffs are sent to Anthropic's Messages API. Anthropic's [data usage policy](https://www.anthropic.com/privacy) applies. Anthropic does not use API inputs for model training.

## Data Retention

PR Guardian does not retain any data. All processing is ephemeral — data exists only in memory during the review and is discarded when the review completes.

## Permissions

The GitHub App requests the following permissions:

| Permission | Access | Purpose |
|------------|--------|---------|
| Pull requests | Read & Write | Read diffs, post review comments |
| Checks | Read & Write | Create check run with review results |
| Contents | Read | Read config file and PR templates |
| Issues | Read & Write | Post comments, manage labels |
| Metadata | Read | Repository metadata |

## GitHub Action Mode

When used as a GitHub Action, PR Guardian runs entirely within your GitHub Actions runner. No data is sent to any server operated by PR Guardian. The only external communication is with the Anthropic API if you configure the `api` provider and provide an API key.

## Third-Party Services

| Service | When Used | Data Shared |
|---------|-----------|-------------|
| Anthropic API | Only with `provider: api` | PR diff content for AI review |
| GitHub API | Always | Standard GitHub App API interactions |

## Your Rights

- **Access:** You can see exactly what data PR Guardian accesses — it's all visible in your GitHub repository.
- **Deletion:** Uninstall the App to stop all data access. Since no data is stored, there is nothing to delete.
- **Portability:** All review comments are posted to your GitHub PRs and remain under your control.
- **Opt-out:** Remove the `.pr-guardian.yml` config or uninstall the App at any time.

## Children's Privacy

PR Guardian does not knowingly collect data from children under 13.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be committed to this repository and reflected in the "Last Updated" date above.

## Contact

For privacy-related questions or concerns:

- **GitHub Issues:** [github.com/utafrali/PR-Guardian/issues](https://github.com/utafrali/PR-Guardian/issues)
- **Email:** Open an issue for the fastest response

## Open Source

PR Guardian is open source under the MIT License. You can audit the entire codebase to verify our privacy practices: [github.com/utafrali/PR-Guardian](https://github.com/utafrali/PR-Guardian)
