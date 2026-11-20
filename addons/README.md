# Addons

JSPrismarine's own addons: optional behavior packs that a server owner installs with the console's
`addon install <name>`. None of them ships with the server.

Each folder here is one addon, named for it, with its pack files and an `addon.json`.
[`@jsprismarine/addon-tools`](../packages/addon-tools/README.md#an-addon) describes the layout
and what the build checks. The [Addons workflow](../.github/workflows/addons.yml) builds every
addon on a pull request that changes one, and on `master` attaches each new version to the
<!-- fact:addons.releaseTag -->`addons`<!-- /fact --> release with the index servers install from.

To release a change to an addon, raise the version in its `manifest.json` header and in each of its
modules. A published version never changes, so the build fails for a changed addon whose version
is already on the release.

Build them locally from the repository root:

```sh
pnpm exec tsx packages/addon-tools/src/cli.ts build --repository JSPrismarine/JSPrismarine
```
