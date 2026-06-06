#!/usr/bin/env python3
"""Run a list of scored tasks and write a sheet-friendly summary.

Reads task results from results/<run_id>/<task>.json (produced by score.py
output redirected to file) and emits a CSV + a markdown table.

Usage:
  # First, for each task, save score.py output as JSON:
  python evals/score.py tasks/335 /tmp/agent-335.diff > results/skill-on/335.json

  # Then summarize:
  python evals/summarize.py results/skill-on
"""
from __future__ import annotations

import csv
import json
import pathlib
import sys


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: summarize.py <results_dir>", file=sys.stderr)
        return 1
    results_dir = pathlib.Path(argv[0])
    rows = []
    for f in sorted(results_dir.glob("*.json")):
        try:
            rows.append(json.loads(f.read_text()))
        except Exception as e:
            print(f"  ! skipped {f}: {e}", file=sys.stderr)

    if not rows:
        print(f"no results in {results_dir}", file=sys.stderr)
        return 1

    fieldnames = [
        "task",
        "file_jaccard",
        "file_overlap_recall",
        "line_similarity",
        "extra_files_count",
        "missed_files_count",
    ]
    csv_path = results_dir / "_summary.csv"
    with csv_path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(
                {
                    "task": r["task"],
                    "file_jaccard": r["file_jaccard"],
                    "file_overlap_recall": r["file_overlap_recall"],
                    "line_similarity": r["line_similarity"],
                    "extra_files_count": len(r["extra_files"]),
                    "missed_files_count": len(r["missed_files"]),
                }
            )

    n = len(rows)

    def avg(k: str) -> float:
        return round(sum(r[k] for r in rows) / n, 3)

    md_lines = [
        f"# Summary ({results_dir.name}, n={n})",
        "",
        "| task | jaccard | recall | line_sim | extra | missed |",
        "|------|---------|--------|----------|-------|--------|",
    ]
    for r in rows:
        md_lines.append(
            f"| {r['task']} | {r['file_jaccard']} | {r['file_overlap_recall']} | "
            f"{r['line_similarity']} | {len(r['extra_files'])} | "
            f"{len(r['missed_files'])} |"
        )
    md_lines.append(
        f"| **avg** | **{avg('file_jaccard')}** | "
        f"**{avg('file_overlap_recall')}** | **{avg('line_similarity')}** | | |"
    )
    md_path = results_dir / "_summary.md"
    md_path.write_text("\n".join(md_lines) + "\n")

    print(f"wrote {csv_path}")
    print(f"wrote {md_path}")
    print("\n".join(md_lines))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
