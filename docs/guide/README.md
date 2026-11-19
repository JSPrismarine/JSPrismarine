---
title: Guides
description: Where to start, whether you play on, host, extend or work on a JSPrismarine server.
aside: false
pageClass: is-wide
lastUpdated: false
# The cards are the way on; a lone Next link under them would only repeat the first.
next: false
---

# Guides

Start from what you are here to do.

## Play

- [The demo server](joining.md#try-the-demo-server): a JSPrismarine server anyone can join, at
  <!-- fact:demo.address -->`demo.jsprismarine.dev`<!-- /fact -->.
- [Joining a server](joining.md): add a server in Minecraft, which versions connect, and what to try
  when you cannot.
- [Command reference](commands.md): every command, what it does and the permission it needs.
- [Commands and functions](../data-driven/commands.md): how commands work, and running `.mcfunction`
  files from a datapack.

## Host a server

- [Running JSPrismarine](running.md#run-the-prebuilt-server): download the prebuilt server, start
  it, and update it.
- [Every setting](running.md#every-setting): what each key in `config.json` does.
- [Worlds](running.md#worlds) and [world seeds](running.md#world-seeds): presets, dimensions and
  seeds.
- [Java versions](java-versions.md): which Java release the server's data comes from, and how to
  run another.
- [Log levels](log-levels.md): what each level prints and how to choose one.
- [Error reference](../errors/README.md): what an error in the log means, by its code.
- [Usage statistics](usage-statistics.md): what the server reports to bStats, and how to turn it
  off.

## Build add-ons and plugins

- [Extending JSPrismarine](extending.md): packs for content, and embedding the server for code.
- [Using packs](../data-driven/using-packs.md): which pack formats load and how a stack composes.
- [Run from source](running.md#run-from-source): `pnpm run dev`, which restarts the server when your
  pack or code changes.

## Work on JSPrismarine

- [Contributing](../../CONTRIBUTING.md): how to set up, test and send a change.
- [Package versioning](versioning.md): which Changeset level a change needs.
- [The data-driven engine](../data-driven/README.md): how vanilla behavior comes from data.
