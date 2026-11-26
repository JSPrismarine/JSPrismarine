# Addons

JSPrismarine's own addons: optional behavior packs that a server owner installs with the console's
`addon install <name>`. None of them ships with the server.

Each folder here is one addon, named for it, with its pack files and an `addon.json`.
[`@jsprismarine/addon-tools`](../packages/addon-tools/README.md#an-addon) describes the layout
and what the build checks. Start a new addon from the repository root with
`pnpm exec turbo gen Addon`, which asks for its name, title, description and oldest server, and
writes the folder with a fresh manifest. Then run `pnpm install` to link it.

The scripts are TypeScript. Each addon is a workspace package whose `src/` `tsc-ts` compiles into
`scripts/`, which git ignores, with the settings in [`tsconfig.base.json`](tsconfig.base.json).
Its `package.json` pins `@minecraft/server`'s typings to the version its manifest depends on.
Each addon also has a `turbo.json` that extends the root config and lists its compiled scripts in
`tasks.build.outputs`, so Turbo restores them on a cache hit. The generator writes that file, and
`pnpm run lint` checks that every addon has one.
`pnpm --filter ./addons/<name> run build` compiles one addon, and the addon build, the docs build
and the tests compile them on their own. The [Addons workflow](../.github/workflows/addons.yml) builds every
addon on a pull request that changes one, and on `master` attaches each new version to the
<!-- fact:addons.releaseTag -->`addons`<!-- /fact --> release with the index servers install from.

To release a change to an addon, raise the version in its `manifest.json` header and in each of its
modules. A published version never changes, so the build fails for a changed addon whose version
is already on the release.

Build them locally from the repository root:

```sh
pnpm exec tsx packages/addon-tools/src/cli.ts build --repository JSPrismarine/JSPrismarine
```

## Debug an addon's scripts

In VS Code, install the recommended Minecraft Bedrock Debugger extension and start the
**Debug addon scripts** launch configuration for the addon. It starts `pnpm dev` with its data in
`jsp/script-debug/` and every addon here linked, and the server connects to the debugger before
the addons' scripts start, so a breakpoint on their first lines stops.
`scripts/script-debug-server.mts` prepares the folder; it writes `config.json` only when the
folder has none, so your edits to it stay. It also writes the launch configurations, one per addon
with scripts: after adding an addon, run `node scripts/script-debug-server.mts --update`, which
`pnpm run lint` checks. [Debugging](../docs/guide/extending.md#debugging) covers the debugger
itself.
