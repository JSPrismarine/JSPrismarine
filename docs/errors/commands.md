---
title: '@jsprismarine/commands errors'
description: The code, message and meaning of every error @jsprismarine/commands throws.
group: Documents
category: Errors
---

# @jsprismarine/commands errors

These are the errors `@jsprismarine/commands` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.commands -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class                 | What its errors mean                                                   |
| --------------------- | ---------------------------------------------------------------------- |
| `SelectorSyntaxError` | Thrown when a selector string does not parse in the requested dialect. |

## `COMMANDS_BEDROCK_ONLY_BASE_SELECTOR`

`'@initiator' is a Bedrock base selector at position {position}`

Thrown as `CommandsErrors.BedrockOnlyBaseSelector`, which extends `SelectorSyntaxError`.

`@initiator` exists only in Bedrock Edition, and the command is read as Java Edition. Write
it in a Bedrock command, or use `@p` or `@s`.

## `COMMANDS_COMMAND_ALIAS_IS_ALREADY_REGISTERED`

`The command alias '{alias}' is already registered`

Thrown as `CommandsErrors.CommandAliasIsAlreadyRegistered`, which extends `Error`.

Two commands claim the same alias. Rename one, or leave the alias off one of them.

## `COMMANDS_COMMAND_IS_ALREADY_REGISTERED`

`The command '{name}' is already registered`

Thrown as `CommandsErrors.CommandIsAlreadyRegistered`, which extends `Error`.

Two commands were registered under the same name.

## `COMMANDS_DISTANCE_CANNOT_BE_NEGATIVE_AT_POSITION`

`distance cannot be negative at position {position}`

Thrown as `CommandsErrors.DistanceCannotBeNegativeAtPosition`, which extends `SelectorSyntaxError`.

A selector's distance range has a negative bound.

## `COMMANDS_EMPTY_HASITEM_LIST_AT_POSITION`

`Empty hasitem list at position {position}`

Thrown as `CommandsErrors.EmptyHasitemListAtPosition`, which extends `SelectorSyntaxError`.

A selector's `hasitem` argument is an empty list.

## `COMMANDS_EXPECTED_AT_POSITION`

`Expected '{character}' at position {position}`

Thrown as `CommandsErrors.ExpectedAtPosition`, which extends `SelectorSyntaxError`.

A selector is missing a character it needs at this position, such as a closing bracket.

## `COMMANDS_EXPECTED_SELECTOR_ARGUMENT_NAME_AT_POSITION`

`Expected a selector argument name at position {position}`

Thrown as `CommandsErrors.ExpectedSelectorArgumentNameAtPosition`, which extends `SelectorSyntaxError`.

A selector's argument list has an entry with no name before its `=`.

## `COMMANDS_EXPECTED_SELECTOR_AT_POSITION`

`Expected a selector at position {position}`

Thrown as `CommandsErrors.ExpectedSelectorAtPosition`, which extends `SelectorSyntaxError`.

A command expected a target selector or a player name here and found neither.

## `COMMANDS_HASITEM_NEEDS_ITEM_AT_POSITION`

`hasitem needs an item at position {position}`

Thrown as `CommandsErrors.HasitemNeedsItemAtPosition`, which extends `SelectorSyntaxError`.

A `hasitem` entry names no item.

## `COMMANDS_JAVA_COMMAND_NODE_HAS_NO_ARGUMENT_PARSER`

`Java command node '{name}' has no argument parser.`

Thrown as `CommandsErrors.JavaCommandNodeHasNoArgumentParser`, which extends `Error`.

The Java command tree data names an argument with no parser. The generated command data is
stale; regenerate it.

## `COMMANDS_JAVA_COMMAND_REDIRECT_IS_NOT_REGISTERED`

`Java command redirect '{path}' is not registered.`

Thrown as `CommandsErrors.JavaCommandRedirectIsNotRegistered`, which extends `Error`.

The Java command tree data redirects to a command that is not registered. The generated
command data is stale; regenerate it.

## `COMMANDS_LEVEL_CANNOT_BE_NEGATIVE_AT_POSITION`

`level cannot be negative at position {position}`

Thrown as `CommandsErrors.LevelCannotBeNegativeAtPosition`, which extends `SelectorSyntaxError`.

A selector's experience level range has a negative bound.

## `COMMANDS_NOT_INTEGER`

`'{text}' is not an integer at position {position}`

Thrown as `CommandsErrors.NotInteger`, which extends `SelectorSyntaxError`.

A selector argument that takes a whole number got something else.

## `COMMANDS_NOT_KEY_VALUE_PAIR`

`'{text}' is not a key=value pair at position {position}`

Thrown as `CommandsErrors.NotKeyValuePair`, which extends `SelectorSyntaxError`.

A selector argument is not written as `name=value`.

## `COMMANDS_NOT_NUMBER`

`'{text}' is not a number at position {position}`

Thrown as `CommandsErrors.NotNumber`, which extends `SelectorSyntaxError`.

A selector argument that takes a number got something else.

## `COMMANDS_RANGE_NEEDS_AT_LEAST_ONE_BOUND`

`A range needs at least one bound at position {position}`

Thrown as `CommandsErrors.RangeNeedsAtLeastOneBound`, which extends `SelectorSyntaxError`.

A range such as `1..5` was written as `..` with neither end.

## `COMMANDS_SELECTOR_COUNT_IS_ZERO`

`c cannot be 0 at position {position}`

Thrown as `CommandsErrors.SelectorCountIsZero`, which extends `SelectorSyntaxError`.

A Bedrock selector's `c` argument is 0, which would select no one. Use a positive count for
the nearest, or a negative one for the furthest.

## `COMMANDS_SELECTOR_LIMIT_BELOW_ONE`

`limit must be at least 1 at position {position}`

Thrown as `CommandsErrors.SelectorLimitBelowOne`, which extends `SelectorSyntaxError`.

A selector's `limit` is below 1, which would select no one.

## `COMMANDS_UNKNOWN_BASE_SELECTOR_AT_POSITION`

`Unknown base selector '{input}' at position {position}`

Thrown as `CommandsErrors.UnknownBaseSelectorAtPosition`, which extends `SelectorSyntaxError`.

A selector starts with an `@` variable that does not exist in this edition, such as `@q`.

## `COMMANDS_UNKNOWN_GAMEMODE_AT_POSITION`

`Unknown gamemode '{value}' at position {position}`

Thrown as `CommandsErrors.UnknownGamemodeAtPosition`, which extends `SelectorSyntaxError`.

A selector's `m` or `gamemode` names a game mode that does not exist.

## `COMMANDS_UNKNOWN_HASITEM_FIELD_AT_POSITION`

`Unknown hasitem field '{key}' at position {position}`

Thrown as `CommandsErrors.UnknownHasitemFieldAtPosition`, which extends `SelectorSyntaxError`.

A `hasitem` entry has a field Bedrock does not define. The known fields are `item`, `data`,
`quantity`, `location` and `slot`.

## `COMMANDS_UNKNOWN_SELECTOR_ARGUMENT_AT_POSITION`

`Unknown selector argument '{key}' at position {position}`

Thrown as `CommandsErrors.UnknownSelectorArgumentAtPosition`, which extends `SelectorSyntaxError`.

A selector has an argument this edition does not define. The argument may exist only in the
other edition.

## `COMMANDS_UNKNOWN_SORT_AT_POSITION`

`Unknown sort '{value}' at position {position}`

Thrown as `CommandsErrors.UnknownSortAtPosition`, which extends `SelectorSyntaxError`.

A selector's `sort` is not `nearest`, `furthest`, `random` or `arbitrary`.

## `COMMANDS_UNTERMINATED_AT_POSITION`

`Unterminated '{open}' at position {position}`

Thrown as `CommandsErrors.UnterminatedAtPosition`, which extends `SelectorSyntaxError`.

A bracket or brace in a selector is never closed.

## `COMMANDS_UNTERMINATED_ESCAPE_AT_POSITION`

`Unterminated escape at position {position}`

Thrown as `CommandsErrors.UnterminatedEscapeAtPosition`, which extends `SelectorSyntaxError`.

A selector ends right after a backslash.

## `COMMANDS_UNTERMINATED_QUOTED_STRING_AT_POSITION`

`Unterminated quoted string at position {position}`

Thrown as `CommandsErrors.UnterminatedQuotedStringAtPosition`, which extends `SelectorSyntaxError`.

A quoted string in a selector is never closed.
<!-- /fact -->
