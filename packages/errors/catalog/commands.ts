import { JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';
import { defineErrors } from './defineErrors';

/** Thrown when a selector string does not parse in the requested dialect. */
export abstract class SelectorSyntaxError extends JSPrismarineError {
    public override name = 'SelectorSyntaxError';

    /** The zero-based offset in the input where parsing stopped. */
    public get position(): number {
        return Number(this.params.position);
    }
}

/** The errors `@jsprismarine/commands` throws. */
export const CommandsErrors = defineErrors('commands', {
    /**
     * A Bedrock selector's `c` argument is 0, which would select no one. Use a positive count for
     * the nearest, or a negative one for the furthest.
     */
    SelectorCountIsZero: { message: 'c cannot be 0 at position {position}', base: SelectorSyntaxError },
    /** Two commands claim the same alias. Rename one, or leave the alias off one of them. */
    CommandAliasIsAlreadyRegistered: "The command alias '{alias}' is already registered",
    /** Two commands were registered under the same name. */
    CommandIsAlreadyRegistered: "The command '{name}' is already registered",
    /** A selector's distance range has a negative bound. */
    DistanceCannotBeNegativeAtPosition: {
        message: 'distance cannot be negative at position {position}',
        base: SelectorSyntaxError
    },
    /** A selector's `hasitem` argument is an empty list. */
    EmptyHasitemListAtPosition: { message: 'Empty hasitem list at position {position}', base: SelectorSyntaxError },
    /** A selector is missing a character it needs at this position, such as a closing bracket. */
    ExpectedAtPosition: { message: "Expected '{character}' at position {position}", base: SelectorSyntaxError },
    /** A selector's argument list has an entry with no name before its `=`. */
    ExpectedSelectorArgumentNameAtPosition: {
        message: 'Expected a selector argument name at position {position}',
        base: SelectorSyntaxError
    },
    /** A command expected a target selector or a player name here and found neither. */
    ExpectedSelectorAtPosition: { message: 'Expected a selector at position {position}', base: SelectorSyntaxError },
    /** A `hasitem` entry names no item. */
    HasitemNeedsItemAtPosition: { message: 'hasitem needs an item at position {position}', base: SelectorSyntaxError },
    /**
     * `@initiator` exists only in Bedrock Edition, and the command is read as Java Edition. Write
     * it in a Bedrock command, or use `@p` or `@s`.
     */
    BedrockOnlyBaseSelector: {
        message: "'@initiator' is a Bedrock base selector at position {position}",
        base: SelectorSyntaxError
    },
    /** A selector argument that takes a whole number got something else. */
    NotInteger: { message: "'{text}' is not an integer at position {position}", base: SelectorSyntaxError },
    /** A selector argument is not written as `name=value`. */
    NotKeyValuePair: {
        message: "'{text}' is not a key=value pair at position {position}",
        base: SelectorSyntaxError
    },
    /** A selector argument that takes a number got something else. */
    NotNumber: { message: "'{text}' is not a number at position {position}", base: SelectorSyntaxError },
    /**
     * The Java command tree data names an argument with no parser. The generated command data is
     * stale; regenerate it.
     */
    JavaCommandNodeHasNoArgumentParser: "Java command node '{name}' has no argument parser.",
    /**
     * The Java command tree data redirects to a command that is not registered. The generated
     * command data is stale; regenerate it.
     */
    JavaCommandRedirectIsNotRegistered: "Java command redirect '{path}' is not registered.",
    /** A selector's experience level range has a negative bound. */
    LevelCannotBeNegativeAtPosition: {
        message: 'level cannot be negative at position {position}',
        base: SelectorSyntaxError
    },
    /** A selector's `limit` is below 1, which would select no one. */
    SelectorLimitBelowOne: { message: 'limit must be at least 1 at position {position}', base: SelectorSyntaxError },
    /** A range such as `1..5` was written as `..` with neither end. */
    RangeNeedsAtLeastOneBound: {
        message: 'A range needs at least one bound at position {position}',
        base: SelectorSyntaxError
    },
    /** A selector starts with an `@` variable that does not exist in this edition, such as `@q`. */
    UnknownBaseSelectorAtPosition: {
        message: "Unknown base selector '{input}' at position {position}",
        base: SelectorSyntaxError
    },
    /** A selector's `m` or `gamemode` names a game mode that does not exist. */
    UnknownGamemodeAtPosition: {
        message: "Unknown gamemode '{value}' at position {position}",
        base: SelectorSyntaxError
    },
    /**
     * A `hasitem` entry has a field Bedrock does not define. The known fields are `item`, `data`,
     * `quantity`, `location` and `slot`.
     */
    UnknownHasitemFieldAtPosition: {
        message: "Unknown hasitem field '{key}' at position {position}",
        base: SelectorSyntaxError
    },
    /**
     * A selector has an argument this edition does not define. The argument may exist only in the
     * other edition.
     */
    UnknownSelectorArgumentAtPosition: {
        message: "Unknown selector argument '{key}' at position {position}",
        base: SelectorSyntaxError
    },
    /** A selector's `sort` is not `nearest`, `furthest`, `random` or `arbitrary`. */
    UnknownSortAtPosition: { message: "Unknown sort '{value}' at position {position}", base: SelectorSyntaxError },
    /** A bracket or brace in a selector is never closed. */
    UnterminatedAtPosition: { message: "Unterminated '{open}' at position {position}", base: SelectorSyntaxError },
    /** A selector ends right after a backslash. */
    UnterminatedEscapeAtPosition: { message: 'Unterminated escape at position {position}', base: SelectorSyntaxError },
    /** A quoted string in a selector is never closed. */
    UnterminatedQuotedStringAtPosition: {
        message: 'Unterminated quoted string at position {position}',
        base: SelectorSyntaxError
    }
});
