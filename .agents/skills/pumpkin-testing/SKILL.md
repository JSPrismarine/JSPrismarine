---
name: pumpkin-testing
description: Select and run affected Pumpkin unit and real-server tests, add behavioral regression coverage, and diagnose QuickJS or WASI failures using the repo harness. Use for validation and test work in this monorepo.
---

# Test Pumpkin changes

Read [Testing](../../../docs/testing.md). Inspect the package's scripts and Vitest config before
choosing a suite. Plugins have `unit` and `integration` projects; integration tests build first.

## Choose the scope

`node .agents/hooks/check.mjs --plan` shows fast checks without executing them.
`node .agents/hooks/check.mjs` checks all dirty files without modifying them. Pass explicit repo file
paths when unrelated work needs to be excluded; deleted files are valid arguments.
It checks workspace dependents, but never runs integration tests.

For changed guest code or a bundled shared library, run affected real-server suites:

```sh
pnpm turbo run test:integration --filter=...@pumpkin-plugins/<folder> --output-logs=errors-only
```

Include consumers that are connected at runtime rather than by workspace imports. In particular,
UPnPumpkin changes need Bedrock Addon Manager's forwarding tests too, even though it communicates
through IPC and doesn't import the UPnPumpkin package. Build/harness or pinned API changes can affect
all server suites. Hook/script/docs-only changes don't need real-server tests.

## Add meaningful coverage

Follow the [testing policy](../../../AGENTS.md#testing-policy): show that a feature works with a
real-server or CLI test, and write unit tests first for logic you can run in isolation. For those unit
tests, use the interfaces and fakes exported by `@pumpkin-plugins/plugin-kit/testing` for pure logic
and adapters' callers. Put unit tests beside code and `*.itest.ts` in the package's `test/` directory.
A regression test should fail without the fix; cover observable failure handling, not implementation
spelling or guarantees TypeScript already makes. Generate binary fixtures in code.

Use `startPumpkin` and `builtPluginPath` from the harness for guest behavior; stop each server in
cleanup. Wait for a specific log or observable result rather than sleeping. Startup success alone
doesn't prove command, config, IPC or network behavior.

## Diagnose failures

The harness uses `PUMPKIN_BIN` or downloads the checksum-verified pinned release. Ensure the API and
server pins agree before attributing load errors to plugin logic. For logs and server files, use
`PUMPKIN_TEST_LOG_DIR` and `PUMPKIN_KEEP_DIR=1`; report retained paths when they help investigation.
Read the test output and the full server log, not only Turbo's summary. Read
[pumpkin-plugin-api](../pumpkin-plugin-api/SKILL.md) for host signature, permission or QuickJS failures.

Don't fix an unrelated dirty file just to make checks pass. Report the exact failing command and the
limitation when the server cannot run or a failure is outside the requested change.
