---
title: '@jsprismarine/brigadier errors'
description: The code, message and meaning of every error @jsprismarine/brigadier throws.
group: Documents
category: Errors
---

# @jsprismarine/brigadier errors

These are the errors `@jsprismarine/brigadier` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.brigadier -->
## `BRIGADIER_CANNOT_ADD_CHILDREN_TO_REDIRECTED_NODE`

`Cannot add children to a redirected node`

Thrown as `BrigadierErrors.CannotAddChildrenToRedirectedNode`, which extends `Error`.

A command builder that redirects to another node was given children, which a redirect never
reaches. Build the children on the target node.

## `BRIGADIER_CANNOT_CONVERT_ROOT_INTO_BUILDER`

`Cannot convert root into a builder`

Thrown as `BrigadierErrors.CannotConvertRootIntoBuilder`, which extends `Error`.

Code asked the root node for a builder; only literal and argument nodes have one.

## `BRIGADIER_CANNOT_FIND_NODE_BEFORE_CURSOR`

`Can't find node before cursor`

Thrown as `BrigadierErrors.CannotFindNodeBeforeCursor`, which extends `Error`.

Command suggestions were asked for at a position before the first parsed node. This is a bug
in the caller of Brigadier.

## `BRIGADIER_CANNOT_FORWARD_NODE_WITH_CHILDREN`

`Cannot forward a node with children`

Thrown as `BrigadierErrors.CannotForwardNodeWithChildren`, which extends `Error`.

A command builder that already has children was made to forward to another node. A node
either runs its children or forwards, not both.

## `BRIGADIER_COMMAND_SYNTAX`

`{message}`

Thrown as `BrigadierErrors.CommandSyntax`, which extends `Error`.

A command did not parse. The message is Brigadier's own, such as `Expected integer`, followed by where in the input it stopped, and is shown to whoever ran the command.

## `BRIGADIER_ROOT_NODE_AS_CHILD`

`Cannot add a RootCommandNode as a child to any other CommandNode`

Thrown as `BrigadierErrors.RootNodeAsChild`, which extends `Error`.

A root node was added as another node's child. A command tree has one root.

## `BRIGADIER_UNKNOWN_ARGUMENT`

`No such argument '{name}' exists on this command`

Thrown as `BrigadierErrors.UnknownArgument`, which extends `Error`.

A command body read an argument by a name its command does not declare. The name in the body
and the name in the command's definition differ.
<!-- /fact -->
