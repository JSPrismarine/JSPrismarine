---
title: '@jsprismarine/predicates errors'
description: The code, message and meaning of every error @jsprismarine/predicates throws.
group: Documents
category: Errors
---

# @jsprismarine/predicates errors

These are the errors `@jsprismarine/predicates` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.predicates -->
## `PREDICATES_INVALID_MULBERRY32_RANDOM_STATE`

`Invalid mulberry32 random state`

Thrown as `PredicatesErrors.InvalidMulberry32RandomState`, which extends `TypeError`.

A saved random state is not a 32-bit integer, so the save or the replay that holds it is
damaged.

## `PREDICATES_SCRIPTEDRANDOM_NEEDS_AT_LEAST_ONE_VALUE`

`scriptedRandom needs at least one value`

Thrown as `PredicatesErrors.ScriptedrandomNeedsAtLeastOneValue`, which extends `Error`.

A test made a scripted random source with no values to replay.
<!-- /fact -->
