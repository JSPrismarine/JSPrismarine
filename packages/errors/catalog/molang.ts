import { JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';
import { defineErrors } from './defineErrors';

/** Raised when the source text cannot be tokenized or parsed. */
export abstract class MolangSyntaxError extends JSPrismarineError {
    public override name = 'MolangSyntaxError';

    /** Offset in the source text where the error was found. */
    public get offset(): number {
        return Number(this.params.offset);
    }
}

/** The errors `@jsprismarine/molang` throws. */
export const MolangErrors = defineErrors('molang', {
    /**
     * A Molang expression, or one statement of it, is empty. The pack that defines it needs fixing.
     */
    EmptyExpressionAtOffset: { message: 'empty expression at offset {offset}', base: MolangSyntaxError },
    /** A Molang expression ended where it needed another token, such as a closing parenthesis. */
    ExpectedAtOffset: { message: 'expected {expected} at offset {offset}', base: MolangSyntaxError },
    /**
     * A Molang expression has a different token where it needed another one, such as a closing
     * parenthesis.
     */
    ExpectedFoundAtOffset: {
        message: 'expected {expected}, found {found} at offset {offset}',
        base: MolangSyntaxError
    },
    /** A Molang expression has something other than a name after a scope such as `query.`. */
    ExpectedIdentifierAtOffset: { message: 'expected an identifier at offset {offset}', base: MolangSyntaxError },
    /**
     * A Molang expression assigns to a read-only value, such as a query. Only `variable.*` and
     * `temp.*` can be assigned.
     */
    OnlyVariableAndTempCanBeAssigned: {
        message: 'only variable.* and temp.* can be assigned at offset {offset}',
        base: MolangSyntaxError
    },
    /** A Molang expression contains a character the language does not use. */
    UnexpectedCharacterAtOffset: { message: 'unexpected character {char} at offset {offset}', base: MolangSyntaxError },
    /** A Molang expression stops in the middle, such as after an operator. */
    UnexpectedEndOfExpressionAtOffset: {
        message: 'unexpected end of expression at offset {offset}',
        base: MolangSyntaxError
    },
    /** A Molang keyword such as `return` or `loop` sits where it cannot be used. */
    UnexpectedKeywordAtOffset: { message: 'unexpected keyword {value} at offset {offset}', base: MolangSyntaxError },
    /**
     * A Molang expression has a token where none fits, such as two values with no operator between
     * them.
     */
    UnexpectedTokenAtOffset: { message: 'unexpected token {value} at offset {offset}', base: MolangSyntaxError },
    /**
     * A Molang name starts with a scope that does not exist. The scopes are `query`, `variable`,
     * `temp`, `context` and `math`, and their short forms `q`, `v`, `t` and `c`.
     */
    UnknownScopeAtOffset: { message: 'unknown scope {head} at offset {offset}', base: MolangSyntaxError },
    /** A Molang string opens a quote it never closes. */
    UnterminatedStringAtOffset: { message: 'unterminated string at offset {offset}', base: MolangSyntaxError }
});
