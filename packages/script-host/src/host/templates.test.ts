import { describe, expect, it } from 'vitest';

import type { TemplateHost } from './templates';
import {
    evaluateCondition,
    MAX_CONDITION_DEPTH,
    MAX_CONDITION_LENGTH,
    MAX_TEMPLATE_DEPTH,
    parseCondition,
    parseShorthand,
    renderTemplate,
    templateOf
} from './templates';

/** A host over a table of placeholder values, at a tick. */
const hostOf = (
    values: Record<string, string | undefined>,
    tick = 0,
    extra: Partial<TemplateHost> = {}
): TemplateHost => ({
    tick,
    placeholder: (namespace, key) => values[`${namespace}:${key}`],
    ...extra
});

const steve = { 'player:name': 'Steve', 'player:ping': '180', 'player:group': 'vip', 'player:empty': '' };

/** Renders a template, parsed from JSON as a pack's object arrives. */
const render = (template: unknown, host: TemplateHost) => renderTemplate(templateOf(template), host);

describe('templateOf', () => {
    it('takes each node kind, and a bare string as a text node', () => {
        // As a pack writes one, with a bare string for a text node, so no annotation.
        const template = {
            rawtext: [
                { text: 'a' },
                { placeholder: 'player:name' },
                { if: '{player:ping} > 150', then: [{ text: 'slow' }], else: ['fast'] },
                { animate: { interval: 10, frames: [[{ text: '.' }], [{ text: '..' }]] } },
                { gradient: { colors: ['#ff0000', '#0000ff'], rawtext: [{ text: 'VIP' }] } },
                { translate: 'commands.op.success', with: ['Steve'] },
                { translate: 'chat.type.text', with: { rawtext: [{ text: 'x' }] } },
                { score: { name: '@s', objective: 'kills' } },
                { selector: '@s' }
            ]
        };

        expect(templateOf(JSON.parse(JSON.stringify(template)))).toEqual({
            ...template,
            rawtext: template.rawtext.map((node) => ('if' in node ? { ...node, else: [{ text: 'fast' }] } : node))
        });
    });

    it.each([
        [7, 'The template node at template must be an object with a rawtext list'],
        [{ rawtext: {} }, 'The template node at template.rawtext must be a list of nodes'],
        [{ rawtext: [7] }, 'The template node at template.rawtext[0] must be an object'],
        [
            { rawtext: [{ bold: true }] },
            'The template node at template.rawtext[0] must be a text, placeholder, if, animate, gradient, translate, score or selector node'
        ],
        [{ rawtext: [{ text: 1 }] }, 'The template node at template.rawtext[0].text must be a string'],
        [
            { rawtext: [{ placeholder: 'Player:Name' }] },
            'The template node at template.rawtext[0].placeholder must be namespace:key, in lowercase letters, digits and underscores'
        ],
        [
            { rawtext: [{ if: '{player:ping} >', then: [] }] },
            'The condition {player:ping} > expects a value, a placeholder or a quoted text at its end'
        ],
        [{ rawtext: [{ if: 'a == b' }] }, 'The template node at template.rawtext[0].then must be a list of nodes'],
        [
            { rawtext: [{ animate: { interval: 0, frames: [[]] } }] },
            'The template node at template.rawtext[0].animate.interval must be a whole number of at least 1'
        ],
        [
            { rawtext: [{ animate: { interval: 1, frames: [] } }] },
            'The template node at template.rawtext[0].animate.frames must be a list of at least one frame'
        ],
        [
            { rawtext: [{ animate: { interval: 1, frames: [{}] } }] },
            'The template node at template.rawtext[0].animate.frames[0] must be a list of nodes'
        ],
        [
            { rawtext: [{ gradient: { colors: ['red'], rawtext: [] } }] },
            'The template node at template.rawtext[0].gradient.colors[0] red is not #rrggbb'
        ],
        [
            { rawtext: [{ gradient: { colors: [], rawtext: [] } }] },
            'The template node at template.rawtext[0].gradient.colors must be a list of at least one #rrggbb color'
        ],
        [
            { rawtext: [{ translate: 'k', with: [1] }] },
            'The template node at template.rawtext[0].with[0] must be a string'
        ],
        [
            { rawtext: [{ score: { name: '@s' } }] },
            'The template node at template.rawtext[0].score.objective must be a string'
        ],
        [{ rawtext: [{ selector: 7 }] }, 'The template node at template.rawtext[0].selector must be a string']
    ])('refuses %j, naming the node', (value, message) => {
        expect(() => templateOf(value)).toThrow(TypeError);
        expect(() => templateOf(value)).toThrow(message);
    });
});

describe('renderTemplate', () => {
    it('renders text and placeholders, leaving a token nobody provides', () => {
        const rendered = render(
            {
                rawtext: [
                    'Hi ',
                    { placeholder: 'player:name' },
                    { text: ' ' },
                    { placeholder: 'player:ping' },
                    'ms ',
                    { placeholder: 'other:thing' }
                ]
            },
            hostOf(steve)
        );

        expect(rendered).toEqual({ text: 'Hi Steve 180ms {other:thing}' });
    });

    it('picks then or else by the condition, and renders nothing for a false if without else', () => {
        const template = {
            rawtext: [
                {
                    if: '{player:ping} > 150',
                    then: [' §c', { placeholder: 'player:ping' }],
                    else: [' §7', { placeholder: 'player:ping' }]
                },
                { if: '{player:group} == admin', then: ['!'] }
            ]
        };

        expect(render(template, hostOf(steve)).text).toBe(' §c180');
        expect(render(template, hostOf({ ...steve, 'player:ping': '20', 'player:group': 'admin' })).text).toBe(
            ' §720!'
        );
    });

    it('reports no next change for an animation with one frame', () => {
        const template = { rawtext: [{ animate: { interval: 10, frames: [['only']] } }] };

        expect(render(template, hostOf({}, 3))).toEqual({ text: 'only' });
    });

    it('refuses a template nested deeper than the limit, naming the depth', () => {
        let node: unknown = { text: 'deep' };
        for (let level = 0; level <= MAX_TEMPLATE_DEPTH; level++) node = { if: '1 == 1', then: [node] };

        expect(() => templateOf({ rawtext: [node] })).toThrow(`nests deeper than ${MAX_TEMPLATE_DEPTH} levels`);
    });

    it('shows the frame of the tick and says when the next frame comes, the soonest across nested animations', () => {
        const dots = { animate: { interval: 10, frames: [['.'], ['..'], ['...']] } };
        const template = {
            rawtext: [
                { animate: { interval: 40, frames: [['A ', dots], ['B']] } },
                { if: '{player:group} == vip', then: [{ animate: { interval: 7, frames: [['x'], ['y']] } }] }
            ]
        };

        expect(render(template, hostOf(steve, 0))).toEqual({ text: 'A .x', nextChangeTick: 7 });
        expect(render(template, hostOf(steve, 29))).toEqual({ text: 'A ...x', nextChangeTick: 30 });
        expect(render(template, hostOf(steve, 42))).toEqual({ text: 'Bx', nextChangeTick: 49 });
        expect(render(template, hostOf(steve, 49))).toEqual({ text: 'By', nextChangeTick: 56 });
        // The second animation sits in a branch the condition skips, so it does not count.
        expect(render(template, hostOf({ ...steve, 'player:group': 'none' }, 42))).toEqual({
            text: 'B',
            nextChangeTick: 80
        });
        expect(render({ rawtext: ['still'] }, hostOf(steve, 42))).toEqual({ text: 'still' });
    });

    it('colors each character of a gradient with the nearest palette color, once per run, and resets after', () => {
        const red = { gradient: { colors: ['#ff5555'], rawtext: ['§lab§r c'] } };
        const fade = { gradient: { colors: ['#ff5555', '#5555ff'], rawtext: ['VIP'] } };
        const three = { gradient: { colors: ['#000000', '#ffffff', '#000000'], rawtext: ['abcde'] } };

        expect(render({ rawtext: [red] }, hostOf({})).text).toBe('§cab c§r');
        // The midpoint, #aa55aa, is nearest the amethyst material color.
        expect(render({ rawtext: [fade] }, hostOf({})).text).toBe('§cV§uI§9P§r');
        expect(render({ rawtext: [three] }, hostOf({})).text).toBe('§0a§7b§fc§7d§0e§r');
        expect(render({ rawtext: [{ gradient: { colors: ['#ff5555'], rawtext: [] } }] }, hostOf({})).text).toBe('');
    });

    it('renders a translate node as its key, a score from the host and a selector from the host', () => {
        const host = hostOf(steve, 0, {
            score: (name, objective) => (name === '@s' && objective === 'kills' ? 7 : undefined),
            selector: (selector) => (selector === '@a' ? 'Steve, Alex' : undefined)
        });
        const template = {
            rawtext: [
                { translate: 'commands.op.success', with: ['Steve'] },
                ' ',
                { score: { name: '@s', objective: 'kills' } },
                { score: { name: 'Alex', objective: 'kills' } },
                ' ',
                { selector: '@a' },
                { selector: '@e[type=pig]' }
            ]
        };

        expect(render(template, host).text).toBe('commands.op.success 7 Steve, Alex');
        expect(render(template, hostOf(steve)).text).toBe('commands.op.success  ');
    });
});

describe('conditions', () => {
    const truth = (condition: string, values: Record<string, string | undefined> = steve) =>
        evaluateCondition(parseCondition(condition), hostOf(values));

    it.each([
        ['{player:ping} > 150', true],
        ['{player:ping} >= 180', true],
        ['{player:ping} < 180', false],
        ['{player:ping} <= 180', true],
        ['{player:ping} == 180.0', true],
        ['{player:ping} != 180', false],
        ['{player:name} == Steve', true],
        ["{player:name} == 'Steve'", true],
        ['{player:name} == "steve"', false],
        ['{player:name} contains tev', true],
        ['{player:name} startsWith St', true],
        ['{player:name} startsWith tev', false],
        // Text compares as text when a side is not a number.
        ['{player:name} < a', true],
        ['10 < 9', false],
        ['{player:empty} == ""', true],
        // A placeholder nobody provides reads as its token.
        ['{other:thing} == {other:thing}', true],
        ['{other:thing} == ""', false]
    ])('evaluates %s as %s', (condition, expected) => {
        expect(truth(condition)).toBe(expected);
    });

    it('binds && tighter than ||, and parentheses override', () => {
        expect(truth('1 == 1 || 1 == 2 && 2 == 3')).toBe(true);
        expect(truth('(1 == 1 || 1 == 2) && 2 == 3')).toBe(false);
        expect(truth('{player:ping} > 150 && {player:group} == vip || 1 == 2')).toBe(true);
        expect(truth('1 == 2 || {player:ping} > 150 && {player:group} == admin')).toBe(false);
        expect(truth('(1 == 2 || {player:ping} > 150) && {player:group} == vip')).toBe(true);
        expect(truth('1 == 2 || (1 == 1 && 2 == 2)')).toBe(true);
    });

    it('refuses a condition longer than the limit or nested deeper than it, instead of running out of stack', () => {
        const long = `${'('.repeat(MAX_CONDITION_LENGTH)}1 == 1${')'.repeat(MAX_CONDITION_LENGTH)}`;
        expect(() => parseCondition(long)).toThrow(`is longer than ${MAX_CONDITION_LENGTH} characters`);
        const deep = `${'('.repeat(MAX_CONDITION_DEPTH + 1)}1 == 1${')'.repeat(MAX_CONDITION_DEPTH + 1)}`;
        expect(() => parseCondition(deep)).toThrow(`nests parentheses deeper than ${MAX_CONDITION_DEPTH} levels`);
        const allowed = `${'('.repeat(MAX_CONDITION_DEPTH)}1 == 1${')'.repeat(MAX_CONDITION_DEPTH)}`;
        expect(evaluateCondition(parseCondition(allowed), hostOf({}))).toBe(true);
    });

    it.each([
        ['', 'The condition  is empty'],
        ['{player:ping}', 'The condition {player:ping} expects a comparison at its end'],
        [
            '{player:ping} > ',
            'The condition {player:ping} >  expects a value, a placeholder or a quoted text at its end'
        ],
        ['{player:ping} > 1 2', 'The condition {player:ping} > 1 2 has more after its end at "2"'],
        ['({player:ping} > 1', 'The condition ({player:ping} > 1 has a parenthesis that never closes'],
        ['{player:ping} > "x', 'The condition {player:ping} > "x has a quote that never closes at "\\"x"'],
        [
            '{Player:ping} > 1',
            'The condition {Player:ping} > 1 has a brace that opens no placeholder at "{Player:ping} > 1"'
        ],
        [
            '1 == 1 && && 2 == 2',
            'The condition 1 == 1 && && 2 == 2 expects a value, a placeholder or a quoted text at "&&"'
        ]
    ])('refuses %j', (condition, message) => {
        expect(() => parseCondition(condition)).toThrow(TypeError);
        expect(() => parseCondition(condition)).toThrow(message);
    });
});

describe('parseShorthand', () => {
    it('turns tokens into placeholder nodes, the rest into text, and & before a code into §', () => {
        expect(parseShorthand('{player:name} &7{player:ping}ms &&a &z&r{nope}')).toEqual({
            rawtext: [
                { placeholder: 'player:name' },
                { text: ' §7' },
                { placeholder: 'player:ping' },
                { text: 'ms &§a &z§r{nope}' }
            ]
        });
        expect(parseShorthand('')).toEqual({ rawtext: [] });
    });

    it('renders the same as the tree it parses to', () => {
        const shorthand = '&l{player:name}&r &7{player:ping}ms {other:thing}';
        const host = hostOf(steve);

        expect(renderTemplate(parseShorthand(shorthand), host).text).toBe('§lSteve§r §7180ms {other:thing}');
        expect(renderTemplate(templateOf(JSON.parse(JSON.stringify(parseShorthand(shorthand)))), host)).toEqual(
            renderTemplate(parseShorthand(shorthand), host)
        );
    });
});
