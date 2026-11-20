/**
 * `@jsprismarine/server`, the native module a pack imports for what only JSPrismarine has
 * ([ADR 0020](../../../../docs/adr/0020-scripts-run-in-quickjs-on-the-world-thread.md)).
 *
 * {@link JSPRISMARINE_SERVER} and {@link JSPRISMARINE_TYPES} define its members and the types
 * they take once. The runtime builds each pack's namespace from them, and the typings package
 * `@jsprismarine/script-types` emits its declarations from them with
 * {@link jsprismarineServerTypings}, so the module and its types cannot drift apart.
 *
 * This file imports nothing, so the typings build can load it with Node's type stripping.
 */

/** The name a pack imports the module by. */
export const JSPRISMARINE_MODULE = '@jsprismarine/server';

/** A property of an object of plain values that stay the same while the server runs. */
interface ValueProperty {
    readonly type: 'string' | 'number';
    /** Its documentation, which the typings carry. */
    readonly summary: string;
    /** Its value when it is the same on every server; the embedder supplies the others. */
    readonly value?: string;
}

/** A property the server answers each time a script reads it. */
interface LiveProperty {
    /** A number, or a frozen list of them. */
    readonly type: 'number' | 'numbers';
    readonly summary: string;
}

/** A function or a method: its TypeScript parameters and return type. */
interface FunctionDefinition {
    readonly summary: string;
    /** The parameter list as TypeScript writes it, without the parentheses. */
    readonly parameters: string;
    readonly returns: string;
}

/** A property of an interface the module declares, typed in TypeScript. */
interface InterfaceProperty {
    readonly type: string;
    readonly summary: string;
    readonly optional?: true;
}

/** One export of the module. */
type MemberDefinition =
    /** A frozen object of plain values that stay the same for the server's whole run. */
    | {
          readonly kind: 'values';
          readonly summary: string;
          readonly properties: Readonly<Record<string, ValueProperty>>;
      }
    /** A frozen object whose properties read the server each time. */
    | { readonly kind: 'live'; readonly summary: string; readonly properties: Readonly<Record<string, LiveProperty>> }
    | ({ readonly kind: 'function' } & FunctionDefinition)
    /** A frozen object of functions. */
    | {
          readonly kind: 'methods';
          readonly summary: string;
          readonly methods: Readonly<Record<string, FunctionDefinition>>;
      };

/** A type the module's members take or give. */
type TypeDefinition =
    | { readonly kind: 'union'; readonly summary: string; readonly values: readonly string[] }
    | {
          readonly kind: 'interface';
          readonly summary: string;
          readonly properties: Readonly<Record<string, InterfaceProperty>>;
          readonly methods?: Readonly<Record<string, FunctionDefinition>>;
      };

/**
 * The members of `@jsprismarine/server`, by export name. `jsprismarine` holds plain values that
 * stay the same for the server's whole run. The others reach the running server, and a server
 * that cannot give them leaves them out, so a pack checks for one with `in` before it uses it.
 */
export const JSPRISMARINE_SERVER = {
    jsprismarine: {
        kind: 'values',
        summary: 'The server the pack runs on.',
        properties: {
            name: { type: 'string', value: 'JSPrismarine', summary: 'The server software, always `JSPrismarine`.' },
            version: {
                type: 'string',
                summary: 'The JSPrismarine version, such as `0.22.0`, without a leading `v`.'
            },
            minecraftVersion: {
                type: 'string',
                summary: 'The newest Minecraft Bedrock release the server speaks, the one it advertises.'
            },
            protocolVersion: {
                type: 'number',
                summary: 'The Bedrock network protocol version of `minecraftVersion`.'
            }
        }
    },
    performance: {
        kind: 'live',
        summary: 'How fast the server ticks. Each property reads the server when the script reads it.',
        properties: {
            tps: {
                type: 'number',
                summary:
                    'Ticks per second over the last second. The server aims for 20, and runs above it while it catches up.'
            },
            tpsAverages: {
                type: 'numbers',
                summary: 'Ticks per second averaged over the windows `/tps` reports, shortest first.'
            },
            lastTickMs: {
                type: 'number',
                summary:
                    "How long the last tick's work took, in milliseconds, without the wait before the next tick. Zero before the first tick."
            },
            averageTickMs: {
                type: 'number',
                summary:
                    "How long a tick's work has taken lately, in milliseconds, as a moving average over the recent ticks. Zero before the first tick."
            }
        }
    },
    getPing: {
        kind: 'function',
        summary:
            "The player's round trip time in milliseconds, or `undefined` while their connection has no sample, after they leave, or when their transport measures none.",
        parameters: 'player: Player',
        returns: 'number | undefined'
    },
    bossBars: {
        kind: 'methods',
        summary:
            "Boss bars on one player's screen. A bar belongs to the pack that showed it and goes away when the player leaves or the pack's scripts stop, as on `/reload`.",
        methods: {
            show: {
                summary:
                    'Shows a boss bar to one player. A player sees the bar shown last, and the one before it again once that one is hidden. A bar for a player who left is never valid.',
                parameters: 'player: Player, options?: BossBarOptions',
                returns: 'BossBar'
            }
        }
    }
} as const satisfies Readonly<Record<string, MemberDefinition>>;

/** The types the members take and give, by the name the declarations give them. */
export const JSPRISMARINE_TYPES = {
    Player: {
        kind: 'interface',
        summary:
            "A `Player` from `@minecraft/server`. The members take only a real one; this names what they read, so the pack's own `Player` type fits.",
        properties: { id: { type: 'string', summary: "The player's entity id." } }
    },
    BossBarColor: {
        kind: 'union',
        summary: "A boss bar's color.",
        values: ['pink', 'blue', 'red', 'green', 'yellow', 'purple', 'rebeccaPurple', 'white']
    },
    BossBarOptions: {
        kind: 'interface',
        summary: 'What a boss bar shows.',
        properties: {
            text: {
                type: 'string',
                optional: true,
                summary: 'The title above the bar. Empty when a bar is shown without it.'
            },
            progress: {
                type: 'number',
                optional: true,
                summary: 'How full the bar is, from 0 to 1, clamped to that range. Full when a bar is shown without it.'
            },
            color: {
                type: 'BossBarColor',
                optional: true,
                summary: "The bar's color. Pink when a bar is shown without it."
            }
        }
    },
    BossBar: {
        kind: 'interface',
        summary: "A boss bar on one player's screen.",
        properties: {
            player: { type: 'Player', summary: 'The player who sees the bar.' },
            isValid: {
                type: 'boolean',
                summary:
                    "Whether the bar is still there: false once it is hidden, once the player leaves and once the pack's scripts stop."
            }
        },
        methods: {
            update: {
                summary:
                    'Changes what the bar shows. A property the options leave out keeps its value. Does nothing to a bar that is no longer valid.',
                parameters: 'options: BossBarOptions',
                returns: 'void'
            },
            hide: {
                summary: 'Takes the bar off the screen for good. Does nothing to a bar that is no longer valid.',
                parameters: '',
                returns: 'void'
            }
        }
    }
} as const satisfies Readonly<Record<string, TypeDefinition>>;

/** A boss bar color as a script names it. */
export type JsprismarineBossBarColor = (typeof JSPRISMARINE_TYPES)['BossBarColor']['values'][number];

type ServerProperties = (typeof JSPRISMARINE_SERVER)['jsprismarine']['properties'];

/**
 * What the embedder tells `@jsprismarine/server` about the server: every property of
 * `jsprismarine` without a fixed value, typed as the module declares it.
 */
export type JsprismarineServerInfo = {
    readonly [
        Key in keyof ServerProperties as ServerProperties[Key] extends { readonly value: string } ? never : Key
    ]: ServerProperties[Key]['type'] extends 'number' ? number : string;
};

/** The members that reach the running server. */
type LiveMember = {
    [Name in keyof typeof JSPRISMARINE_SERVER]: (typeof JSPRISMARINE_SERVER)[Name]['kind'] extends 'values'
        ? never
        : Name;
}[keyof typeof JSPRISMARINE_SERVER];

/** The functions the namespace's live members call, which the embedder makes in the pack's context. */
export const JSPRISMARINE_HOST_FUNCTIONS = ['read', 'ping', 'showBar', 'updateBar', 'hideBar', 'barValid'] as const;

/**
 * The script of each member that calls the host, as an expression over `host` and `freeze`:
 * `host.read(name, index)` answers a property of `performance`, one entry of a list at a time,
 * and the others are named for what they do.
 */
const CALLABLE_SOURCES: Readonly<Record<Exclude<LiveMember, 'performance'>, string>> = {
    getPing: 'freeze((player) => host.ping(player))',
    bossBars: [
        '(() => {',
        '    const bar = (id, player) => freeze({',
        '        get player() { return player; },',
        '        get isValid() { return host.barValid(id); },',
        '        update(options) { host.updateBar(id, options); },',
        '        hide() { host.hideBar(id); }',
        '    });',
        '    return freeze({ show: (player, options) => bar(host.showBar(player, options), player) });',
        '})()'
    ].join('\n')
};

/** The getters of a member whose properties read the server, each through `host.read`. */
const liveSource = (properties: Readonly<Record<string, LiveProperty>>): string => {
    const getters = Object.entries(properties).map(([key, property]) => {
        const name = JSON.stringify(key);
        const body =
            property.type === 'number'
                ? `return host.read(${name});`
                : `const list = []; for (let index = 0; ; index++) { const value = host.read(${name}, index); if (value === undefined) return freeze(list); list.push(value); }`;
        return `get ${name}() { ${body} }`;
    });
    return `freeze({ ${getters.join(', ')} })`;
};

/**
 * The script that evaluates to a function making the module's namespace, run in the pack's
 * context. Called with nothing, the function makes `jsprismarine` alone; called with an object of
 * the {@link JSPRISMARINE_HOST_FUNCTIONS}, it adds the members that reach the running server.
 * @param info - The server the pack runs on.
 * @returns A script whose value is that function. The namespace and every object in it are frozen.
 */
export const jsprismarineServerSource = (info: JsprismarineServerInfo): string => {
    const supplied: Readonly<Record<string, string | number>> = info;
    const callable: Readonly<Record<string, string | undefined>> = CALLABLE_SOURCES;
    const members = Object.entries(JSPRISMARINE_SERVER).map(([name, member]) => {
        const key = JSON.stringify(name);
        if (member.kind === 'values') {
            const values = Object.fromEntries(
                Object.entries(member.properties).map(([property, definition]) => [
                    property,
                    'value' in definition ? definition.value : supplied[property]
                ])
            );
            return `    namespace[${key}] = freeze(${JSON.stringify(values)});`;
        }
        const source = member.kind === 'live' ? liveSource(member.properties) : callable[name];
        return `    if (host !== undefined) namespace[${key}] = ${source};`;
    });
    return [
        '((host) => {',
        '    const freeze = Object.freeze;',
        '    const namespace = {};',
        ...members,
        '    return freeze(namespace);',
        '})'
    ].join('\n');
};

const docComment = (summary: string, indent: string): string => `${indent}/** ${summary} */`;

/** The declaration lines of an object's properties and methods, at an indent. */
const propertyLines = (
    properties: Readonly<Record<string, { readonly summary: string; readonly type: string; readonly optional?: true }>>,
    methods: Readonly<Record<string, FunctionDefinition>>,
    indent: string
): string[] => [
    ...Object.entries(properties).flatMap(([key, property]) => [
        docComment(property.summary, indent),
        `${indent}readonly ${key}${property.optional === true ? '?' : ''}: ${property.type};`
    ]),
    ...Object.entries(methods).flatMap(([key, method]) => [
        docComment(method.summary, indent),
        `${indent}${key}(${method.parameters}): ${method.returns};`
    ])
];

/** The TypeScript type of a property a member declares. */
const propertyType = (property: ValueProperty | LiveProperty): string => {
    if ('value' in property) return JSON.stringify(property.value);
    return property.type === 'numbers' ? 'readonly number[]' : property.type;
};

/** The declaration lines of one member. */
const memberLines = (name: string, member: MemberDefinition): string[] => {
    const comment = docComment(member.summary, '    ');
    if (member.kind === 'function') {
        return [comment, `    export function ${name}(${member.parameters}): ${member.returns};`];
    }
    const properties: Readonly<Record<string, { readonly summary: string; readonly type: string }>> =
        member.kind === 'methods'
            ? {}
            : Object.fromEntries(
                  Object.entries<ValueProperty | LiveProperty>(member.properties).map(([key, property]) => [
                      key,
                      { summary: property.summary, type: propertyType(property) }
                  ])
              );
    const methods = member.kind === 'methods' ? member.methods : {};
    return [comment, `    export const ${name}: {`, ...propertyLines(properties, methods, '        '), '    };'];
};

/** The declaration lines of one type. */
const typeLines = (name: string, type: TypeDefinition): string[] => {
    const comment = docComment(type.summary, '    ');
    if (type.kind === 'union') {
        return [comment, `    export type ${name} = ${type.values.map((value) => JSON.stringify(value)).join(' | ')};`];
    }
    return [
        comment,
        `    export interface ${name} {`,
        ...propertyLines(type.properties, type.methods ?? {}, '        '),
        '    }'
    ];
};

/**
 * The declarations a pack's TypeScript sees for `@jsprismarine/server`: one ambient module, so a
 * project that names the typings package in its `types` gets them for the module name.
 * @returns The contents of the typings package's `index.d.ts`.
 */
export const jsprismarineServerTypings = (): string => {
    const members = Object.entries<MemberDefinition>(JSPRISMARINE_SERVER).flatMap(([name, member]) =>
        memberLines(name, member)
    );
    const types = Object.entries<TypeDefinition>(JSPRISMARINE_TYPES).flatMap(([name, type]) => typeLines(name, type));
    return [
        '// Generated from packages/script-host/src/host/jsprismarineServer.ts by the build of',
        '// @jsprismarine/script-types. Edit the definition there, not this file.',
        '',
        '/**',
        ' * The JSPrismarine-only module. Leave it out of the manifest and load it with',
        " * `await import('@jsprismarine/server')` inside `try`: on Bedrock Dedicated Server the import",
        ' * rejects, and the pack takes its fallback.',
        ' */',
        `declare module '${JSPRISMARINE_MODULE}' {`,
        ...members,
        ...types,
        '}',
        ''
    ].join('\n');
};
