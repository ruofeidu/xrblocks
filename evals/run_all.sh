#!/usr/bin/env bash
# Run the full eval: every task × {with-skill, without-skill}, optionally
# the judge too. Writes results under evals/results/.
#
# Usage:
#   ./evals/run_all.sh             # run agent + scorer for every task × 2 modes
#   ./evals/run_all.sh --judge     # also run the llm-judge on each output
#
# Env:
#   GEMINI_API_KEY  required
#   TASKS           optional, space-separated task ids to limit the run
#                   (default: every dir under evals/prototypes/tasks/)

set -euo pipefail

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "error: GEMINI_API_KEY not set" >&2
  exit 1
fi

WITH_JUDGE=0
for arg in "$@"; do
  case "$arg" in
    --judge) WITH_JUDGE=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EVALS="$REPO_ROOT/evals"

if [ -n "${TASKS:-}" ]; then
  TASK_LIST="$TASKS"
else
  TASK_LIST=$(ls "$EVALS/prototypes/tasks" | sort | xargs)
fi

echo "tasks: $TASK_LIST"
echo "judge: $([ "$WITH_JUDGE" = 1 ] && echo on || echo off)"
echo

for task in $TASK_LIST; do
  for mode in with-skill without-skill; do
    echo "============================================================"
    echo "$task / $mode"
    echo "============================================================"
    python3 "$EVALS/prototypes/runners/run_gem_api.py" "$task" "$mode" 2>&1 | tail -3 || {
      echo "  ! $task / $mode failed"
      continue
    }
    if [ "$WITH_JUDGE" = 1 ]; then
      workspace="/tmp/xrblocks-gem-${task}-${mode}"
      mkdir -p "$EVALS/results/judge"
      python3 "$EVALS/prototypes/judge.py" "$task" "$workspace" \
        > "$EVALS/results/judge/${task}-${mode}.json"
      composite_judge=$(python3 -c "import json; r=json.load(open('$EVALS/results/judge/${task}-${mode}.json')); print(f\"judge: accomplishes={r.get('accomplishes_task','?')} idiomatic={r.get('idiomatic_xrblocks','?')} merge={r.get('would_merge','?')}\")")
      echo "  $composite_judge"
    fi
  done
done

echo
echo "============================================================"
echo "summary"
echo "============================================================"
python3 "$EVALS/summarize_proto.py"
