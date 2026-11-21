/**
 * Templates behind `placeholders.parse` and `placeholders.render` in `@jsprismarine/server`: a
 * tree in the shape of Bedrock's rawtext with a few more node kinds, the shorthand that parses
 * into one, and the renderer that turns one into text for a tick. It knows nothing of the
 * engine: the runtime gives it the placeholder values, the scores and the names.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { isRecord } from '../isRecord';

/** One node of a template. */
export type TemplateNode =
    | { readonly text: string }
    | { readonly placeholder: string }
    | { readonly if: string; readonly then: readonly TemplateNode[]; readonly else?: readonly TemplateNode[] }
    | { readonly animate: { readonly interval: number; readonly frames: readonly (readonly TemplateNode[])[] } }
    | { readonly gradient: { readonly colors: readonly string[]; readonly rawtext: readonly TemplateNode[] } }
    | { readonly translate: string; readonly with?: readonly string[] | Template }
    | { readonly score: { readonly name: string; readonly objective: string } }
    | { readonly selector: string };

/** A template: a rawtext tree. */
export interface Template {
    readonly rawtext: readonly TemplateNode[];
}

/** What a render gave. */
export interface RenderedTemplate {
    readonly text: string;
    /** The tick at which an animation in the template next changes the text, when it holds one. */
    readonly nextChangeTick?: number;
}

/** What a render reads from the world. */
export interface TemplateHost {
    /** The current tick, which the animations count. */
    readonly tick: number;
    /** The value of a placeholder, or undefined when nobody provides it. */
    placeholder(namespace: string, key: string): string | undefined;
    /** A score of a `score` node: the player's for `*` and `@s`, or the named participant's. */
    score?(name: string, objective: string): number | undefined;
    /** The names a `selector` node reads as. */
    selector?(selector: string): string | undefined;
}

/** A token, `{namespace:key}`, anywhere in a text. */
const TOKEN = /\{([a-z][a-z0-9_]*):([a-z][a-z0-9_]*)\}/g;

/** A placeholder node's name, `namespace:key`. */
const PLACEHOLDER = /^([a-z][a-z0-9_]*):([a-z][a-z0-9_]*)$/;

/**
 * Bedrock's `§` colors with their palette values, from the Bedrock table at
 * https://minecraft.wiki/w/Formatting_codes. A gradient colors each character with the nearest.
 * The console's theme keeps the sixteen it can show on a terminal; this is the client's whole
 * palette, so a gradient reaches the material colors too.
 */
export const BEDROCK_COLORS: readonly { readonly code: string; readonly hex: string }[] = [
    { code: '0', hex: '#000000' },
    { code: '1', hex: '#0000aa' },
    { code: '2', hex: '#00aa00' },
    { code: '3', hex: '#00aaaa' },
    { code: '4', hex: '#aa0000' },
    { code: '5', hex: '#aa00aa' },
    { code: '6', hex: '#ffaa00' },
    { code: '7', hex: '#aaaaaa' },
    { code: '8', hex: '#555555' },
    { code: '9', hex: '#5555ff' },
    { code: 'a', hex: '#55ff55' },
    { code: 'b', hex: '#55ffff' },
    { code: 'c', hex: '#ff5555' },
    { code: 'd', hex: '#ff55ff' },
    { code: 'e', hex: '#ffff55' },
    { code: 'f', hex: '#ffffff' },
    { code: 'g', hex: '#ddd605' },
    { code: 'h', hex: '#e3d4d1' },
    { code: 'i', hex: '#cecaca' },
    { code: 'j', hex: '#443a3b' },
    { code: 'm', hex: '#971607' },
    { code: 'n', hex: '#b4684d' },
    { code: 'p', hex: '#deb12d' },
    { code: 'q', hex: '#47a036' },
    { code: 's', hex: '#2cbaa8' },
    { code: 't', hex: '#21497b' },
    { code: 'u', hex: '#9a5cc6' },
    { code: 'v', hex: '#eb7114' }
];

/** The format codes after `§` besides the colors. */
const FORMAT_CODES = ['k', 'l', 'o', 'r'];

/** Every code `&` stands for in shorthand. */
const SHORTHAND_CODES = new Set([...BEDROCK_COLORS.map(({ code }) => code), ...FORMAT_CODES]);

/** A hex color, `#rrggbb`. */
const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

type Rgb = readonly [number, number, number];

const rgbOf = (hex: string): Rgb => {
    const match = HEX_COLOR.exec(hex);
    if (match === null)
        throw new ScriptHostErrors.TemplateInvalid({ where: 'gradient.colors', problem: `${hex} is not #rrggbb` });
    return [
        Number.parseInt(match[1] ?? '0', 16),
        Number.parseInt(match[2] ?? '0', 16),
        Number.parseInt(match[3] ?? '0', 16)
    ];
};

const PALETTE = BEDROCK_COLORS.map(({ code, hex }) => ({ code, rgb: rgbOf(hex) }));

/** The `§` code of the palette color nearest to a color. */
const nearestCode = ([red, green, blue]: Rgb): string => {
    let best = PALETTE[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const entry of PALETTE) {
        const [r, g, b] = entry.rgb;
        const distance = (r - red) ** 2 + (g - green) ** 2 + (b - blue) ** 2;
        if (distance < bestDistance) {
            best = entry;
            bestDistance = distance;
        }
    }
    return best?.code ?? 'f';
};

/** The color at `position`, from 0 to 1, along the stops. */
const colorAt = (stops: readonly Rgb[], position: number): Rgb => {
    const first = stops[0] ?? [255, 255, 255];
    if (stops.length === 1) return first;
    const scaled = Math.min(1, Math.max(0, position)) * (stops.length - 1);
    const index = Math.min(stops.length - 2, Math.floor(scaled));
    const from = stops[index] ?? first;
    const to = stops[index + 1] ?? first;
    const t = scaled - index;
    const mix = (channel: 0 | 1 | 2) => Math.round(from[channel] + (to[channel] - from[channel]) * t);
    return [mix(0), mix(1), mix(2)];
};

// Conditions.

type Comparison = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'contains' | 'startsWith';

type Operand =
    | { readonly kind: 'placeholder'; readonly namespace: string; readonly key: string }
    | { readonly kind: 'literal'; readonly text: string };

/** A parsed condition. */
export type Condition =
    | { readonly kind: 'compare'; readonly left: Operand; readonly operator: Comparison; readonly right: Operand }
    | { readonly kind: 'and' | 'or'; readonly left: Condition; readonly right: Condition };

type ConditionToken =
    | { readonly kind: 'open' | 'close' | 'and' | 'or' }
    | { readonly kind: 'operator'; readonly operator: Comparison }
    | { readonly kind: 'operand'; readonly operand: Operand };

const COMPARISONS: readonly Comparison[] = ['==', '!=', '<=', '>=', '<', '>'];
const WORD_COMPARISONS: readonly Comparison[] = ['contains', 'startsWith'];

/** Every comparison a condition may make, in the order the docs list them. */
export const CONDITION_OPERATORS: readonly string[] = ['==', '!=', '<', '<=', '>', '>=', ...WORD_COMPARISONS];
/** The words that join comparisons, the first binding tighter. */
export const CONDITION_JOINERS: readonly string[] = ['&&', '||'];

/** How long a condition may be, in characters, so a template cannot hold the parser. */
export const MAX_CONDITION_LENGTH = 1024;
/** How deep parentheses may nest in a condition, so the recursive parser stays within the stack. */
export const MAX_CONDITION_DEPTH = 32;
/** How deep nodes may nest in a template, so the recursive check stays within the stack. */
export const MAX_TEMPLATE_DEPTH = 64;

const conditionError = (condition: string, problem: string): TypeError =>
    new ScriptHostErrors.TemplateCondition({ condition, problem });

const tokenizeCondition = (condition: string): ConditionToken[] => {
    const tokens: ConditionToken[] = [];
    let index = 0;
    const rest = () => condition.slice(index);
    while (index < condition.length) {
        const char = condition[index] ?? '';
        if (char === ' ' || char === '\t') {
            index++;
        } else if (char === '(' || char === ')') {
            tokens.push({ kind: char === '(' ? 'open' : 'close' });
            index++;
        } else if (rest().startsWith('&&') || rest().startsWith('||')) {
            tokens.push({ kind: rest().startsWith('&&') ? 'and' : 'or' });
            index += 2;
        } else if (COMPARISONS.some((operator) => rest().startsWith(operator))) {
            const operator = COMPARISONS.find((each) => rest().startsWith(each)) ?? '==';
            tokens.push({ kind: 'operator', operator });
            index += operator.length;
        } else if (char === '{') {
            const match = /^\{([a-z][a-z0-9_]*):([a-z][a-z0-9_]*)\}/.exec(rest());
            if (match === null)
                throw conditionError(condition, `has a brace that opens no placeholder at ${JSON.stringify(rest())}`);
            tokens.push({
                kind: 'operand',
                operand: { kind: 'placeholder', namespace: match[1] ?? '', key: match[2] ?? '' }
            });
            index += match[0].length;
        } else if (char === '"' || char === "'") {
            const end = condition.indexOf(char, index + 1);
            if (end < 0) throw conditionError(condition, `has a quote that never closes at ${JSON.stringify(rest())}`);
            tokens.push({ kind: 'operand', operand: { kind: 'literal', text: condition.slice(index + 1, end) } });
            index = end + 1;
        } else {
            const match = /^[^\s(){}"'<>=!&|]+/.exec(rest());
            if (match === null) throw conditionError(condition, `has an unexpected ${JSON.stringify(char)}`);
            const word = match[0];
            const wordOperator = WORD_COMPARISONS.find((each) => each === word);
            tokens.push(
                wordOperator === undefined
                    ? { kind: 'operand', operand: { kind: 'literal', text: word } }
                    : { kind: 'operator', operator: wordOperator }
            );
            index += word.length;
        }
    }
    return tokens;
};

/**
 * Parses a condition: comparisons joined by `&&` and `||`, `&&` binding tighter, with parentheses.
 * @throws {TypeError} When the condition does not parse.
 */
export const parseCondition = (condition: string): Condition => {
    if (condition.length > MAX_CONDITION_LENGTH) {
        throw conditionError(condition, `is longer than ${MAX_CONDITION_LENGTH} characters`);
    }
    const tokens = tokenizeCondition(condition);
    let position = 0;
    let depth = 0;
    const peek = () => tokens[position];
    const take = () => tokens[position++];
    const describe = (token: ConditionToken | undefined): string => {
        if (token === undefined) return 'its end';
        if (token.kind === 'operand')
            return JSON.stringify(
                token.operand.kind === 'literal'
                    ? token.operand.text
                    : `{${token.operand.namespace}:${token.operand.key}}`
            );
        if (token.kind === 'operator') return JSON.stringify(token.operator);
        return { open: '"("', close: '")"', and: '"&&"', or: '"||"' }[token.kind];
    };
    const operand = (): Operand => {
        const token = take();
        if (token?.kind !== 'operand')
            throw conditionError(condition, `expects a value, a placeholder or a quoted text at ${describe(token)}`);
        return token.operand;
    };
    const comparison = (): Condition => {
        if (peek()?.kind === 'open') {
            take();
            if (++depth > MAX_CONDITION_DEPTH) {
                throw conditionError(condition, `nests parentheses deeper than ${MAX_CONDITION_DEPTH} levels`);
            }
            const inner = or();
            depth--;
            if (take()?.kind !== 'close') throw conditionError(condition, 'has a parenthesis that never closes');
            return inner;
        }
        const left = operand();
        const token = take();
        if (token?.kind !== 'operator') throw conditionError(condition, `expects a comparison at ${describe(token)}`);
        return { kind: 'compare', left, operator: token.operator, right: operand() };
    };
    const and = (): Condition => {
        let left = comparison();
        while (peek()?.kind === 'and') {
            take();
            left = { kind: 'and', left, right: comparison() };
        }
        return left;
    };
    const or = (): Condition => {
        let left = and();
        while (peek()?.kind === 'or') {
            take();
            left = { kind: 'or', left, right: and() };
        }
        return left;
    };
    if (tokens.length === 0) throw conditionError(condition, 'is empty');
    const parsed = or();
    if (position < tokens.length) throw conditionError(condition, `has more after its end at ${describe(peek())}`);
    return parsed;
};

/** A text as a number, when the whole of it is one. */
const numberOf = (text: string): number | undefined => {
    const trimmed = text.trim();
    if (trimmed === '') return undefined;
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : undefined;
};

const compare = (operator: Comparison, left: string, right: string): boolean => {
    const leftNumber = numberOf(left);
    const rightNumber = numberOf(right);
    const numeric = leftNumber !== undefined && rightNumber !== undefined;
    switch (operator) {
        case '==':
            return numeric ? leftNumber === rightNumber : left === right;
        case '!=':
            return numeric ? leftNumber !== rightNumber : left !== right;
        case '<':
            return numeric ? leftNumber < rightNumber : left < right;
        case '<=':
            return numeric ? leftNumber <= rightNumber : left <= right;
        case '>':
            return numeric ? leftNumber > rightNumber : left > right;
        case '>=':
            return numeric ? leftNumber >= rightNumber : left >= right;
        case 'contains':
            return left.includes(right);
        case 'startsWith':
            return left.startsWith(right);
    }
};

/** Evaluates a parsed condition. A placeholder nobody provides reads as its token. */
export const evaluateCondition = (condition: Condition, host: TemplateHost): boolean => {
    const valueOf = (operand: Operand): string =>
        operand.kind === 'literal'
            ? operand.text
            : (host.placeholder(operand.namespace, operand.key) ?? `{${operand.namespace}:${operand.key}}`);
    if (condition.kind === 'compare')
        return compare(condition.operator, valueOf(condition.left), valueOf(condition.right));
    const left = evaluateCondition(condition.left, host);
    return condition.kind === 'and'
        ? left && evaluateCondition(condition.right, host)
        : left || evaluateCondition(condition.right, host);
};

// Templates.

const invalid = (where: string, problem: string): TypeError => new ScriptHostErrors.TemplateInvalid({ where, problem });

const nodeList = (value: unknown, where: string, depth: number): TemplateNode[] => {
    if (!Array.isArray(value)) throw invalid(where, 'must be a list of nodes');
    if (depth > MAX_TEMPLATE_DEPTH) throw invalid(where, `nests deeper than ${MAX_TEMPLATE_DEPTH} levels`);
    return value.map((node, index) => nodeOf(node, `${where}[${index}]`, depth));
};

const wholeNumber = (value: unknown, where: string, least: number): number => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < least) {
        throw invalid(where, `must be a whole number of at least ${least}`);
    }
    return value;
};

const text = (value: unknown, where: string): string => {
    if (typeof value !== 'string') throw invalid(where, 'must be a string');
    return value;
};

/**
 * One node, checked.
 * @throws {TypeError} When it is not a node this renderer knows.
 */
const nodeOf = (value: unknown, where: string, depth: number): TemplateNode => {
    if (typeof value === 'string') return { text: value };
    if (!isRecord(value)) throw invalid(where, 'must be an object');
    if ('text' in value) return { text: text(value.text, `${where}.text`) };
    if ('placeholder' in value) {
        const name = text(value.placeholder, `${where}.placeholder`);
        if (!PLACEHOLDER.test(name))
            throw invalid(
                `${where}.placeholder`,
                'must be namespace:key, in lowercase letters, digits and underscores'
            );
        return { placeholder: name };
    }
    if ('if' in value) {
        const condition = text(value.if, `${where}.if`);
        parseCondition(condition);
        return {
            if: condition,
            then: nodeList(value.then, `${where}.then`, depth + 1),
            ...(value.else === undefined ? {} : { else: nodeList(value.else, `${where}.else`, depth + 1) })
        };
    }
    if ('animate' in value) {
        const animate = value.animate;
        if (!isRecord(animate)) throw invalid(`${where}.animate`, 'must be an object with interval and frames');
        if (!Array.isArray(animate.frames) || animate.frames.length === 0)
            throw invalid(`${where}.animate.frames`, 'must be a list of at least one frame');
        return {
            animate: {
                interval: wholeNumber(animate.interval, `${where}.animate.interval`, 1),
                frames: animate.frames.map((frame, index) =>
                    nodeList(frame, `${where}.animate.frames[${index}]`, depth + 1)
                )
            }
        };
    }
    if ('gradient' in value) {
        const gradient = value.gradient;
        if (!isRecord(gradient)) throw invalid(`${where}.gradient`, 'must be an object with colors and rawtext');
        if (!Array.isArray(gradient.colors) || gradient.colors.length === 0)
            throw invalid(`${where}.gradient.colors`, 'must be a list of at least one #rrggbb color');
        const colors = gradient.colors.map((color, index) => {
            const hex = text(color, `${where}.gradient.colors[${index}]`);
            if (!HEX_COLOR.test(hex)) throw invalid(`${where}.gradient.colors[${index}]`, `${hex} is not #rrggbb`);
            return hex;
        });
        return { gradient: { colors, rawtext: nodeList(gradient.rawtext, `${where}.gradient.rawtext`, depth + 1) } };
    }
    if ('translate' in value) {
        const key = text(value.translate, `${where}.translate`);
        if (value.with === undefined) return { translate: key };
        if (Array.isArray(value.with)) {
            return { translate: key, with: value.with.map((item, index) => text(item, `${where}.with[${index}]`)) };
        }
        return { translate: key, with: templateOf(value.with, `${where}.with`, depth + 1) };
    }
    if ('score' in value) {
        const score = value.score;
        if (!isRecord(score)) throw invalid(`${where}.score`, 'must be an object with name and objective');
        return {
            score: {
                name: text(score.name, `${where}.score.name`),
                objective: text(score.objective, `${where}.score.objective`)
            }
        };
    }
    if ('selector' in value) return { selector: text(value.selector, `${where}.selector`) };
    throw invalid(where, 'must be a text, placeholder, if, animate, gradient, translate, score or selector node');
};

/**
 * A template from parsed JSON, checked node by node.
 * @param where - Where the value sits, for the error.
 * @throws {TypeError} When the value is not a template.
 */
export const templateOf = (value: unknown, where = 'template', depth = 0): Template => {
    if (!isRecord(value) || !('rawtext' in value)) throw invalid(where, 'must be an object with a rawtext list');
    return { rawtext: nodeList(value.rawtext, `${where}.rawtext`, depth) };
};

/**
 * Parses the shorthand `{player:name} &7{player:ping}ms`: each token is a placeholder node, the
 * text between is text nodes, and `&` before a format code becomes `§`.
 */
export const parseShorthand = (shorthand: string): Template => {
    const nodes: TemplateNode[] = [];
    let last = 0;
    const pushText = (raw: string) => {
        if (raw === '') return;
        const converted = raw.replace(/&(?=(.))/g, (whole, code: string) => (SHORTHAND_CODES.has(code) ? '§' : whole));
        nodes.push({ text: converted });
    };
    for (const match of shorthand.matchAll(TOKEN)) {
        pushText(shorthand.slice(last, match.index));
        nodes.push({ placeholder: `${match[1]}:${match[2]}` });
        last = match.index + match[0].length;
    }
    pushText(shorthand.slice(last));
    return { rawtext: nodes };
};

/** Takes every `§` code out of a text, so a gradient colors the characters alone. */
const stripCodes = (value: string): string => value.replace(/§./g, '');

/** A gradient over a text: each character in the nearest palette color, ending with a reset. */
const gradientText = (colors: readonly string[], value: string): string => {
    const plain = stripCodes(value);
    const stops = colors.map(rgbOf);
    const visible = [...plain].filter((char) => char.trim() !== '').length;
    let seen = 0;
    let current = '';
    let out = '';
    for (const char of plain) {
        if (char.trim() === '') {
            out += char;
            continue;
        }
        const code = nearestCode(colorAt(stops, visible <= 1 ? 0 : seen / (visible - 1)));
        seen++;
        if (code !== current) {
            out += `§${code}`;
            current = code;
        }
        out += char;
    }
    return current === '' ? out : `${out}§r`;
};

/**
 * Renders a template for a tick.
 * @returns The text, and the tick an animation in it next changes the text, when it holds one
 *   with more than one frame.
 */
export const renderTemplate = (template: Template, host: TemplateHost): RenderedTemplate => {
    let nextChangeTick: number | undefined;
    const render = (nodes: readonly TemplateNode[]): string => nodes.map(renderNode).join('');
    const renderNode = (node: TemplateNode): string => {
        if ('text' in node) return node.text;
        if ('placeholder' in node) {
            const match = PLACEHOLDER.exec(node.placeholder);
            const [, namespace = '', key = ''] = match ?? [];
            return host.placeholder(namespace, key) ?? `{${node.placeholder}}`;
        }
        if ('if' in node) {
            return evaluateCondition(parseCondition(node.if), host) ? render(node.then) : render(node.else ?? []);
        }
        if ('animate' in node) {
            const { interval, frames } = node.animate;
            const step = Math.floor(host.tick / interval);
            // One frame never changes the text, so it asks for no render of its own.
            if (frames.length > 1) {
                const change = (step + 1) * interval;
                if (nextChangeTick === undefined || change < nextChangeTick) nextChangeTick = change;
            }
            return render(frames[step % frames.length] ?? []);
        }
        if ('gradient' in node) return gradientText(node.gradient.colors, render(node.gradient.rawtext));
        if ('translate' in node) return node.translate;
        if ('score' in node) {
            const score = host.score?.(node.score.name, node.score.objective);
            return score === undefined ? '' : String(score);
        }
        return host.selector?.(node.selector) ?? '';
    };
    const rendered = render(template.rawtext);
    return nextChangeTick === undefined ? { text: rendered } : { text: rendered, nextChangeTick };
};
