import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';
import type { JSPRISMARINE_HOST_FUNCTIONS } from './jsprismarineServer';
import {
    JSPRISMARINE_SERVER,
    JSPRISMARINE_TYPES,
    jsprismarineServerSource,
    jsprismarineServerTypings
} from './jsprismarineServer';

const info = { version: '1.2.3', minecraftVersion: '1.26.50', protocolVersion: 2193, maxPlayers: 20 };

/** A host whose functions record each call and answer from fixed values. */
const recordingHost = () => {
    const calls: unknown[][] = [];
    const record =
        (name: string, answer: (...args: unknown[]) => unknown) =>
        (...args: unknown[]) => {
            calls.push([name, ...args]);
            return answer(...args);
        };
    const performance: Record<string, number | number[]> = { tps: 19.5, tpsAverages: [20, 19, 18], lastTickMs: 12 };
    const host = {
        read: record('read', (name, index) => {
            const value = performance[String(name)];
            return Array.isArray(value) ? value[Number(index)] : value;
        }),
        ping: record('ping', () => 42),
        showBar: record('showBar', () => 7),
        updateBar: record('updateBar', () => undefined),
        hideBar: record('hideBar', () => undefined),
        barValid: record('barValid', (id) => id === 7),
        register: record('register', () => 3),
        unregister: record('unregister', () => undefined),
        resolve: record('resolve', (text) => String(text).toUpperCase()),
        namespaces: record('namespaces', () => JSON.stringify([{ namespace: 'player', keys: ['name', 'ping'] }])),
        parseTemplate: record('parseTemplate', (shorthand) =>
            JSON.stringify({ rawtext: [{ text: String(shorthand) }] })
        ),
        renderTemplate: record('renderTemplate', (template) =>
            JSON.stringify({ text: String(template).toUpperCase(), nextChangeTick: 20 })
        )
    } satisfies Record<(typeof JSPRISMARINE_HOST_FUNCTIONS)[number], unknown>;
    return { host, calls };
};

/** The module's namespace as the source makes it, in a fresh realm. */
const namespaceOf = (host?: object): Record<string, unknown> => {
    // The source is one function expression of JSON values, getters and Object.freeze, which any engine evaluates.
    const make: unknown = runInNewContext(jsprismarineServerSource(info));
    if (typeof make !== 'function') throw new TypeError('The module source is not a function');
    return make(host);
};

/** A property of an object the namespace holds. */
const at = (value: unknown, key: string): unknown =>
    typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

describe('@jsprismarine/server', () => {
    it('makes only the fixed values and the ones the server supplied without a host', () => {
        const namespace = namespaceOf();

        expect(JSON.stringify(namespace)).toBe(JSON.stringify({ jsprismarine: { name: 'JSPrismarine', ...info } }));
        expect(Object.isFrozen(namespace)).toBe(true);
        expect(Object.isFrozen(namespace.jsprismarine)).toBe(true);
    });

    it('makes every member it defines with a host, each frozen', () => {
        const namespace = namespaceOf(recordingHost().host);

        expect(Object.keys(namespace)).toEqual(Object.keys(JSPRISMARINE_SERVER));
        for (const value of Object.values(namespace)) expect(Object.isFrozen(value)).toBe(true);
    });

    it('reads performance from the host on every read, a list as a frozen copy', () => {
        const { host, calls } = recordingHost();
        const { performance } = namespaceOf(host);

        expect(Object.keys(performance ?? {})).toEqual(Object.keys(JSPRISMARINE_SERVER.performance.properties));
        expect(at(performance, 'tps')).toBe(19.5);
        expect(at(performance, 'tps')).toBe(19.5);
        expect(calls.filter(([name]) => name === 'read')).toHaveLength(2);

        const averages = at(performance, 'tpsAverages');
        expect(averages).toEqual([20, 19, 18]);
        expect(Object.isFrozen(averages)).toBe(true);
        expect(at(performance, 'lastTickMs')).toBe(12);
    });

    it('forwards getPing and the boss bar calls to the host', () => {
        const { host, calls } = recordingHost();
        const { getPing, bossBars } = namespaceOf(host);
        const player = { id: '-4294967295' };

        expect(typeof getPing === 'function' && getPing(player)).toBe(42);
        const show = at(bossBars, 'show');
        if (typeof show !== 'function') throw new TypeError('bossBars.show is not a function');
        const bar: unknown = show(player, { text: 'TPS' });

        const declared = JSPRISMARINE_TYPES.BossBar;
        expect(Object.keys(bar ?? {}).sort()).toEqual(
            [...Object.keys(declared.properties), ...Object.keys(declared.methods)].sort()
        );
        expect(Object.isFrozen(bar)).toBe(true);
        expect(at(bar, 'player')).toBe(player);
        expect(at(bar, 'isValid')).toBe(true);
        const update = at(bar, 'update');
        const hide = at(bar, 'hide');
        if (typeof update !== 'function' || typeof hide !== 'function') throw new TypeError('A bar has no methods');
        update({ progress: 0.5 });
        hide();

        expect(calls).toEqual([
            ['ping', player],
            ['showBar', player, { text: 'TPS' }],
            ['barValid', 7],
            ['updateBar', 7, { progress: 0.5 }],
            ['hideBar', 7]
        ]);
    });

    it('forwards the placeholder calls to the host, and lists the namespaces as frozen copies', () => {
        const { host, calls } = recordingHost();
        const { placeholders } = namespaceOf(host);
        const player = { id: '-4294967295' };
        const provider = { keys: ['name'], resolve: () => 'Steve' };

        const register = at(placeholders, 'register');
        const resolve = at(placeholders, 'resolve');
        if (typeof register !== 'function' || typeof resolve !== 'function') {
            throw new TypeError('placeholders has no methods');
        }
        const registration: unknown = register('demo', provider);
        expect(Object.isFrozen(registration)).toBe(true);
        expect(resolve('{demo:name}', player)).toBe('{DEMO:NAME}');
        const unregister = at(registration, 'unregister');
        if (typeof unregister !== 'function') throw new TypeError('A registration has no unregister');
        unregister();

        const namespaces = at(placeholders, 'namespaces');
        expect(namespaces).toEqual([{ namespace: 'player', keys: ['name', 'ping'] }]);
        expect(Object.isFrozen(namespaces)).toBe(true);
        expect(Object.isFrozen(at(namespaces, '0'))).toBe(true);
        expect(Object.isFrozen(at(at(namespaces, '0'), 'keys'))).toBe(true);
        expect(at(placeholders, 'namespaces')).not.toBe(namespaces);

        expect(calls).toEqual([
            ['register', 'demo', provider],
            ['resolve', '{demo:name}', player],
            ['unregister', 3],
            ['namespaces'],
            ['namespaces']
        ]);
    });

    it('passes templates to the host as JSON, shorthand as it is, and gives frozen trees back', () => {
        const { host, calls } = recordingHost();
        const { placeholders } = namespaceOf(host);
        const player = { id: '-4294967295' };
        const parse = at(placeholders, 'parse');
        const render = at(placeholders, 'render');
        if (typeof parse !== 'function' || typeof render !== 'function')
            throw new TypeError('placeholders has no parse');

        const template: unknown = parse('{player:name}');
        expect(template).toEqual({ rawtext: [{ text: '{player:name}' }] });
        expect(Object.isFrozen(template)).toBe(true);
        expect(Object.isFrozen(at(template, 'rawtext'))).toBe(true);
        expect(Object.isFrozen(at(at(template, 'rawtext'), '0'))).toBe(true);
        const rendered: unknown = render(template, player);
        expect(rendered).toEqual({ text: '{"RAWTEXT":[{"TEXT":"{PLAYER:NAME}"}]}', nextChangeTick: 20 });
        expect(Object.isFrozen(rendered)).toBe(true);
        render('{player:name}');

        expect(calls).toEqual([
            ['parseTemplate', '{player:name}'],
            ['renderTemplate', '{"rawtext":[{"text":"{player:name}"}]}', false, player],
            ['renderTemplate', '{player:name}', true, undefined]
        ]);
    });

    it('declares every member, property and type it defines, under the module name, with its summary', () => {
        const typings = jsprismarineServerTypings();

        expect(typings).toContain("declare module '@jsprismarine/server' {");
        expect(typings).toContain(
            `    /** ${JSPRISMARINE_SERVER.jsprismarine.summary} */\n    export const jsprismarine: {`
        );
        for (const [key, property] of Object.entries(JSPRISMARINE_SERVER.jsprismarine.properties)) {
            const type = 'value' in property ? JSON.stringify(property.value) : property.type;
            expect(typings).toContain(`        /** ${property.summary} */\n        readonly ${key}: ${type};`);
        }
        expect(typings).toContain('        readonly tpsAverages: readonly number[];');
        expect(typings).toContain('    export function getPing(player: Player): number | undefined;');
        expect(typings).toContain('        show(player: Player, options?: BossBarOptions): BossBar;');
        for (const [name, type] of Object.entries(JSPRISMARINE_TYPES)) {
            const declaration = type.kind === 'interface' ? `export interface ${name} {` : `export type ${name} =`;
            expect(typings).toContain(`    /** ${type.summary} */\n    ${declaration}`);
        }
        expect(typings).toContain('        readonly color?: BossBarColor;');
        expect(typings).toContain('        hide(): void;');
        expect(typings).toContain('        readonly maxPlayers: number;');
        expect(typings).toContain(
            '    export const placeholders: {\n' +
                `        /** ${JSPRISMARINE_SERVER.placeholders.properties.namespaces.summary} */\n` +
                '        readonly namespaces: readonly PlaceholderNamespace[];\n' +
                `        /** ${JSPRISMARINE_SERVER.placeholders.methods.register.summary} */\n` +
                '        register(namespace: string, provider: PlaceholderProvider): PlaceholderRegistration;'
        );
        expect(typings).toContain('        resolve(key: string, player?: Player): string | number | undefined;');
        expect(typings).toContain('        render(template: Template | string, player?: Player): RenderedTemplate;');
        expect(typings).toContain('    export type TemplateNode =\n        | { readonly text: string }');
        expect(typings).toContain('        readonly nextChangeTick?: number;');
    });
});
