import { CommandSyntaxException, StringReader } from '@jsprismarine/brigadier';
import { describe, expect, it } from 'vitest';

import { bedrockSyntaxError } from './syntaxError';

const at = (
    input: string,
    cursor: number,
    type = CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherUnknownArgument()
) => {
    const reader = new StringReader(input);
    reader.setCursor(cursor);
    return type.createWithContext(reader);
};

describe('bedrockSyntaxError', () => {
    it('names the word at the cursor with ten characters of the line on each side', () => {
        expect(bedrockSyntaxError(at('tp ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ x', 13))).toBe(
            'Syntax error: Unexpected "~": at "~ ~ ~ ~ ~ >>~<< ~ ~ ~ ~ ~"'
        );
    });

    it('names the whole word when an argument type left the cursor inside or after it', () => {
        const refused = CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherParseException();
        const reader = new StringReader('difficulty bogus');
        reader.setCursor('difficulty bogus'.length);

        expect(bedrockSyntaxError(refused.createWithContext(reader, 'bogus'))).toBe(
            'Syntax error: Unexpected "bogus": at "ifficulty >>bogus<<"'
        );
    });

    it('names nothing when the line ends before the command does', () => {
        expect(
            bedrockSyntaxError(at('time set', 8, CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherUnknownCommand()))
        ).toBe('Syntax error: Unexpected "": at "/time set>><<"');
    });

    it('shows the line with the leading text it was given', () => {
        expect(bedrockSyntaxError(at('time set nonsense', 9), '')).toBe(
            'Syntax error: Unexpected "nonsense": at "time set >>nonsense<<"'
        );
    });

    it('leaves an exception that does not point into a line to its own message', () => {
        expect(
            bedrockSyntaxError(
                CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherParseException().create('No targets')
            )
        ).toBeUndefined();
    });
});
