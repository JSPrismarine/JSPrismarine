---
name: pr-recordings
description: Capture a screen recording or screenshots of a bug fix or feature with the e2e client and attach them to a pull request. Use when a PR covers client-visible behavior and needs visual evidence, or when the user asks to add a recording or screenshots to a PR.
---

# PR recordings

Visual evidence for a pull request: record the behavior with the real client, then attach the
file to the PR. Only create or edit a PR when the user asked for one; with no PR in play, stop
after the capture and report the file paths.

## Capture

Produce the recording with the [client-e2e](../client-e2e/SKILL.md) skill. The short path, when a
scripted scenario already shows the behavior:

```bash
pnpm run e2e:client <scenario> -- --record --artifacts "$(mktemp -d)"
```

For anything else, drive the client interactively: launch headless with an isolated user root,
join the scratch server, `record_start` with `fixed_clock: false`, perform the behavior,
`record_stop`, and save a `screenshot` of the end state as a thumbnail-sized fallback.

Rules for what the file may show:

- A bug fix gets a before/after pair: record once on the base branch (or the state the issue
  describes) and once on the fix, performing the same steps.
- Captures come from the headless test client with a placeholder display name. No real
  gamertags, no real server addresses; `test_accounts` exists for launcher captures.
- Write captures to a temporary directory. They never enter git; attaching uploads them.

## Attach

`gh pr create` and `gh pr edit` upload images and video with `--attach`. Video renders as a
player in the PR body; images take alt text after a `#`:

```bash
gh pr edit <number> --attach /tmp/evidence/after.mp4 \
    --attach '/tmp/evidence/before.png#Furnace UI before the fix' \
    --attach '/tmp/evidence/after.png#Furnace UI after the fix'
```

Without a body flag the attachments are appended to the existing body. To place them yourself,
reference the files from the body as `![alt](./after.png)` relative to the `--body-file`
directory and the references are rewritten to the uploaded assets. Label which capture is before
and which is after, and note the scenario or steps performed so a reviewer can reproduce them.
`--attach` takes up to 50 files per command; a partial upload failure still edits the PR and
exits non-zero, so check the result.
