#!/usr/bin/env python3
"""Summarize the latest prototyping run: side-by-side with-skill vs
without-skill across every task, plus optional judge column.

Reads from evals/results/gem-api-{with,without}-skill/ and (if present)
evals/results/judge/. Writes evals/results/_summary.md.

Usage:
  python evals/summarize_proto.py
"""
from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
RESULTS = ROOT / "evals" / "results"


def load_dir(d: pathlib.Path) -> dict:
    out = {}
    if not d.exists():
        return out
    for f in sorted(d.glob("*.json")):
        try:
            out[f.stem] = json.loads(f.read_text())
        except Exception:
            pass
    return out


def main() -> int:
    w = load_dir(RESULTS / "gem-api-with-skill")
    wo = load_dir(RESULTS / "gem-api-without-skill")
    judges = load_dir(RESULTS / "judge")

    tasks = sorted(set(w) | set(wo))
    if not tasks:
        print("no results found", file=sys.stderr)
        return 1

    lines = ["# Eval Summary", "", f"tasks: {len(tasks)}", ""]
    headers = [
        "task",
        "skill",
        "composite w/",
        "composite w/o",
        "Δ",
    ]
    if judges:
        headers += ["judge w/", "judge w/o"]
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("|" + "|".join("---" for _ in headers) + "|")

    sums = {"with": 0.0, "without": 0.0, "n": 0}
    for t in tasks:
        rw = w.get(t, {})
        rwo = wo.get(t, {})
        skill = rw.get("skill") or rwo.get("skill") or "?"
        cw = rw.get("composite", float("nan"))
        cwo = rwo.get("composite", float("nan"))
        if cw == cw and cwo == cwo:
            sums["with"] += cw
            sums["without"] += cwo
            sums["n"] += 1
            delta = f"{cw - cwo:+.2f}"
        else:
            delta = "?"
        row = [t, skill, f"{cw:.2f}", f"{cwo:.2f}", delta]
        if judges:
            jw = judges.get(f"{t}-with-skill", {})
            jwo = judges.get(f"{t}-without-skill", {})

            def fmt(j: dict) -> str:
                if not j or "accomplishes_task" not in j:
                    return "—"
                return f"{j['accomplishes_task']}/{j['idiomatic_xrblocks']}/{j.get('would_merge', '?')}"

            row += [fmt(jw), fmt(jwo)]
        lines.append("| " + " | ".join(row) + " |")

    if sums["n"] > 0:
        avg_w = sums["with"] / sums["n"]
        avg_wo = sums["without"] / sums["n"]
        avg_d = avg_w - avg_wo
        avg_row = [
            "**avg**",
            "",
            f"**{avg_w:.2f}**",
            f"**{avg_wo:.2f}**",
            f"**{avg_d:+.2f}**",
        ]
        if judges:
            avg_row += ["", ""]
        lines.append("| " + " | ".join(avg_row) + " |")

    out_md = "\n".join(lines)
    (RESULTS / "_summary.md").write_text(out_md + "\n")
    print(out_md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
