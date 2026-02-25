# Adding Custom Review Rules

PR Guardian's review system is extensible. You can add custom reviewers for specific languages, frameworks, or project conventions.

## Reviewer Interface

Every reviewer follows this pattern:

```typescript
import type { ReviewContext, ReviewResult } from '../config.js';

export async function runMyReviewer(
  context: ReviewContext,
  // additional params as needed
): Promise<ReviewResult> {
  return {
    reviewer: 'My Reviewer',
    summary: 'What happened',
    comments: [],           // inline comments
    labels: [],             // optional labels to add
    status: 'success',      // success | failure | neutral
  };
}
```

## Adding a Reviewer

1. Create `src/reviewers/my-reviewer.ts`
2. Implement the reviewer function
3. Register it in `src/handlers/pull-request.ts`:

```typescript
import { runMyReviewer } from '../reviewers/my-reviewer.js';

// In the Promise.allSettled array:
const reviewers = await Promise.allSettled([
  runAIReview(reviewContext, diff),
  // ...existing reviewers
  runMyReviewer(reviewContext, diff),
]);
```

4. Add tests in `test/reviewers/my-reviewer.test.ts`

## Example: Framework-Specific Rule

```typescript
export async function runReactReviewer(
  context: ReviewContext,
  diff: PRDiff,
): Promise<ReviewResult> {
  const comments: ReviewComment[] = [];

  for (const file of diff.files) {
    if (!file.filename.endsWith('.tsx')) continue;

    // Check for common React anti-patterns
    if (file.patch?.includes('useEffect') && !file.patch?.includes('cleanup')) {
      comments.push({
        path: file.filename,
        line: 1,
        body: 'useEffect without cleanup function — consider adding a return statement',
        severity: 'warning',
      });
    }
  }

  return {
    reviewer: 'React Review',
    summary: comments.length > 0
      ? `Found ${comments.length} React issue(s)`
      : 'No React issues found',
    comments,
    status: comments.some((c) => c.severity === 'critical') ? 'failure' : 'success',
  };
}
```
