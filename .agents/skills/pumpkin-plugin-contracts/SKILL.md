---
name: pumpkin-plugin-contracts
description: Change Pumpkin plugin settings, command declarations, permission metadata and generated README content together. Use when changing these public contracts, not ordinary internal logic or handwritten docs.
---

# Plugin contracts

Read [Plugin config](../../../docs/plugin-config.md) for settings changes and
[Plugin info and READMEs](../../../docs/plugin-info-and-readmes.md) for commands and metadata.
Inspect the affected plugin's `src/info.ts` and the declarations it imports.

## Settings

Change the schema in the plugin's config module, not default TOML or generated README text.
Use `ConfigValues` to derive values, snake_case keys, and domain validators beside the schema.
Pass matching render options to `loadConfig` and `describeConfig` so installed defaults match the docs.
The store is an injected read/write interface; filesystem access belongs in the adapter.

Test the effect on existing user files when changing a setting: preserved values, added defaults,
removed keys, and invalid values. Invalid values must not cause the user's file to be rewritten;
malformed TOML must leave it untouched. Inspect existing `tools/config` behavior before changing it.
A renamed key can discard a user value under normal remove/add behavior; decide whether migration is
needed for the requested compatibility instead of assuming a rename is harmless.

## Commands and metadata

Declare commands with `defineCommands` from `@pumpkin-plugins/docs` in a host-free module.
Derive `info.commands` with `commandInfos`; register handlers with `registerCommands` from
`@pumpkin-plugins/plugin-kit/register-commands`. Permission nodes start with the exact Pumpkin
plugin name and a colon. Test registration and observable handler behavior using `FakeCommandHost`.

Keep `info` typed with `satisfies PluginInfo<typeof PLUGIN_NAME>`. Its imports must run under Node's
TypeScript stripping, without Pumpkin or WASI. The shared metadata already adds `http.outbound` for
updates. For new host permissions or WASI capabilities, also read
[pumpkin-plugin-api](../pumpkin-plugin-api/SKILL.md).

## Refresh derived content

Run `pnpm readme` and inspect generated changes. Don't edit inside `docs:begin`/`docs:end` markers.
Update handwritten explanations for changed behavior, then run `pnpm check` and `pnpm readme:check`.
The fast check runner runs both when called without paths; with explicit paths it skips `pnpm check`.
Runtime changes need the affected server tests too.
