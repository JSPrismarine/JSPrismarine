import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';
import type { JSPRISMARINE_HOST_FUNCTIONS, JSPRISMARINE_PLACEHOLDERS_HOST_FUNCTIONS } from './jsprismarineServer';
import {
    JSPRISMARINE_PLACEHOLDER_TYPES,
    JSPRISMARINE_PLACEHOLDERS,
    JSPRISMARINE_SERVER,
    JSPRISMARINE_TYPES,
    jsprismarineServerSource,
    jsprismarineServerTypings,
    placeholdersModuleSource
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
        setListName: record('setListName', () => undefined),
        resetListName: record('resetListName', () => undefined),
        readConfig: record('readConfig', () => JSON.stringify({ interval: 20, groups: { vip: 'x' } })),
        writeConfig: record('writeConfig', () => undefined),
        onConfigChange: record('onConfigChange', () => undefined),
        offConfigChange: record('offConfigChange', () => undefined),
        setConfigEventMaker: record('setConfigEventMaker', () => undefined),
        hasPermission: record('hasPermission', (_player, node) => node === 'a.b'),
        groupsOf: record('groupsOf', () => JSON.stringify(['vip', 'default'])),
        primaryGroupOf: record('primaryGroupOf', () => 'vip'),
        metaOf: record('metaOf', (_player, key) => (key === 'prefix' ? '[VIP] ' : undefined)),
        grant: record('grant', () => undefined),
        revoke: record('revoke', () => undefined),
        grantToGroup: record('grantToGroup', () => undefined),
        revokeFromGroup: record('revokeFromGroup', () => undefined),
        addToGroup: record('addToGroup', () => undefined),
        removeFromGroup: record('removeFromGroup', () => undefined),
        onPermissionsChange: record('onPermissionsChange', () => undefined)
    } satisfies Record<(typeof JSPRISMARINE_HOST_FUNCTIONS)[number], unknown>;
    const placeholdersHost = {
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
    } satisfies Record<(typeof JSPRISMARINE_PLACEHOLDERS_HOST_FUNCTIONS)[number], unknown>;
    return { host, placeholdersHost, calls };
};

/** The module's namespace as the source makes it, in a fresh realm. */
const namespaceOf = (host?: object): Record<string, unknown> => {
    // The source is one function expression of JSON values, getters and Object.freeze, which any engine evaluates.
    const make: unknown = runInNewContext(jsprismarineServerSource(info));
    if (typeof make !== 'function') throw new TypeError('The module source is not a function');
    return make(host);
};

/** The `@jsprismarine/placeholders` namespace as the source makes it, in a fresh realm. */
const placeholdersOf = (host: object): Record<string, unknown> => {
    const make: unknown = runInNewContext(placeholdersModuleSource());
    if (typeof make !== 'function') throw new TypeError('The placeholders module source is not a function');
    return make(host);
};

/** A property of an object the namespace holds. */
const at = (value: unknown, key: string): unknown =>
    typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

describe('@jsprismarine/server', () => {
    it('reads and writes permissions through the host, and dispatches a change to its subscribers', () => {
        const { host, calls } = recordingHost();
        const namespace = namespaceOf(host);
        const permissions = namespace.permissions;
        const dispatch = calls.find(([name]) => name === 'onPermissionsChange')?.[1];
        if (typeof dispatch !== 'function') throw new TypeError('The member did not hand the host a dispatcher');
        const player = { id: '7' };
        const seen: unknown[] = [];
        const callback = (event: unknown) => void seen.push(event);

        const has = at(permissions, 'has');
        const groupsOf = at(permissions, 'groupsOf');
        const grant = at(permissions, 'grantToGroup');
        const signal = at(at(permissions, 'afterEvents'), 'permissionsChange');
        const subscribe = at(signal, 'subscribe');
        const unsubscribe = at(signal, 'unsubscribe');
        if (
            typeof has !== 'function' ||
            typeof groupsOf !== 'function' ||
            typeof grant !== 'function' ||
            typeof subscribe !== 'function' ||
            typeof unsubscribe !== 'function'
        ) {
            throw new TypeError('The member lacks a function');
        }

        expect(has(player, 'a.b')).toBe(true);
        expect(groupsOf(player)).toEqual(['vip', 'default']);
        expect(Object.isFrozen(groupsOf(player))).toBe(true);
        grant('vip', 'a.b', '2030-01-01T00:00:00Z');
        expect(subscribe(callback)).toBe(callback);
        dispatch('vip', undefined, undefined);
        dispatch(undefined, 'Steve', player);
        dispatch(undefined, undefined, undefined);
        unsubscribe(callback);
        dispatch('vip', undefined, undefined);

        expect(seen).toEqual([{ target: { group: 'vip' } }, { target: { name: 'Steve', player } }, {}]);

        // A subscriber that throws does not keep the ones after it from hearing of the change.
        const after: unknown[] = [];
        subscribe(() => {
            throw new Error('first');
        });
        subscribe((event: unknown) => void after.push(event));
        expect(() => dispatch('vip', undefined, undefined)).toThrow('first');
        expect(after).toEqual([{ target: { group: 'vip' } }]);
        expect(seen.every((event) => Object.isFrozen(event))).toBe(true);
        expect(Object.isFrozen(at(seen[0], 'target'))).toBe(true);
        expect(calls.filter(([name]) => name === 'grantToGroup')).toEqual([
            ['grantToGroup', 'vip', 'a.b', '2030-01-01T00:00:00Z']
        ]);
        expect(Object.isFrozen(permissions)).toBe(true);
        expect(Object.isFrozen(signal)).toBe(true);
    });

    it('leaves permissions out of a namespace whose host has no permission functions', () => {
        const { host } = recordingHost();
        const { hasPermission: _hasPermission, ...without } = host;

        const namespace = namespaceOf(without);

        expect('permissions' in namespace).toBe(false);
        expect('bossBars' in namespace).toBe(true);
    });

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

        expect(calls.filter(([name]) => name !== 'onPermissionsChange')).toEqual([
            // Making the namespace registers the config event maker before any call of the test's.
            ['setConfigEventMaker', expect.any(Function)],
            ['ping', player],
            ['showBar', player, { text: 'TPS' }],
            ['barValid', 7],
            ['updateBar', 7, { progress: 0.5 }],
            ['hideBar', 7]
        ]);
    });

    it('forwards the player list calls to the host', () => {
        const { host, calls } = recordingHost();
        const { playerList } = namespaceOf(host);
        const player = { id: '-4294967295' };

        expect(Object.keys(playerList ?? {}).sort()).toEqual(
            Object.keys(JSPRISMARINE_SERVER.playerList.methods).sort()
        );
        const setDisplayName = at(playerList, 'setDisplayName');
        const reset = at(playerList, 'reset');
        if (typeof setDisplayName !== 'function' || typeof reset !== 'function')
            throw new TypeError('playerList has no methods');
        setDisplayName(player, '§aSteve');
        reset(player);

        expect(calls.filter(([name]) => name !== 'onPermissionsChange')).toEqual([
            // Making the namespace registers the config event maker before any call of the test's.
            ['setConfigEventMaker', expect.any(Function)],
            ['setListName', player, '§aSteve'],
            ['resetListName', player]
        ]);
    });

    it('makes @jsprismarine/placeholders with every member it defines, forwarding each call to its host', () => {
        const { placeholdersHost, calls } = recordingHost();
        const placeholders = placeholdersOf(placeholdersHost);
        const player = { id: '-4294967295' };
        const provider = { keys: ['name'], resolve: () => 'Steve' };

        expect(Object.keys(placeholders).sort()).toEqual(Object.keys(JSPRISMARINE_PLACEHOLDERS).sort());
        expect(Object.isFrozen(placeholders)).toBe(true);
        const { register, resolve, namespaces } = placeholders;
        if (typeof register !== 'function' || typeof resolve !== 'function' || typeof namespaces !== 'function') {
            throw new TypeError('placeholders has no functions');
        }
        const registration: unknown = register('demo', provider);
        expect(Object.isFrozen(registration)).toBe(true);
        expect(resolve('{demo:name}', player)).toBe('{DEMO:NAME}');
        const unregister = at(registration, 'unregister');
        if (typeof unregister !== 'function') throw new TypeError('A registration has no unregister');
        unregister();

        const listed: unknown = namespaces();
        expect(listed).toEqual([{ namespace: 'player', keys: ['name', 'ping'] }]);
        expect(Object.isFrozen(listed)).toBe(true);
        expect(Object.isFrozen(at(listed, '0'))).toBe(true);
        expect(Object.isFrozen(at(at(listed, '0'), 'keys'))).toBe(true);
        expect(namespaces()).not.toBe(listed);

        expect(calls.filter(([name]) => name !== 'onPermissionsChange')).toEqual([
            ['register', 'demo', provider],
            ['resolve', '{demo:name}', player],
            ['unregister', 3],
            ['namespaces'],
            ['namespaces']
        ]);
    });

    it('passes templates to the host as JSON, shorthand as it is, and gives frozen trees back', () => {
        const { placeholdersHost, calls } = recordingHost();
        const { parse, render } = placeholdersOf(placeholdersHost);
        const player = { id: '-4294967295' };
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

    it('reads the config through the host as a frozen value, writes it as JSON, and forwards the subscriptions', () => {
        const { host, calls } = recordingHost();
        const { config } = namespaceOf(host);
        const value = at(config, 'value');
        expect(value).toEqual({ interval: 20, groups: { vip: 'x' } });
        expect(Object.isFrozen(value)).toBe(true);
        expect(Object.isFrozen(at(value, 'groups'))).toBe(true);
        expect(at(config, 'value')).not.toBe(value);

        const write = at(config, 'write');
        const signal = at(at(config, 'afterEvents'), 'change');
        const subscribe = at(signal, 'subscribe');
        const unsubscribe = at(signal, 'unsubscribe');
        if (typeof write !== 'function' || typeof subscribe !== 'function' || typeof unsubscribe !== 'function') {
            throw new TypeError('config has no methods');
        }
        write({ interval: 40 });
        const callback = () => {};
        expect(subscribe(callback)).toBe(callback);
        unsubscribe(callback);

        expect(calls.filter(([name]) => name !== 'onPermissionsChange')).toEqual([
            ['setConfigEventMaker', expect.any(Function)],
            ['readConfig'],
            ['readConfig'],
            ['writeConfig', '{"interval":40}'],
            ['onConfigChange', callback],
            ['offConfigChange', callback]
        ]);
    });

    it('leaves config out of a host without the config functions', () => {
        const { host } = recordingHost();
        const {
            readConfig: _read,
            writeConfig: _write,
            onConfigChange: _on,
            offConfigChange: _off,
            setConfigEventMaker: _maker,
            ...without
        } = host;
        const namespace = namespaceOf(without);

        expect('config' in namespace).toBe(false);
        expect('bossBars' in namespace).toBe(true);
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
        expect(typings).toContain('        setDisplayName(player: Player, name: string): void;');
        expect(typings).toContain('        reset(player: Player): void;');
        for (const [name, type] of Object.entries(JSPRISMARINE_TYPES)) {
            const declaration = type.kind === 'interface' ? `export interface ${name} {` : `export type ${name} =`;
            expect(typings).toContain(`    /** ${type.summary} */\n    ${declaration}`);
        }
        expect(typings).toContain('        readonly color?: BossBarColor;');
        expect(typings).toContain('        hide(): void;');
        expect(typings).toContain('        readonly maxPlayers: number;');
        expect(typings).toContain("declare module '@jsprismarine/placeholders' {");
        expect(typings).toContain("    import type { Player } from '@jsprismarine/server';");
        for (const [name, member] of Object.entries(JSPRISMARINE_PLACEHOLDERS)) {
            expect(typings).toContain(
                `    /** ${member.summary} */\n    export function ${name}(${member.parameters}): ${member.returns};`
            );
        }
        for (const [name, type] of Object.entries(JSPRISMARINE_PLACEHOLDER_TYPES)) {
            const declaration = type.kind === 'interface' ? `export interface ${name} {` : `export type ${name} =`;
            expect(typings).toContain(`    /** ${type.summary} */\n    ${declaration}`);
        }
        expect(typings).toContain(
            '        resolve(key: string, player?: MinecraftPlayer): string | number | undefined;'
        );
        expect(typings).toContain("    import type { Player as MinecraftPlayer } from '@minecraft/server';");
        expect(typings).toContain('    export type TemplateNode =\n        | { readonly text: string }');
        expect(typings).toContain('        readonly nextChangeTick?: number;');
        expect(typings).toContain('    export const config: {\n');
        expect(typings).toContain('        readonly value: unknown;');
        expect(typings).toContain('        readonly afterEvents: AddonConfigEvents;');
        expect(typings).toContain('        write(value: unknown): void;');
        expect(typings).toContain(
            '        subscribe(callback: (event: AddonConfigChangeEvent) => void): (event: AddonConfigChangeEvent) => void;'
        );
    });
});
