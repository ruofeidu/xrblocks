#!/usr/bin/env python3
"""Fetch merged PRs from google/xrblocks and materialize them as task folders.

Each task folder under evals/tasks/<num>/ contains:
  - prompt.md         the title + body the original author had
  - base.sha          the commit the PR was opened against (the agent's starting state)
  - golden.diff       the actual merged diff (the gold standard)
  - changed_files.json the list of files the human touched
  - meta.json         author, merged_at, additions, deletions, etc

Usage:
  python evals/fetch_prs.py 335 330 329 328 325 326
"""
from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys

REPO = "google/xrblocks"
ROOT = pathlib.Path(__file__).resolve().parent
TASKS = ROOT / "tasks"


def gh(*args: str) -> str:
    env = {**os.environ}
    env.pop("GH_TOKEN", None)
    env.pop("GITHUB_TOKEN", None)
    return subprocess.check_output(["gh", *args], env=env, text=True)


def fetch_pr(num: int) -> None:
    print(f"#{num}: fetching metadata")
    raw = gh(
        "pr",
        "view",
        str(num),
        "--repo",
        REPO,
        "--json",
        "number,title,body,author,mergedAt,additions,deletions,changedFiles,"
        "files,baseRefOid,mergeCommit",
    )
    pr = json.loads(raw)
    if not pr.get("mergeCommit"):
        print(f"  ! #{num} is not merged, skipping")
        return

    merge_sha = pr["mergeCommit"]["oid"]
    # The base commit the agent should start from = merge_sha^1 (first parent).
    base_sha = subprocess.check_output(
        ["git", "rev-parse", f"{merge_sha}^1"], text=True
    ).strip()

    task_dir = TASKS / str(num)
    task_dir.mkdir(parents=True, exist_ok=True)

    (task_dir / "prompt.md").write_text(
        f"# {pr['title']}\n\n{pr.get('body') or '(no body)'}\n"
    )
    (task_dir / "base.sha").write_text(base_sha + "\n")
    (task_dir / "merge.sha").write_text(merge_sha + "\n")

    # Golden diff = the actual merged changes.
    diff = subprocess.check_output(
        ["git", "diff", f"{base_sha}..{merge_sha}"], text=True
    )
    (task_dir / "golden.diff").write_text(diff)

    changed_files = [f["path"] for f in pr.get("files", [])]
    (task_dir / "changed_files.json").write_text(
        json.dumps(changed_files, indent=2) + "\n"
    )

    meta = {
        "number": pr["number"],
        "title": pr["title"],
        "author": pr["author"]["login"],
        "merged_at": pr["mergedAt"],
        "additions": pr["additions"],
        "deletions": pr["deletions"],
        "changed_files_count": pr["changedFiles"],
        "base_sha": base_sha,
        "merge_sha": merge_sha,
    }
    (task_dir / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(
        f"  ok: +{pr['additions']}/-{pr['deletions']} "
        f"across {len(changed_files)} files"
    )


def main(argv: list[str]) -> int:
    if not argv:
        print("usage: fetch_prs.py <pr_num> [<pr_num> ...]", file=sys.stderr)
        return 1
    TASKS.mkdir(parents=True, exist_ok=True)
    for n in argv:
        fetch_pr(int(n))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
