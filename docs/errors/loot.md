---
title: '@jsprismarine/loot errors'
description: The code, message and meaning of every error @jsprismarine/loot throws.
group: Documents
category: Errors
---

# @jsprismarine/loot errors

These are the errors `@jsprismarine/loot` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.loot -->
## `LOOT_DUPLICATE_LOOT_SEQUENCE_STATE`

`Duplicate loot sequence state: {entry}`

Thrown as `LootErrors.DuplicateLootSequenceState`, which extends `TypeError`.

A saved loot random state lists the same sequence twice, so the save or the replay that holds
it is damaged.

## `LOOT_INVALID_ALL_ZERO_LOOT_RANDOM_STATE`

`Invalid all-zero loot random state`

Thrown as `LootErrors.InvalidAllZeroLootRandomState`, which extends `TypeError`.

A saved loot random state is all zeros, which the generator can never reach, so the save is
damaged.

## `LOOT_INVALID_LOOT_RANDOM_STATE`

`Invalid loot random state`

Thrown as `LootErrors.InvalidLootRandomState`, which extends `TypeError`.

A saved loot random state does not have the shape the loot random source writes, so the save
is damaged.

## `LOOT_INVALID_LOOT_SEQUENCE_STATE`

`Invalid loot sequence state`

Thrown as `LootErrors.InvalidLootSequenceState`, which extends `TypeError`.

A saved loot sequence state does not have the shape the loot random source writes, so the
save is damaged.

## `LOOT_INVALID_NAMED_LOOT_SEQUENCE_STATE`

`Invalid named loot sequence state`

Thrown as `LootErrors.InvalidNamedLootSequenceState`, which extends `TypeError`.

A saved loot sequence entry does not have the shape the loot random source writes, so the
save is damaged.

## `LOOT_LOOT_TABLE_GRAMMAR_ERRORS`

`the loot table reported {count} grammar error(s): {listed}`

Thrown as `LootErrors.LootTableGrammarErrors`, which extends `Error`.

A strict loot table parse found errors. The error's `diagnostics` list every one.
<!-- /fact -->
