import * as colors from './Colors';

/**
 * Parses a string with color codes.
 * @param {string} input - String to parse.
 * @param {string} [prefix='§'] - The prefix to use for color codes.
 * @param {boolean} [clearAtEnd=false] - Whether to clear the color at the end of the string.
 * @returns {string} The parsed string.
 * @example
 * ```typescript
 * const res = Parser('§cHello §eworld§r!');
 * console.log(res); // 'Hello world!'
 * ```
 */
const Parser = (input: string, prefix = '§', clearAtEnd = true) =>
    `${input.replaceAll(new RegExp(`\\${prefix}[\\dabcdefklmnor]`, 'gm'), (v) => {
        return colors.toConsole[v.slice(1)] as string;
    })}${(clearAtEnd && colors.toConsole.r) || ''}`;

export default Parser;
