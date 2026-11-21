---
title: '@jsprismarine/prismarine errors'
description: The code, message and meaning of every error @jsprismarine/prismarine throws.
group: Documents
category: Errors
---

# @jsprismarine/prismarine errors

`@jsprismarine/prismarine` throws many errors, so its catalog is split into modules, and each module's errors have a page of their own. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.prismarine -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class                       | What its errors mean                                                                                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AddonIntegrityError`       | Error thrown when an addon's download or folder is not what its lock or source says it is.                                                                                                                                                                                     |
| `LoggedFieldError`          | A logged value had a shape its field never holds.                                                                                                                                                                                                                              |
| `RegistryBundleFormatError` | Raised when a buffer handed to `readRegistryBundle` is not a bundle this build reads.                                                                                                                                                                                          |
| `ConfigSyntaxError`         | Raised when a config file cannot be read as JSON. Thrown rather than swallowed on purpose. Treating a file with a typo in it as empty and then writing the defaults back is how a server used to erase its own config; refusing to start keeps the file for the person to fix. |
| `ChangeLogError`            | A change log was used out of order, such as appending to a tick that is already sealed.                                                                                                                                                                                        |

## Modules

| Page                                   | Catalog                      |
| -------------------------------------- | ---------------------------- |
| [addon](prismarine/addon.md)           | `PrismarineAddonErrors`      |
| [command](prismarine/command.md)       | `PrismarineCommandErrors`    |
| [content](prismarine/content.md)       | `PrismarineContentErrors`    |
| [entity](prismarine/entity.md)         | `PrismarineEntityErrors`     |
| [generation](prismarine/generation.md) | `PrismarineGenerationErrors` |
| [input](prismarine/input.md)           | `PrismarineInputErrors`      |
| [network](prismarine/network.md)       | `PrismarineNetworkErrors`    |
| [server](prismarine/server.md)         | `PrismarineServerErrors`     |
| [stats](prismarine/stats.md)           | `PrismarineStatsErrors`      |
| [world](prismarine/world.md)           | `PrismarineWorldErrors`      |
<!-- /fact -->
