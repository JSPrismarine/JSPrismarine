---
title: '@jsprismarine/molang errors'
description: The code, message and meaning of every error @jsprismarine/molang throws.
group: Documents
category: Errors
---

# @jsprismarine/molang errors

These are the errors `@jsprismarine/molang` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.molang -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class               | What its errors mean                                       |
| ------------------- | ---------------------------------------------------------- |
| `MolangSyntaxError` | Raised when the source text cannot be tokenized or parsed. |

## `MOLANG_EMPTY_EXPRESSION_AT_OFFSET`

`empty expression at offset {offset}`

Thrown as `MolangErrors.EmptyExpressionAtOffset`, which extends `MolangSyntaxError`.

A Molang expression, or one statement of it, is empty. The pack that defines it needs fixing.

## `MOLANG_EXPECTED_AT_OFFSET`

`expected {expected} at offset {offset}`

Thrown as `MolangErrors.ExpectedAtOffset`, which extends `MolangSyntaxError`.

A Molang expression ended where it needed another token, such as a closing parenthesis.

## `MOLANG_EXPECTED_FOUND_AT_OFFSET`

`expected {expected}, found {found} at offset {offset}`

Thrown as `MolangErrors.ExpectedFoundAtOffset`, which extends `MolangSyntaxError`.

A Molang expression has a different token where it needed another one, such as a closing
parenthesis.

## `MOLANG_EXPECTED_IDENTIFIER_AT_OFFSET`

`expected an identifier at offset {offset}`

Thrown as `MolangErrors.ExpectedIdentifierAtOffset`, which extends `MolangSyntaxError`.

A Molang expression has something other than a name after a scope such as `query.`.

## `MOLANG_ONLY_VARIABLE_AND_TEMP_CAN_BE_ASSIGNED`

`only variable.* and temp.* can be assigned at offset {offset}`

Thrown as `MolangErrors.OnlyVariableAndTempCanBeAssigned`, which extends `MolangSyntaxError`.

A Molang expression assigns to a read-only value, such as a query. Only `variable.*` and
`temp.*` can be assigned.

## `MOLANG_UNEXPECTED_CHARACTER_AT_OFFSET`

`unexpected character {char} at offset {offset}`

Thrown as `MolangErrors.UnexpectedCharacterAtOffset`, which extends `MolangSyntaxError`.

A Molang expression contains a character the language does not use.

## `MOLANG_UNEXPECTED_END_OF_EXPRESSION_AT_OFFSET`

`unexpected end of expression at offset {offset}`

Thrown as `MolangErrors.UnexpectedEndOfExpressionAtOffset`, which extends `MolangSyntaxError`.

A Molang expression stops in the middle, such as after an operator.

## `MOLANG_UNEXPECTED_KEYWORD_AT_OFFSET`

`unexpected keyword {value} at offset {offset}`

Thrown as `MolangErrors.UnexpectedKeywordAtOffset`, which extends `MolangSyntaxError`.

A Molang keyword such as `return` or `loop` sits where it cannot be used.

## `MOLANG_UNEXPECTED_TOKEN_AT_OFFSET`

`unexpected token {value} at offset {offset}`

Thrown as `MolangErrors.UnexpectedTokenAtOffset`, which extends `MolangSyntaxError`.

A Molang expression has a token where none fits, such as two values with no operator between
them.

## `MOLANG_UNKNOWN_SCOPE_AT_OFFSET`

`unknown scope {head} at offset {offset}`

Thrown as `MolangErrors.UnknownScopeAtOffset`, which extends `MolangSyntaxError`.

A Molang name starts with a scope that does not exist. The scopes are `query`, `variable`,
`temp`, `context` and `math`, and their short forms `q`, `v`, `t` and `c`.

## `MOLANG_UNTERMINATED_STRING_AT_OFFSET`

`unterminated string at offset {offset}`

Thrown as `MolangErrors.UnterminatedStringAtOffset`, which extends `MolangSyntaxError`.

A Molang string opens a quote it never closes.
<!-- /fact -->
