---
name: pumpkin-new-plugin
description: Scaffold a new Pumpkin TypeScript plugin in this monorepo with the generator, release registration, metadata and server smoke test. Use for new plugins, not changes to existing ones.
---

# Create a Pumpkin plugin

Read [Creating a plugin](../../../docs/creating-a-plugin.md) before scaffolding.
Folder names are kebab-case, Pumpkin names are PascalCase, and the package description is at most
70 characters. Infer suitable names from the request unless the choice affects the intended behavior.
Check that the target folder does not exist.

Run `pnpm gen --args <folder> <PluginName> "<description>"` from the repo root. The generator owns
scaffolding, release registration, installation and README generation. Don't copy an existing plugin
or hand-write registration entries. Its lockfile and manifest changes are expected generated output.
Inspect the resulting diff, including the release entries and root README, without staging it.

Keep the generated `PluginBase` and `registerPlugin` lifecycle. Add behavior behind testable interfaces;
read [pumpkin-plugin-api](../pumpkin-plugin-api/SKILL.md) before introducing host calls, and
[pumpkin-plugin-contracts](../pumpkin-plugin-contracts/SKILL.md) when adding config or commands.
`src/info.ts` must remain importable by Node without Pumpkin or WASI imports.

The generated real-server test proves only that the plugin loads and answers its starter command. Add
tests for the requested behavior and failure paths. Use [pumpkin-testing](../pumpkin-testing/SKILL.md)
for validation; include the new plugin's real-server suite. If scaffolding partially fails, inspect what
it wrote before retrying; don't delete other work or rerun into an existing folder blindly.
