/**
 * ANSI open sequences, keyed by Minecraft color code.
 *
 * `k` (obfuscated) has no terminal equivalent and maps to an empty string.
 */
export const toConsole: Record<string, string> = {
    0: '\u001b[30m', // black
    1: '\u001b[34m', // blue
    2: '\u001b[32m', // green
    3: '\u001b[36m', // cyan
    4: '\u001b[31m', // red
    5: '\u001b[35m', // magenta
    6: '\u001b[33m', // yellow
    7: '\u001b[37m', // white
    8: '\u001b[90m', // bright black
    9: '\u001b[94m', // bright blue
    a: '\u001b[92m', // bright green
    b: '\u001b[96m', // bright cyan
    c: '\u001b[91m', // bright red
    d: '\u001b[95m', // bright magenta
    e: '\u001b[93m', // bright yellow
    f: '\u001b[97m', // bright white

    k: '',
    l: '\u001b[1m', // bold
    m: '\u001b[9m', // strikethrough
    n: '\u001b[4m', // underline
    o: '\u001b[3m', // italic

    r: '\u001b[0m' // reset
};
