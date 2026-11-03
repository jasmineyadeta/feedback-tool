#!/usr/bin/env bash
# pnpm merge-task — the only way to merge to main (D24).
source "$(dirname "$0")/lib.sh"
cd "$ROOT"

branch="$(git rev-parse --abbrev-ref HEAD)"
if ! [[ "$branch" =~ ^m[0-9]+/[a-z0-9._-]+$ ]]; then
  c_err "Not on a task branch (expected m{N}/{slug}, got '$branch')."; exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  c_err "Working tree is not clean. Commit your work on $branch first."; exit 1
fi
if ! git merge-base --is-ancestor main "$branch"; then
  c_err "$branch is not based on the latest main. Rebase it first (git rebase main)."; exit 1
fi

echo "Running pnpm verify on ${branch}…"
bash "$ROOT/scripts/verify.sh"
if [ -n "$(git status --porcelain)" ]; then
  c_err "verify changed tracked files; commit them and re-run."; exit 1
fi

# Commit message: title from the newest changelog entry added on this branch.
log_file="$(git diff --name-only --diff-filter=A main..."$branch" -- 'docs/changelog/*.md' | sort | tail -1)"
title="$branch"
if [ -n "$log_file" ]; then title="$(grep -m1 '^# ' "$log_file" | sed 's/^# //')"; fi
body="$(git log --format='- %s' main.."$branch")"

git switch -q main
git merge --squash -q "$branch"
git commit -q -m "$title" -m "Branch: $branch" -m "$body" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git branch -D -q "$branch"
c_ok "Squash-merged $branch into main: $title"
