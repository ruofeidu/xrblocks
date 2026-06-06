#!/usr/bin/env bash
# Set up a clean worktree at the task's base SHA so an agent can run against it.
#
# After running this, you (or your agent) work in the worktree, produce a diff
# with `git diff > <output>.diff`, then feed it to score.py.
#
# Usage:
#   ./evals/setup_worktree.sh 335
#   # ... do work in /tmp/xrblocks-eval-335 ...
#   cd /tmp/xrblocks-eval-335 && git diff > /tmp/agent-335.diff
#   cd - && python evals/score.py evals/tasks/335 /tmp/agent-335.diff

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: setup_worktree.sh <pr_num>" >&2
  exit 1
fi

NUM="$1"
TASK_DIR="$(dirname "$0")/tasks/$NUM"
BASE_SHA="$(cat "$TASK_DIR/base.sha")"
WORKTREE="/tmp/xrblocks-eval-$NUM"

if [ -d "$WORKTREE" ]; then
  echo "removing existing worktree at $WORKTREE"
  git worktree remove --force "$WORKTREE" 2>/dev/null || rm -rf "$WORKTREE"
fi

git worktree add "$WORKTREE" "$BASE_SHA"

echo
echo "ready: $WORKTREE (at $BASE_SHA)"
echo
echo "prompt:"
echo "------"
sed 's/^/  /' "$TASK_DIR/prompt.md"
echo
echo "when done:"
echo "  cd $WORKTREE"
echo "  git diff > /tmp/agent-$NUM.diff"
echo "  cd $(pwd)"
echo "  python evals/score.py $TASK_DIR /tmp/agent-$NUM.diff"
