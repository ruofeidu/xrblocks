#!/usr/bin/env python3
"""Render result charts for the eval. Reads from evals/results/{gem-api-*, judge}/
and emits png files under evals/results/charts/.

Usage:
  python evals/plot.py
"""
from __future__ import annotations

import json
import pathlib
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
RESULTS = ROOT / "evals" / "results"
CHARTS = ROOT / "evals" / "charts"


def load_results() -> tuple[list[str], dict, dict, dict]:
    w = {f.stem: json.loads(f.read_text()) for f in sorted((RESULTS / "gem-api-with-skill").glob("*.json"))}
    wo = {f.stem: json.loads(f.read_text()) for f in sorted((RESULTS / "gem-api-without-skill").glob("*.json"))}
    judges = {}
    jdir = RESULTS / "judge"
    if jdir.exists():
        for f in jdir.glob("*.json"):
            judges[f.stem] = json.loads(f.read_text())
    tasks = sorted(set(w) | set(wo))
    return tasks, w, wo, judges


def plot_composite_bars(tasks: list[str], w: dict, wo: dict) -> pathlib.Path:
    x = np.arange(len(tasks))
    width = 0.38
    w_vals = [w.get(t, {}).get("composite", 0) for t in tasks]
    wo_vals = [wo.get(t, {}).get("composite", 0) for t in tasks]

    fig, ax = plt.subplots(figsize=(11, 5))
    ax.bar(x - width / 2, w_vals, width, label="with skill", color="#34a853")
    ax.bar(x + width / 2, wo_vals, width, label="without skill", color="#ea4335")
    ax.set_xticks(x)
    ax.set_xticklabels(tasks, rotation=30, ha="right")
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("composite score (0-1)")
    ax.set_title("xrblocks skill eval, composite score per task, gemini-2.5-pro")
    ax.legend()
    ax.grid(axis="y", alpha=0.3)
    for i, (a, b) in enumerate(zip(w_vals, wo_vals)):
        ax.text(i - width / 2, a + 0.02, f"{a:.2f}", ha="center", fontsize=8)
        ax.text(i + width / 2, b + 0.02, f"{b:.2f}", ha="center", fontsize=8)
    fig.tight_layout()
    out = CHARTS / "composite_per_task.png"
    fig.savefig(out, dpi=144)
    plt.close(fig)
    return out


def plot_metric_grid(tasks: list[str], w: dict, wo: dict) -> pathlib.Path:
    metrics = ["import_match", "api_match", "forbidden_clean", "parse_ok"]
    fig, axes = plt.subplots(2, 2, figsize=(12, 8))
    for ax, m in zip(axes.flat, metrics):
        x = np.arange(len(tasks))
        width = 0.38
        w_vals = [w.get(t, {}).get(m, 0) for t in tasks]
        wo_vals = [wo.get(t, {}).get(m, 0) for t in tasks]
        ax.bar(x - width / 2, w_vals, width, label="with", color="#34a853")
        ax.bar(x + width / 2, wo_vals, width, label="without", color="#ea4335")
        ax.set_title(m)
        ax.set_xticks(x)
        ax.set_xticklabels([t.split("-")[0] for t in tasks], rotation=30, ha="right", fontsize=8)
        ax.set_ylim(0, 1.05)
        ax.grid(axis="y", alpha=0.3)
    axes[0, 0].legend()
    fig.suptitle("per-metric breakdown, with vs without skill", y=0.99)
    fig.tight_layout()
    out = CHARTS / "metrics_grid.png"
    fig.savefig(out, dpi=144)
    plt.close(fig)
    return out


def plot_judge(tasks: list[str], judges: dict) -> pathlib.Path | None:
    if not judges:
        return None
    rows = []
    for t in tasks:
        jw = judges.get(f"{t}-with-skill", {})
        jwo = judges.get(f"{t}-without-skill", {})
        rows.append(
            (
                t,
                jw.get("accomplishes_task", 0),
                jw.get("idiomatic_xrblocks", 0),
                jwo.get("accomplishes_task", 0),
                jwo.get("idiomatic_xrblocks", 0),
            )
        )
    fig, ax = plt.subplots(figsize=(11, 5))
    x = np.arange(len(tasks))
    width = 0.2
    ax.bar(x - 1.5 * width, [r[1] for r in rows], width, label="w/  accomplishes", color="#0b8043")
    ax.bar(x - 0.5 * width, [r[2] for r in rows], width, label="w/  idiomatic", color="#34a853")
    ax.bar(x + 0.5 * width, [r[3] for r in rows], width, label="w/o accomplishes", color="#c5221f")
    ax.bar(x + 1.5 * width, [r[4] for r in rows], width, label="w/o idiomatic", color="#ea4335")
    ax.set_xticks(x)
    ax.set_xticklabels(tasks, rotation=30, ha="right")
    ax.set_ylim(0, 5.5)
    ax.set_ylabel("judge score (1-5)")
    ax.set_title("llm judge (gemini-2.5-pro), accomplishes_task and idiomatic_xrblocks per task")
    ax.legend(fontsize=8, loc="upper right")
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    out = CHARTS / "judge_per_task.png"
    fig.savefig(out, dpi=144)
    plt.close(fig)
    return out


def main() -> int:
    CHARTS.mkdir(parents=True, exist_ok=True)
    tasks, w, wo, judges = load_results()
    if not tasks:
        print("no results yet", file=sys.stderr)
        return 1
    out1 = plot_composite_bars(tasks, w, wo)
    out2 = plot_metric_grid(tasks, w, wo)
    out3 = plot_judge(tasks, judges)
    print(f"wrote {out1}")
    print(f"wrote {out2}")
    if out3:
        print(f"wrote {out3}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
