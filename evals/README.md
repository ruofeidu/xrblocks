# XR Blocks Skill Evaluation Harness

A lightweight benchmark for measuring whether `SKILL.md` files (or any agent
context change) actually help an agent produce the same kind of changes a
human contributor would.

## Why replay merged PRs?

- **No handcrafted tasks.** Every merged PR is, by definition, a real change
  someone wanted made.
- **Ground truth comes for free.** The merged diff is the gold standard.
- **Re-runs are cheap.** Same harness, different model or skill version, new
  result column. No need to redesign the eval each time.

## What's measured

For each PR, after the agent runs against the base commit:

| metric                | meaning                                            |
| --------------------- | -------------------------------------------------- | ------------- | --- | ------------- | -------------------- |
| `file_jaccard`        | `                                                  | agent ∩ human | /   | agent ∪ human | ` over changed files |
| `file_overlap_recall` | did the agent touch the files the human touched?   |
| `line_similarity`     | rough similarity between agent diff and human diff |
| `extra_files`         | files the agent edited the human didn't            |
| `missed_files`        | files the human edited the agent didn't            |

These are proxies, not grades. A 0.0 jaccard doesn't mean wrong (the agent
may have solved the same problem a different way). For real verdicts, layer
in: did the agent's branch pass CI? did a strong judge model rate the diff as
equivalent?

## Workflow

```bash
# 1. Pick PRs and materialize task folders (writes evals/tasks/<num>/).
python evals/fetch_prs.py 335 330 329 328 325 326

# 2. For each task, run the agent in an isolated worktree.
./evals/setup_worktree.sh 335
# … work in /tmp/xrblocks-eval-335 with your agent of choice …
cd /tmp/xrblocks-eval-335 && git diff > /tmp/agent-335.diff && cd -

# 3. Score the agent's diff.
mkdir -p evals/results/skill-on
python evals/score.py evals/tasks/335 /tmp/agent-335.diff \
  > evals/results/skill-on/335.json

# 4. Summarize when all tasks are done.
python evals/summarize.py evals/results/skill-on
```

## Comparing skill on vs off

Run the agent twice on each task: once with `src/SKILL.md` (and addon
SKILL.md files) in context, once without. Save results to
`results/skill-on/` and `results/skill-off/`. The delta on each metric is
the skill's contribution.

For ablations, comment out one section of a SKILL at a time and re-run a
subset to see which sentences carry the weight.

## Picking PRs

Good candidates are mid-size: 10-500 LOC, 1-8 changed files, not pure
dependency bumps, not pure version tags. The seed set (`335 330 329 328 325
326`) is a starting point covering bug fixes, new components, and docs
wireup.

Skip:

- PRs where the contributor is the same person running the eval (context bias).
- Dependabot or release-only PRs.
- PRs that depend on external state the agent can't see (e.g., a redirect
  that depends on infra changes outside the repo).

## What's NOT in this MVP

- No automated agent invocation. The runner is a worktree + a manual paste of
  the prompt into your agent. Wire your own CLI shim if you want full auto.
- No CI-pass verification. To add: after the agent commits to the worktree,
  run `npm run build && npm run lint && npm run format:check && npm test`,
  capture pass/fail.
- No LLM-as-judge. For "is this diff functionally equivalent?", layer in a
  strong model later.

## Files

```
evals/
├── README.md
├── fetch_prs.py        Materialize task folders from merged PRs
├── score.py            Score a candidate diff against the golden diff
├── summarize.py        Roll task results into CSV + markdown
├── setup_worktree.sh   Git worktree at the task's base commit
├── .gitignore          Ignore golden diffs (regenerable) and results
├── tasks/              Per-PR task folders (committed: prompt + meta only)
│   └── <pr_num>/
│       ├── prompt.md
│       ├── base.sha
│       ├── merge.sha
│       ├── changed_files.json
│       ├── meta.json
│       └── golden.diff   (gitignored: regenerable from base/merge SHAs)
└── results/            Per-run scoring artifacts (gitignored)
    └── <run_id>/
        ├── <task>.json
        ├── _summary.csv
        └── _summary.md
```
