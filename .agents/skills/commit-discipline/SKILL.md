---
name: commit-discipline
description: Use when creating or updating commits to keep them small, self-contained, single-domain, and preserve branch history safely.
---

# Commit discipline

Follow the root `AGENTS.md`: for requested feature work, commit each completed, validated slice
locally. Keep changes local; push, tag, or create, change, or review PRs and issues only when the user
requests them. The user's direct instructions take precedence over this skill and repository guidance.

Keep each commit small, self-contained, and limited to one domain or area. Keep the implementation,
tests, and documentation for that same area together when they form one coherent change. Split
unrelated areas into separate commits, even when they belong to one feature request. Commit each
completed slice after its relevant checks pass, in dependency order.

## Before each commit

- Check the current branch and `git status --short`; distinguish this task's files from existing work.
- Stage only files for the intended slice. Inspect the staged diff and confirm it covers one domain.
- Use the repository's Conventional Commit format described in [Merging](../../../docs/ci-and-releases.md#merging).

## Amendments and branch history

- When a change corrects a recent commit on the active feature branch or PR branch, amend that commit
  instead of adding a `fixup!` or `squash!` commit. Use `git commit --amend` for `HEAD`; for another
  recent commit on that branch, edit that commit in the branch history.
- On `master`, create a new commit for corrections. Never amend, rebase, or otherwise rewrite its
  existing history unless the user explicitly asks.
- Keep history edits local. Push only when the user requests it.
