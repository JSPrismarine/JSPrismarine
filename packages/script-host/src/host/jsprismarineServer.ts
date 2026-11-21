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

/**
 * The name a pack imports the placeholders by. `@jsprismarine/server` holds the members that read
 * or change the running server and its players; a feature with a type vocabulary of its own, one
 * that would stand as a library by itself, gets a module of its own, and placeholders are the first.
 */
export const JSPRISMARINE_PLACEHOLDERS_MODULE = '@jsprismarine/placeholders';

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

/** One export of a module. */
export type MemberDefinition =
    /** A frozen object of plain values that stay the same for the server's whole run. */
    | {
          readonly kind: 'values';
          readonly summary: string;
          readonly properties: Readonly<Record<string, ValueProperty>>;
      }
    /** A frozen object whose properties read the server each time. */
    | { readonly kind: 'live'; readonly summary: string; readonly properties: Readonly<Record<string, LiveProperty>> }
    | ({ readonly kind: 'function' } & FunctionDefinition)
    /** A frozen object of functions, and of properties the script reads from the server. */
    | {
          readonly kind: 'methods';
          readonly summary: string;
          readonly properties?: Readonly<Record<string, InterfaceProperty>>;
          readonly methods: Readonly<Record<string, FunctionDefinition>>;
      };

/** A type a module's members take or give. */
export type TypeDefinition =
    | { readonly kind: 'union'; readonly summary: string; readonly values: readonly string[] }
    /** A type alias written in TypeScript, for a shape an interface cannot say, such as a union of objects. */
    | { readonly kind: 'alias'; readonly summary: string; readonly type: string }
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
            },
            maxPlayers: {
                type: 'number',
                summary: "How many players may be online at once, the server's `max-players` setting."
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
    },
    playerList: {
        kind: 'methods',
        summary:
            "The player list every client shows, in the pause menu. A name a pack sets there reverts when the pack's scripts stop, as on `/reload`. Chat and the name above the head keep the login name.",
        methods: {
            setDisplayName: {
                summary:
                    'Changes the name every client, and every later joiner, shows for the player in its player list, and nothing else. Throws for an empty name. Does nothing for a player who left.',
                parameters: 'player: Player, name: string',
                returns: 'void'
            },
            reset: {
                summary: "Gives the player's entry its login name back, at once rather than when the scripts stop.",
                parameters: 'player: Player',
                returns: 'void'
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

/**
 * The members of `@jsprismarine/placeholders`, by export name: the registry every pack shares.
 * Tokens such as `{player:ping}` that any pack can provide and any pack can render; a namespace
 * belongs to the pack that registered it and goes when the pack's scripts stop, as on `/reload`.
 * A host module's exports are copied when the module links, so `namespaces` is a function rather
 * than a getter.
 */
export const JSPRISMARINE_PLACEHOLDERS = {
    register: {
        kind: 'function',
        summary:
            'Registers a namespace. Throws a `TypeError` for a namespace or key that is not lowercase letters, digits and underscores starting with a letter, or for a provider with no keys, and an `Error` for a namespace that is registered already.',
        parameters: 'namespace: string, provider: PlaceholderProvider',
        returns: 'PlaceholderRegistration'
    },
    resolve: {
        kind: 'function',
        summary:
            "Replaces each `{namespace:key}` in the text with its value, for the player when one is given. A token nobody provides, or whose provider gives `undefined` or throws, stays as written, and so does any other text between braces. The watchdog's errors are the exception: a resolver that runs out of the budget ends the render.",
        parameters: 'text: string, player?: Player',
        returns: 'string'
    },
    namespaces: {
        kind: 'function',
        summary: 'Every registered namespace with its keys, oldest first, as a new frozen list each call.',
        parameters: '',
        returns: 'readonly PlaceholderNamespace[]'
    },
    parse: {
        kind: 'function',
        summary:
            'Parses the shorthand `{player:name} &7{player:ping}ms` into a template: each token a `placeholder` node, the rest `text` nodes, and `&` before a format code `§`.',
        parameters: 'shorthand: string',
        returns: 'Template'
    },
    render: {
        kind: 'function',
        summary:
            'Renders a template, or a shorthand string, for the player when one is given: the text, and the tick an animation in it next changes the text. Throws a `TypeError` for a node the renderer does not know or a condition that does not parse.',
        parameters: 'template: Template | string, player?: Player',
        returns: 'RenderedTemplate'
    }
} as const satisfies Readonly<Record<string, MemberDefinition>>;

/**
 * The types `@jsprismarine/placeholders` takes and gives. `Player` is `@jsprismarine/server`'s
 * compatibility type, what the members read of a player they are given; `MinecraftPlayer` is
 * `@minecraft/server`'s, what a provider gets, since the runtime hands it the pack's own object.
 */
export const JSPRISMARINE_PLACEHOLDER_TYPES = {
    PlaceholderProvider: {
        kind: 'interface',
        summary: 'What a pack registers for a namespace: the keys it answers, and the function that answers them.',
        properties: {
            keys: {
                type: 'readonly string[]',
                summary:
                    'The keys the provider answers, each lowercase letters, digits and underscores starting with a letter. A token with another key stays as written.'
            }
        },
        methods: {
            resolve: {
                summary:
                    "The value of one key, for the player when the text is rendered for one: the pack's own `Player` of `@minecraft/server`, with every member it has. A number renders through `String()`. `undefined` leaves the token as written, and so does a throw, which the content log reports once per namespace. It runs inside the budget of the script that renders, and the watchdog's errors end the render rather than leaving the token.",
                parameters: 'key: string, player?: MinecraftPlayer',
                returns: 'string | number | undefined'
            }
        }
    },
    PlaceholderRegistration: {
        kind: 'interface',
        summary: 'A namespace a pack registered.',
        properties: {},
        methods: {
            unregister: {
                summary:
                    "Takes the namespace out of the registry, so its tokens stay as written. A pack's namespaces go on their own when its scripts stop.",
                parameters: '',
                returns: 'void'
            }
        }
    },
    PlaceholderNamespace: {
        kind: 'interface',
        summary: 'One registered namespace.',
        properties: {
            namespace: { type: 'string', summary: 'Its name, the part of a token before the colon.' },
            keys: { type: 'readonly string[]', summary: 'The keys its provider answers.' }
        }
    },
    Template: {
        kind: 'interface',
        summary:
            "A template: a tree in the shape of Bedrock's rawtext, the format `/tellraw` takes, with a few more node kinds. `placeholders.parse` makes one from shorthand, and a file or a script can hold one.",
        properties: { rawtext: { type: 'readonly TemplateNode[]', summary: 'The nodes, rendered in order.' } }
    },
    TemplateNode: {
        kind: 'alias',
        summary:
            "One node of a template: a `text`; a `placeholder` named `namespace:key`; an `if` with a condition over placeholders and literals (`==`, `!=`, `<`, `<=`, `>`, `>=`, `contains`, `startsWith`, joined by `&&` and `||`, with parentheses; two sides that both parse as numbers compare as numbers) and its `then` and `else` nodes; an `animate` with `frames` and an `interval` in ticks; a `gradient` with `#rrggbb` colors over its `rawtext`, each character in the nearest `§` color; and rawtext's `translate`, which renders as its key, `score`, which reads the scoreboard, and `selector`, which reads as the names of the entities the server's selector grammar matches, so `@a[tag=vip]` works. A bare string is a `text` node.",
        type: [
            '',
            '        | { readonly text: string }',
            '        | { readonly placeholder: string }',
            '        | { readonly if: string; readonly then: readonly TemplateNode[]; readonly else?: readonly TemplateNode[] }',
            '        | { readonly animate: { readonly interval: number; readonly frames: readonly (readonly TemplateNode[])[] } }',
            '        | { readonly gradient: { readonly colors: readonly string[]; readonly rawtext: readonly TemplateNode[] } }',
            '        | { readonly translate: string; readonly with?: readonly string[] | Template }',
            '        | { readonly score: { readonly name: string; readonly objective: string } }',
            '        | { readonly selector: string }',
            '        | string'
        ].join('\n')
    },
    RenderedTemplate: {
        kind: 'interface',
        summary: 'What `placeholders.render` gave.',
        properties: {
            text: { type: 'string', summary: 'The rendered text.' },
            nextChangeTick: {
                type: 'number',
                optional: true,
                summary:
                    'The tick at which an animation in the template next changes the text, so a consumer that refreshes on an interval renders again then. Absent when the template holds no animation with more than one frame.'
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
export const JSPRISMARINE_HOST_FUNCTIONS = [
    'read',
    'ping',
    'showBar',
    'updateBar',
    'hideBar',
    'barValid',
    'setListName',
    'resetListName'
] as const;

/**
 * The functions `@jsprismarine/placeholders` calls, which the embedder makes in the pack's
 * context: `host.namespaces()` answers the registered namespaces as JSON, `host.parseTemplate` and
 * `host.renderTemplate` take and give templates as JSON, and the others are named for what they
 * do.
 */
export const JSPRISMARINE_PLACEHOLDERS_HOST_FUNCTIONS = [
    'register',
    'unregister',
    'resolve',
    'namespaces',
    'parseTemplate',
    'renderTemplate'
] as const;

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
    ].join('\n'),
    playerList: [
        'freeze({',
        '    setDisplayName: (player, name) => host.setListName(player, name),',
        '    reset: (player) => host.resetListName(player)',
        '})'
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

/**
 * The script that evaluates to a function making the `@jsprismarine/placeholders` namespace, run
 * in the pack's context with an object of the {@link JSPRISMARINE_PLACEHOLDERS_HOST_FUNCTIONS}.
 * @returns A script whose value is that function. The namespace and every object in it are frozen.
 */
export const placeholdersModuleSource = (): string =>
    [
        '((host) => {',
        '    const freeze = Object.freeze;',
        '    const parse = JSON.parse;',
        '    const stringify = JSON.stringify;',
        '    const deepFreeze = (value) => {',
        '        if (typeof value === "object" && value !== null) {',
        '            for (const key of Object.keys(value)) deepFreeze(value[key]);',
        '            freeze(value);',
        '        }',
        '        return value;',
        '    };',
        '    return freeze({',
        '        register: (namespace, provider) => {',
        '            const id = host.register(namespace, provider);',
        '            return freeze({ unregister() { host.unregister(id); } });',
        '        },',
        '        resolve: (text, player) => host.resolve(text, player),',
        '        namespaces: () =>',
        '            freeze(parse(host.namespaces()).map(({ namespace, keys }) => freeze({ namespace, keys: freeze(keys) }))),',
        '        parse: (shorthand) => deepFreeze(parse(host.parseTemplate(shorthand))),',
        '        render: (template, player) => {',
        '            const shorthand = typeof template === "string";',
        '            return deepFreeze(parse(host.renderTemplate(shorthand ? template : stringify(template), shorthand, player)));',
        '        }',
        '    });',
        '})'
    ].join('\n');

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
            ? (member.properties ?? {})
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
    if (type.kind === 'alias') return [comment, `    export type ${name} =${type.type};`];
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
/** The lines of one module's ambient declaration. */
const moduleLines = (
    name: string,
    summary: readonly string[],
    members: Readonly<Record<string, MemberDefinition>>,
    types: Readonly<Record<string, TypeDefinition>>,
    imports: readonly string[] = []
): string[] => [
    '/**',
    ...summary.map((line) => ` * ${line}`.trimEnd()),
    ' */',
    `declare module '${name}' {`,
    ...imports.map((line) => `    ${line}`),
    ...Object.entries(members).flatMap(([member, definition]) => memberLines(member, definition)),
    ...Object.entries(types).flatMap(([type, definition]) => typeLines(type, definition)),
    '}'
];

/**
 * The declarations a pack's TypeScript sees for `@jsprismarine/server` and
 * `@jsprismarine/placeholders`: one ambient module each, so a project that names the typings
 * package in its `types` gets them for the module names.
 * @returns The contents of the typings package's `index.d.ts`.
 */
export const jsprismarineServerTypings = (): string =>
    [
        '// Generated from packages/script-host/src/host/jsprismarineServer.ts by the build of',
        '// @jsprismarine/script-types. Edit the definition there, not this file.',
        '',
        ...moduleLines(
            JSPRISMARINE_MODULE,
            [
                'The JSPrismarine-only module. Leave it out of the manifest and load it with',
                "`await import('@jsprismarine/server')` inside `try`: on Bedrock Dedicated Server the import",
                'rejects, and the pack takes its fallback.'
            ],
            JSPRISMARINE_SERVER,
            JSPRISMARINE_TYPES
        ),
        '',
        ...moduleLines(
            JSPRISMARINE_PLACEHOLDERS_MODULE,
            [
                'The placeholder registry every pack shares. Load it as `@jsprismarine/server`:',
                "`await import('@jsprismarine/placeholders')` inside `try`, since Bedrock Dedicated Server",
                'rejects the import.'
            ],
            JSPRISMARINE_PLACEHOLDERS,
            JSPRISMARINE_PLACEHOLDER_TYPES,
            [
                "import type { Player } from '@jsprismarine/server';",
                "import type { Player as MinecraftPlayer } from '@minecraft/server';"
            ]
        ),
        ''
    ].join('\n');
