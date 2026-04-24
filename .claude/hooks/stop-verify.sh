#!/usr/bin/env bash
# Stop hook: run verify. If red, emit decision:block so Claude continues
# and fixes the failure before finalizing. Verify output goes to the
# hook's stderr and is shown to Claude alongside the block decision.
cd "${CLAUDE_PROJECT_DIR:-.}"
npm run verify:unit && npm run verify:e2e && exit 0
echo '{"decision":"block","reason":"verify failed — fix the failing tests before stopping"}'
