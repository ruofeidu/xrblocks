#!/usr/bin/env python3
"""Score a candidate agent diff against the golden diff for a task.

Metrics:
  - file_jaccard:   |agent_files ∩ golden_files| / |agent_files ∪ golden_files|
  - file_overlap:   |agent_files ∩ golden_files| / |golden_files|  (recall)
  - line_similarity: ratio of matching diff lines (added/removed), via difflib
  - extra_files:    files the agent touched but the human didn't
  - missed_files:   files the human touched but the agent didn't

A 1.0 file_jaccard does not mean "correct" — it just means the agent edited
the same files. line_similarity is a rough proxy for "did the agent write
similar code". For a real grade, layer in: did the agent's branch pass CI?
That requires actually running the build.

Usage:
  python evals/score.py tasks/335 path/to/agent.diff
"""
from __future__ import annotations

import difflib
import json
import pathlib
import re
import sys


DIFF_FILE_RE = re.compile(r"^\+\+\+ b/(.+)$", re.M)


def files_in_diff(diff_text: str) -> set[str]:
    return {m.group(1) for m in DIFF_FILE_RE.finditer(diff_text)}


def diff_lines(diff_text: str) -> list[str]:
    out = []
    for line in diff_text.splitlines():
        # Keep only meaningful add/remove lines, drop headers/hunk markers.
        if line.startswith("+++") or line.startswith("---"):
            continue
        if line.startswith("@@"):
            continue
        if line.startswith(("+", "-")):
            out.append(line)
    return out


def score(task_dir: pathlib.Path, agent_diff_path: pathlib.Path) -> dict:
    golden = (task_dir / "golden.diff").read_text()
    agent = agent_diff_path.read_text()

    g_files = files_in_diff(golden)
    a_files = files_in_diff(agent)

    intersect = g_files & a_files
    union = g_files | a_files
    jaccard = len(intersect) / len(union) if union else 0.0
    overlap = len(intersect) / len(g_files) if g_files else 0.0

    g_lines = diff_lines(golden)
    a_lines = diff_lines(agent)
    line_sim = difflib.SequenceMatcher(None, g_lines, a_lines).ratio()

    return {
        "task": task_dir.name,
        "file_jaccard": round(jaccard, 3),
        "file_overlap_recall": round(overlap, 3),
        "line_similarity": round(line_sim, 3),
        "golden_files": sorted(g_files),
        "agent_files": sorted(a_files),
        "extra_files": sorted(a_files - g_files),
        "missed_files": sorted(g_files - a_files),
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: score.py <task_dir> <agent_diff_path>", file=sys.stderr)
        return 1
    task_dir = pathlib.Path(argv[0])
    agent_diff_path = pathlib.Path(argv[1])
    result = score(task_dir, agent_diff_path)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
