import type { PRDiff } from '../../src/github/diff.js';

export const sampleDiff: PRDiff = {
  files: [
    {
      filename: 'src/utils/auth.ts',
      status: 'modified',
      additions: 15,
      deletions: 3,
      patch: `@@ -10,7 +10,19 @@ export function validateToken(token: string) {
   if (!token) {
     throw new Error('Token is required');
   }
-  return jwt.verify(token, SECRET);
+  try {
+    return jwt.verify(token, SECRET);
+  } catch (error) {
+    logger.error({ error }, 'Token validation failed');
+    return null;
+  }
+}
+
+export function hashPassword(password: string) {
+  const salt = crypto.randomBytes(16).toString('hex');
+  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
+  return { salt, hash };
 }`,
      hunks: [
        {
          oldStart: 10,
          oldLines: 7,
          newStart: 10,
          newLines: 19,
          content: '@@ -10,7 +10,19 @@',
        },
      ],
    },
    {
      filename: 'docs/api.md',
      status: 'modified',
      additions: 5,
      deletions: 0,
      patch: `@@ -1,3 +1,8 @@
 # API Documentation
+
+## Authentication
+
+All API endpoints require a valid JWT token.
+Pass it in the Authorization header.`,
      hunks: [
        {
          oldStart: 1,
          oldLines: 3,
          newStart: 1,
          newLines: 8,
          content: '@@ -1,3 +1,8 @@',
        },
      ],
    },
    {
      filename: '.github/workflows/ci.yml',
      status: 'added',
      additions: 20,
      deletions: 0,
      patch: `@@ -0,0 +1,20 @@
+name: CI
+on: [push, pull_request]
+jobs:
+  test:
+    runs-on: ubuntu-latest`,
      hunks: [
        {
          oldStart: 0,
          oldLines: 0,
          newStart: 1,
          newLines: 20,
          content: '@@ -0,0 +1,20 @@',
        },
      ],
    },
    {
      filename: 'package.json',
      status: 'modified',
      additions: 2,
      deletions: 1,
      patch: `@@ -5,3 +5,4 @@
   "dependencies": {
-    "express": "^4.18.0"
+    "express": "^4.18.0",
+    "jsonwebtoken": "^9.0.0"
   }`,
      hunks: [
        {
          oldStart: 5,
          oldLines: 3,
          newStart: 5,
          newLines: 4,
          content: '@@ -5,3 +5,4 @@',
        },
      ],
    },
  ],
  totalAdditions: 42,
  totalDeletions: 4,
};

export const emptyDiff: PRDiff = {
  files: [],
  totalAdditions: 0,
  totalDeletions: 0,
};

export const testOnlyDiff: PRDiff = {
  files: [
    {
      filename: 'test/auth.test.ts',
      status: 'added',
      additions: 30,
      deletions: 0,
      patch: '@@ -0,0 +1,30 @@\n+describe("auth", () => {})',
      hunks: [],
    },
  ],
  totalAdditions: 30,
  totalDeletions: 0,
};

export const sourceOnlyDiff: PRDiff = {
  files: [
    {
      filename: 'src/api/handler.ts',
      status: 'modified',
      additions: 10,
      deletions: 2,
      patch: '@@ -1,5 +1,13 @@\n modified code',
      hunks: [],
    },
  ],
  totalAdditions: 10,
  totalDeletions: 2,
};
