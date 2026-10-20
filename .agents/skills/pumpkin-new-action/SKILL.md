---
name: pumpkin-new-action
description: Scaffold a new GitHub Action here with `pnpm gen:action`, its input helper, tests and release registration. Use for new actions, not changes to existing ones.
---

# Create a GitHub Action

Read [Creating an action](../../../docs/creating-an-action.md) and the action-registration section
of [CI and releases](../../../docs/ci-and-releases.md#registering-an-action-for-releases). Check
`git status --short` and make sure the requested folder does not already exist under `actions/`.

Generate the action from the repository root:

```sh
pnpm gen:action --args <folder> "<Display Name>" "<description>"
```

Use a kebab-case folder name. The generator creates a Node 24 JavaScript action in
`actions/<folder>/`, including `action.yml`, a runnable `src/index.mjs` placeholder and co-located tests.
Input/output helpers and their regression tests live once in `actions/common/src/`. The generator
registers the action for Release Please and adds its row to the root README. Do not hand-write those
registrations or edit generated release files.

Implement the requested behavior in `src/index.mjs`. Read GitHub inputs with
`getInput('input-name')` from `../../common/src/utils.mjs`, passing each input's declared name with its hyphens.
GitHub exposes `plugin-name` as `INPUT_PLUGIN-NAME`; replacing hyphens with underscores makes the
input appear empty. Keep behavior tests beside the implementation in `src/*.test.mjs`, including
hyphenated environment keys for actions with hyphenated inputs.

Document usage and behavior in the action README. Its Inputs and Outputs tables are generated from
`action.yml`; update those descriptions and declarations there, then run `pnpm readme`. Do not edit
the generated tables directly. Read values with `getInput()` and write declared outputs with
`setOutput()` from that shared module; keep its regression tests. JavaScript actions run on
GitHub's Node 24 runtime, so consumers do not need `actions/setup-node` for the action. Use a
composite action only when the implementation needs to orchestrate workflow steps. Nested action
metadata in this monorepo is usable by path, but is not automatically listed in GitHub Marketplace.

After implementation, run the action's tests and `node .agents/hooks/check.mjs` with the changed
files. Inspect the generated release entries and README table, and review the final diff. Commit each
completed slice locally, following [commit-discipline](../commit-discipline/SKILL.md); push only when
the user asks.
