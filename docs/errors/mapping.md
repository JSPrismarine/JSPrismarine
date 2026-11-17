---
title: '@jsprismarine/mapping errors'
description: The code, message and meaning of every error @jsprismarine/mapping throws.
group: Documents
category: Errors
---

# @jsprismarine/mapping errors

These are the errors `@jsprismarine/mapping` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.mapping -->
## `MAPPING_UNMAPPED_BIOME`

`{identifier} has no Java source and no reviewed loss`

Thrown as `MappingErrors.UnmappedBiome`, which extends `Error`.

A Bedrock biome has neither a Java biome it maps from nor a reviewed entry saying why not.
The generated mapping tables are stale; regenerate them.
<!-- /fact -->
