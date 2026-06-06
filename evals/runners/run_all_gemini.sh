#!/usr/bin/env bash
# Run every materialized task against Gemini with skill on AND off, then
# summarize both result sets.
#
# Usage:
#   ./evals/runners/run_all_gemini.sh
#
# Optional: TASKS env var to limit which tasks run.
#   TASKS="335 330" ./evals/runners/run_all_gemini.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EVALS="$REPO_ROOT/evals"

if [ -n "${TASKS:-}" ]; then
  TASK_LIST="$TASKS"
else
  TASK_LIST=$(ls "$EVALS/tasks" | sort -n | xargs)
fi

echo "tasks: $TASK_LIST"

for n in $TASK_LIST; do
  for mode in with-skill without-skill; do
    echo
    echo "============================================================"
    echo "task $n  mode=$mode"
    echo "============================================================"
    "$EVALS/runners/run_gemini.sh" "$n" "$mode" || echo "  ! task $n / $mode failed"
  done
done

echo
echo "============================================================"
echo "summary"
echo "============================================================"
echo
echo "## with-skill"
python3 "$EVALS/summarize.py" "$EVALS/results/gemini-with-skill"
echo
echo "## without-skill"
python3 "$EVALS/summarize.py" "$EVALS/results/gemini-without-skill"
