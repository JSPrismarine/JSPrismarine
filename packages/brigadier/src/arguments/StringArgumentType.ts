import StringReader from '../StringReader';
import type CommandContext from '../context/CommandContext';
import type ArgumentType from './ArgumentType';

export enum StringType {
    SINGLE_WORD = 'words_with_underscores',
    QUOTABLE_PHRASE = '"quoted phrase"',
    GREEDY_PHRASE = 'words with spaces'
}

export default class StringArgumentType implements ArgumentType<string> {
    private type: StringType;

    private constructor(type: StringType) {
        this.type = type;
    }

    public static word(): StringArgumentType {
        return new StringArgumentType(StringType.SINGLE_WORD);
    }

    public static string(): StringArgumentType {
        return new StringArgumentType(StringType.QUOTABLE_PHRASE);
    }

    public static greedyString(): StringArgumentType {
        return new StringArgumentType(StringType.GREEDY_PHRASE);
    }

    public static getString(context: CommandContext<any>, name: string): string {
        return context.getArgument(name, String);
    }

    public getType(): StringType {
        return this.type;
    }

    public parse(reader: StringReader): string {
        if (this.type == StringType.GREEDY_PHRASE) {
            let text = reader.getRemaining();
            reader.setCursor(reader.getTotalLength());
            return text;
        } else if (this.type == StringType.SINGLE_WORD) {
            return reader.readUnquotedString();
        } else {
            return reader.readString();
        }
    }

    public toString(): string {
        return 'string()';
    }

    public static escapeIfRequired(input: string): String {
        for (let c of input) {
            if (!StringReader.isAllowedInUnquotedString(c)) {
                return StringArgumentType.escape(input);
            }
        }

        return input;
    }

    private static escape(input: string): string {
        let result = '"';
        for (let i = 0; i < input.length; i++) {
            const c = input.charAt(i);
            if (c == '\\' || c == '"') {
                result += '\\';
            }
            result += c;
        }

        result += '"';
        return result;
    }
}
