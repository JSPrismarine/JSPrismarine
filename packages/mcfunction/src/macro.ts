/**
 * Macro lines and their `$(variable)` substitutions, as 1.20.2 defined them.
 * A macro line is compiled once into a template of literal text and variable
 * holes; a call fills the holes from a compound of arguments and the resulting
 * command is parsed fresh, which is the cost a macro adds over a plain line.
 */

/** The compound a macro call substitutes from. Extra entries are ignored. */
export type MacroArguments = Readonly<Record<string, unknown>>;

/** One piece of a compiled macro line: literal text, or a hole naming a variable. */
export type MacroSegment = { text: string } | { variable: string };

/** A macro line compiled into the pieces a call concatenates. */
export interface MacroTemplate {
    segments: readonly MacroSegment[];
    /** Every variable the line substitutes, once each, in first-use order. */
    variables: readonly string[];
}

/** The outcome of compiling a macro line. */
export type MacroTemplateResult = { ok: true; template: MacroTemplate } | { ok: false; message: string };

/** The outcome of filling a template from an argument compound. */
export type MacroSubstitutionResult = { ok: true; command: string } | { ok: false; message: string };

const VARIABLE_PATTERN = /^[A-Za-z0-9_]+$/;

/**
 * The most fraction digits a non-integer macro argument prints. Java formats
 * the value with a `DecimalFormat` under `Locale.ROOT`; Mojang does not state
 * the digit count, so this is a choice that keeps every double exactly
 * representable in decimal form rather than a confirmed vanilla number.
 */
const MAX_FRACTION_DIGITS = 17;

/**
 * Compiles one macro line into a reusable template.
 *
 * `$` is literal unless it is followed by `(`, which is the only escape the
 * format has. A line marked as a macro but carrying no substitution is an
 * error, as is an unterminated `$(` or a name outside letters, digits and `_`.
 */
export const compileMacroLine = (command: string): MacroTemplateResult => {
    const segments: MacroSegment[] = [];
    const variables: string[] = [];
    let literal = '';

    for (let index = 0; index < command.length; index += 1) {
        if (command[index] !== '$' || command[index + 1] !== '(') {
            literal += command[index];
            continue;
        }

        const close = command.indexOf(')', index + 2);
        if (close === -1) return { ok: false, message: 'unterminated macro variable' };

        const variable = command.slice(index + 2, close);
        if (!VARIABLE_PATTERN.test(variable)) {
            return { ok: false, message: `invalid macro variable name '${variable}'` };
        }

        if (literal.length > 0) {
            segments.push({ text: literal });
            literal = '';
        }
        segments.push({ variable });
        if (!variables.includes(variable)) variables.push(variable);
        index = close;
    }

    if (variables.length === 0) return { ok: false, message: 'no variables in macro' };
    if (literal.length > 0) segments.push({ text: literal });

    return { ok: true, template: { segments, variables } };
};

/**
 * Fills a compiled macro line from an argument compound.
 *
 * @returns The command to parse, or the reason the call cannot be instantiated.
 */
export const substituteMacro = (template: MacroTemplate, args: MacroArguments): MacroSubstitutionResult => {
    let command = '';

    for (const segment of template.segments) {
        if ('text' in segment) {
            command += segment.text;
            continue;
        }

        const value = args[segment.variable];
        if (value === undefined || value === null) {
            return { ok: false, message: `the macro arguments have no entry for '${segment.variable}'` };
        }
        command += renderMacroValue(value);
    }

    return { ok: true, command };
};

/**
 * Renders one argument the way a substitution inserts it: a string goes in
 * raw, with no quoting and no escaping, so a value carrying quotes can produce
 * a command that no longer parses. Numbers lose the type suffix they would
 * carry in NBT, matching the 1.20.2 fix. A compound or list becomes SNBT,
 * where suffixes are back because the text is NBT again.
 */
export const renderMacroValue = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return renderNumber(value);
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'boolean') return value ? '1' : '0';
    return renderSnbt(value);
};

/** Prints a number in plain decimal, never in exponent form and never with a suffix. */
const renderNumber = (value: number): string => {
    if (!Number.isFinite(value)) return String(value);
    if (Number.isInteger(value) && Math.abs(value) < Number.MAX_SAFE_INTEGER) return value.toFixed(0);

    const fixed = value.toFixed(MAX_FRACTION_DIGITS);
    return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
};

/** Renders a nested value as SNBT, the text form a command argument expects. */
const renderSnbt = (value: unknown): string => {
    if (value === null || value === undefined) return '{}';
    if (typeof value === 'string') return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
    if (typeof value === 'number') return renderNumber(value);
    if (typeof value === 'bigint') return `${value}L`;
    if (typeof value === 'boolean') return value ? '1b' : '0b';
    if (Array.isArray(value)) return `[${value.map(renderSnbt).join(',')}]`;
    if (typeof value === 'object') {
        const entries = Object.entries(value).map(([key, entry]) => `${key}:${renderSnbt(entry)}`);
        return `{${entries.join(',')}}`;
    }
    return String(value);
};
