#!/usr/bin/env bash
# Run Gemini against a task with skill on or off, score the resulting diff.
#
# Usage:
#   ./evals/runners/run_gemini.sh <pr_num> {with-skill|without-skill}
#
# Requires:
#   - gemini CLI on PATH (npm i -g @google/gemini-cli)
#   - GEMINI_API_KEY env var
#   - the task already materialized via fetch_prs.py

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: run_gemini.sh <pr_num> {with-skill|without-skill}" >&2
  exit 1
fi

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "error: GEMINI_API_KEY not set" >&2
  exit 1
fi

NUM="$1"
MODE="$2"
case "$MODE" in
  with-skill|without-skill) ;;
  *) echo "error: mode must be with-skill or without-skill" >&2; exit 1;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EVALS="$REPO_ROOT/evals"
TASK_DIR="$EVALS/tasks/$NUM"
WORKTREE="/tmp/xrblocks-eval-${NUM}-${MODE}"
RESULTS_DIR="$EVALS/results/gemini-${MODE}"
DIFF_PATH="$WORKTREE.diff"
LOG_PATH="$WORKTREE.log"

mkdir -p "$RESULTS_DIR"

if [ ! -d "$TASK_DIR" ]; then
  echo "error: task $NUM not materialized (run fetch_prs.py first)" >&2
  exit 1
fi

BASE_SHA="$(cat "$TASK_DIR/base.sha")"

# Clean any prior worktree.
if [ -d "$WORKTREE" ]; then
  git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" 2>/dev/null || rm -rf "$WORKTREE"
fi

echo "[$NUM/$MODE] setting up worktree at $BASE_SHA"
git -C "$REPO_ROOT" worktree add "$WORKTREE" "$BASE_SHA" >/dev/null

# Strip all SKILL.md files for the skill-off run.
if [ "$MODE" = "without-skill" ]; then
  removed=0
  while IFS= read -r f; do
    rm -f "$f"
    removed=$((removed + 1))
  done < <(find "$WORKTREE" -name SKILL.md -not -path '*/node_modules/*')
  echo "[$NUM/$MODE] stripped $removed SKILL.md files"
fi

# Inject CURRENT main's SKILL.md files into the worktree for the with-skill run.
# Many task bases predate the skill files, so without this the with-skill run has
# nothing to read.
if [ "$MODE" = "with-skill" ]; then
  injected=0
  while IFS= read -r f; do
    target="$WORKTREE/$f"
    mkdir -p "$(dirname "$target")"
    git -C "$REPO_ROOT" show "origin/main:$f" > "$target"
    injected=$((injected + 1))
  done < <(git -C "$REPO_ROOT" ls-tree -r origin/main --name-only | grep "SKILL.md$" | grep -v node_modules)
  echo "[$NUM/$MODE] injected $injected SKILL.md files from origin/main"
fi

# Build the prompt: task body + a closing directive so gemini knows the goal.
PROMPT_BODY="$(cat "$TASK_DIR/prompt.md")"
FULL_PROMPT="You are working in a checkout of the xrblocks repo. Implement the following task by editing files in the current directory. Do not commit; just make the file changes.

TASK:
${PROMPT_BODY}"

echo "[$NUM/$MODE] invoking gemini (headless, --yolo)"
cd "$WORKTREE"
# Run gemini; capture full output for debugging.
if ! gemini --skip-trust --approval-mode yolo -o text -p "$FULL_PROMPT" > "$LOG_PATH" 2>&1; then
  echo "[$NUM/$MODE] gemini exited non-zero — see $LOG_PATH"
fi

# Capture the diff.
git -C "$WORKTREE" diff > "$DIFF_PATH"
LINES=$(wc -l < "$DIFF_PATH" | tr -d ' ')
echo "[$NUM/$MODE] diff: $LINES lines → $DIFF_PATH"

# Score.
cd "$REPO_ROOT"
python3 evals/score.py "$TASK_DIR" "$DIFF_PATH" > "$RESULTS_DIR/${NUM}.json"
echo "[$NUM/$MODE] scored → $RESULTS_DIR/${NUM}.json"

# Cleanup worktree, keep diff + log + result.
git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" >/dev/null

cat "$RESULTS_DIR/${NUM}.json"
