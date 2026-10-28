# JSPrismarine

JSPrismarine is a TypeScript monorepo for a dedicated Minecraft Bedrock Edition server. `packages/`
contains the server and reusable packages for Bedrock data, protocol handling, networking, and
utilities.

## Project goals

- Keep the server and its packages reliable and maintainable.
- Treat each published npm package as a product with a public API and compatibility commitments.
- Keep package boundaries clear. Change shared behavior at the package that owns it, then account for its dependents.

## Questions are read-only

When a message asks for an explanation, feasibility assessment, or recommendation, answer without editing files. Treat a direct request to implement a change as authorization to edit.

## Writing

Use American English spelling in prose and documentation. Do not use British spellings.

## Before work

- Read [Contributing](CONTRIBUTING.md) for the project's contribution and pull request guidance.
- Run `git status --short` before editing. Preserve staged, unstaged, and untracked work. Do not
  stash, revert, stage, or reformat unrelated changes.
- Use pnpm and the scripts declared in the root or affected package manifests. Inspect a package's
  README and `package.json` before changing it.
- Read relevant pages under `docs/` when working on runtime behavior or documentation. Follow nearby
  code and tests for conventions when no guide covers the area.
- The `packages/bedrock-data/src/resources/` directory is a required Git submodule. If it is missing, initialize it with `git submodule update --init --recursive` before building.

## Repository rules

- Keep changes focused and local. For requested feature work, make small local commits for
  completed, validated slices and stage only the files in each slice. Follow
  [commit discipline](.agents/skills/commit-discipline/SKILL.md) when committing. Push, tag, publish,
  or create or modify a pull request only when the user asks.
- When adding a skill under `.agents/skills/<name>/`, add a relative symlink at
  `.claude/skills/<name>` pointing to that directory so Claude Code discovers it. Keep the skill
  files in `.agents/skills/` as the source of truth.
- For package changes that need a release, add a Changeset with `pnpm changeset`. Let Changesets
  manage package versions and release changelogs. Read [the versioning policy](docs/versioning.md)
  before adding or editing a Changeset, and choose a bump for each affected package based on its
  current version and the impact of the change.
- Treat `packages/bedrock-data/src/generated/` as generated output. Its inputs live in the resources
  submodule, and `packages/bedrock-data/utils/build.js` generates the JSON files. Change the
  generator or its source inputs when the generated data needs to change. Run
  `pnpm --filter @jsprismarine/bedrock-data run generate` to regenerate it.
- Let pnpm update `pnpm-lock.yaml` when dependencies change. Keep dependency versions consistent
  with the repository's package configuration.
- Follow the configured Biome and Prettier rules. Derive values from their source of truth instead of maintaining duplicate constants or lists.
- Let TypeScript infer types. Carry type information through declaration annotations, generics,
  `satisfies`, and narrowing (`instanceof`, `in`, type guards) rather than `as` assertions.
  `as const` is fine. Reserve other `as` casts for boundaries the compiler cannot see, such as
  parsed JSON or untyped third-party APIs, and comment why. In tests, build typed doubles instead
  of reaching for `as any`.
- Every packet with a payload must support both wire directions. Implement serialization and
  deserialization together with `encodePayload`/`decodePayload` for Prismarine, the matching
  payload or top-level encoder and decoder for RakNet, and `serializePayload`/`deserializePayload`
  for `NetworkPacket` classes. RakNet frame codecs use `toBinary`/`fromBinary`. Payload-free
  packets may inherit the base class's empty payload methods. `pnpm run lint:packets` checks
  Prismarine and RakNet packets; `NetworkPacket`'s abstract methods enforce the same contract at
  typecheck time. A fingerprinted legacy entry permits an existing one-way packet only while its
  source file stays unchanged. When editing one, implement both directions before updating the
  baseline with `node scripts/check-packet-codecs.mts --update`. Add round-trip coverage when
  adding a packet or changing its wire layout.
- Choose the smallest design that meets the request. Trace affected callers, package dependents, and
  failure paths before changing shared behavior.
- Whenever a change adds or changes data-driven compatibility behavior or a parity comparison
  surface, extend `packages/parity` with a test under a declared family. Exercise the public
  behavior through the parity suite's real data fixtures, and keep the family represented by a
  tested dashboard row. CI fails when a declared family has no test.

## Tests and verification

- Follow existing Vitest patterns and place unit tests beside the code they cover. Test observable
  behavior and add regression coverage for bugs when the task calls for tests. Do not gate CI on
  hard-coded totals of implemented features; report progress with GitHub Actions warning annotations
  in CI and `console.warn` locally, and keep assertions tied to behavior or required coverage.
- When package exports or published behavior change, check the built package from a consumer context.
  Workspace resolution alone does not verify the published package contract.
- Run the relevant checks for the change. The root scripts include `pnpm run build`,
  `pnpm run typecheck`, `pnpm run test`, and `pnpm run lint`; use package-scoped scripts when they
  cover the affected work.
- After changing repository files, run `pnpm run lint:custom` after your final edit. It runs the
  American filename, packet codec, JSDoc, and Unicode escape checks. `pnpm run lint` includes this
  aggregate.
- Review the diff and `git status --short` before finishing. Report the checks actually run and any failures or checks that could not be completed.
