---
title: '@jsprismarine/lighting errors'
description: The code, message and meaning of every error @jsprismarine/lighting throws.
group: Documents
category: Errors
---

# @jsprismarine/lighting errors

These are the errors `@jsprismarine/lighting` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.lighting -->
## `LIGHTING_INVALID_FLUSH_BUDGET`

`Light flush budget {budget} is not a count of nodes`

Thrown as `LightingErrors.InvalidFlushBudget`, which extends `RangeError`.

The light engine was given a budget that is not a whole, non-negative number of nodes.

## `LIGHTING_INVALID_LIGHT_LEVEL`

`Light level {level} is not an integer between 0 and {maxLightLevel}`

Thrown as `LightingErrors.InvalidLightLevel`, which extends `RangeError`.

Code tried to store a light level that is not a whole number from 0 to the highest level.

## `LIGHTING_INVALID_SETTLE_BUDGET`

`Light settle budget {budget} is not a count of nodes`

Thrown as `LightingErrors.InvalidSettleBudget`, which extends `RangeError`.

The light engine was given a budget that is not a whole, non-negative number of nodes.

## `LIGHTING_LIGHT_OUTSIDE_SECTION`

`Light coordinates ({x}, {z}, {y}) fall outside the section`

Thrown as `LightingErrors.LightOutsideSection`, which extends `RangeError`.

Code read or wrote light at a position outside the 16-block section. This is a bug in the
caller.
<!-- /fact -->
