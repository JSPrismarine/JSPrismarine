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
    /** A frozen object of functions, and of properties the script reads from the server. */
    | {
          readonly kind: 'methods';
          readonly summary: string;
          readonly properties?: Readonly<Record<string, InterfaceProperty>>;
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
    placeholders: {
        kind: 'methods',
        summary:
            "Tokens such as `{player:ping}` that any pack can provide and any pack can render. A namespace belongs to the pack that registered it and goes when the pack's scripts stop, as on `/reload`.",
        properties: {
            namespaces: {
                type: 'readonly PlaceholderNamespace[]',
                summary: 'Every registered namespace with its keys, oldest first, as a new frozen list each read.'
            }
        },
        methods: {
            register: {
                summary:
                    'Registers a namespace. Throws a `TypeError` for a namespace or key that is not lowercase letters, digits and underscores starting with a letter, or for a provider with no keys, and an `Error` for a namespace that is registered already.',
                parameters: 'namespace: string, provider: PlaceholderProvider',
                returns: 'PlaceholderRegistration'
            },
            resolve: {
                summary:
                    'Replaces each `{namespace:key}` in the text with its value, for the player when one is given. A token nobody provides, or whose provider gives `undefined` or throws, stays as written, and so does any other text between braces.',
                parameters: 'text: string, player?: Player',
                returns: 'string'
            }
        }
    },
    permissions: {
        kind: 'methods',
        summary:
            'The groups, nodes and meta of `permissions.json`, resolved as the server resolves them for a command. A write persists to the file as `/perms` would, and `afterEvents.permissionsChange` fires after any write, from a script, `/perms`, `/op` or an edit of the file.',
        properties: {
            afterEvents: {
                type: 'PermissionsAfterEvents',
                summary: 'The events the permission files raise.'
            }
        },
        methods: {
            has: {
                summary:
                    "Whether the player holds the node after resolution: their own nodes, then their groups heaviest first and each group's parents, where a specific node beats a wildcard and a negation wins a tie. An operator holds every node.",
                parameters: 'player: Player, node: string',
                returns: 'boolean'
            },
            groupsOf: {
                summary:
                    "The groups the player holds directly, heaviest first, `default` and an operator's `operator` included.",
                parameters: 'player: Player',
                returns: 'readonly string[]'
            },
            primaryGroupOf: {
                summary: 'The heaviest group the player holds directly, or `default`.',
                parameters: 'player: Player',
                returns: 'string'
            },
            metaOf: {
                summary:
                    "The resolved value of a meta key such as `prefix`, `suffix` or `level`: the player's own, then their groups' in resolution order. `undefined` when nothing sets it.",
                parameters: 'player: Player, key: string',
                returns: 'string | undefined'
            },
            grant: {
                summary:
                    'Adds a node to a player, or to a group named by its name. Throws a `RangeError` for a node not spelled as `scope.name`, `scope.*` or `*` with at most one leading `-`, or for an expiry that is not an ISO 8601 instant in the future, and an `Error` for a group the file does not have.',
                parameters: 'subject: Player | string, node: string, expires?: string',
                returns: 'void'
            },
            revoke: {
                summary:
                    'Removes a node from a player, or from a group named by its name. Does nothing when they do not have it.',
                parameters: 'subject: Player | string, node: string',
                returns: 'void'
            },
            addToGroup: {
                summary:
                    'Adds a player to a group, until `expires` when one is given. Throws an `Error` for a group the file does not have.',
                parameters: 'player: Player, group: string, expires?: string',
                returns: 'void'
            },
            removeFromGroup: {
                summary: 'Removes a player from a group. Does nothing when they are not in it.',
                parameters: 'player: Player, group: string',
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
    },
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
                    'The value of one key, for the player when the text is rendered for one. A number renders through `String()`. `undefined` leaves the token as written, and so does a throw, which the content log reports once per namespace. It runs inside the budget of the script that renders.',
                parameters: 'key: string, player?: Player',
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
    PermissionsAfterEvents: {
        kind: 'interface',
        summary: 'The events the permission files raise, after the fact.',
        properties: {
            permissionsChange: {
                type: 'PermissionsChangeSignal',
                summary:
                    'Fires after any write to the permission files, whoever made it, and after the files are read again on `/reload` or a change on disk.'
            }
        }
    },
    PermissionsChangeSignal: {
        kind: 'interface',
        summary: 'Where a pack subscribes to permission changes.',
        properties: {},
        methods: {
            subscribe: {
                summary:
                    "Calls `callback` after each change, with the player and the group it touched, and returns the callback. A pack's subscriptions end when its scripts stop.",
                parameters: 'callback: (event: PermissionsChangeEvent) => void',
                returns: '(event: PermissionsChangeEvent) => void'
            },
            unsubscribe: {
                summary: 'Stops calling a callback `subscribe` returned.',
                parameters: 'callback: (event: PermissionsChangeEvent) => void',
                returns: 'void'
            }
        }
    },
    PermissionsChangeEvent: {
        kind: 'interface',
        summary: 'What a permission change touched. Both are absent after a reload, which may have changed anything.',
        properties: {
            player: {
                type: 'Player',
                optional: true,
                summary: 'The player whose own record or operator status changed, when they are online.'
            },
            group: { type: 'string', optional: true, summary: 'The group that changed.' }
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
    'register',
    'unregister',
    'resolve',
    'namespaces',
    'hasPermission',
    'groupsOf',
    'primaryGroupOf',
    'metaOf',
    'grant',
    'revoke',
    'addToGroup',
    'removeFromGroup',
    'onPermissionsChange'
] as const;

/**
 * The script of each member that calls the host, as an expression over `host` and `freeze`:
 * `host.read(name, index)` answers a property of `performance`, one entry of a list at a time,
 * `host.namespaces()` answers the registered namespaces as JSON, `host.groupsOf(player)` a
 * player's groups as JSON, `host.onPermissionsChange(dispatch)` keeps the function the host calls
 * with each change's player and group, and the others are named for what they do.
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
    placeholders: [
        '(() => {',
        '    const parse = JSON.parse;',
        '    const namespaces = () =>',
        '        freeze(parse(host.namespaces()).map(({ namespace, keys }) => freeze({ namespace, keys: freeze(keys) })));',
        '    return freeze({',
        '        register: (namespace, provider) => {',
        '            const id = host.register(namespace, provider);',
        '            return freeze({ unregister() { host.unregister(id); } });',
        '        },',
        '        resolve: (text, player) => host.resolve(text, player),',
        '        get namespaces() { return namespaces(); }',
        '    });',
        '})()'
    ].join('\n'),
    permissions: [
        '(() => {',
        '    const subscribers = new Set();',
        '    host.onPermissionsChange((player, group) => {',
        '        const event = freeze({ player, group });',
        '        for (const callback of [...subscribers]) callback(event);',
        '    });',
        '    const permissionsChange = freeze({',
        '        subscribe(callback) { subscribers.add(callback); return callback; },',
        '        unsubscribe(callback) { subscribers.delete(callback); }',
        '    });',
        '    return freeze({',
        '        has: (player, node) => host.hasPermission(player, node),',
        '        groupsOf: (player) => freeze(JSON.parse(host.groupsOf(player))),',
        '        primaryGroupOf: (player) => host.primaryGroupOf(player),',
        '        metaOf: (player, key) => host.metaOf(player, key),',
        '        grant: (subject, node, expires) => host.grant(subject, node, expires),',
        '        revoke: (subject, node) => host.revoke(subject, node),',
        '        addToGroup: (player, group, expires) => host.addToGroup(player, group, expires),',
        '        removeFromGroup: (player, group) => host.removeFromGroup(player, group),',
        '        afterEvents: freeze({ permissionsChange })',
        '    });',
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

/** The host functions behind `permissions`, installed only on a server that has the permission files. */
export const PERMISSION_HOST_FUNCTIONS = [
    'hasPermission',
    'groupsOf',
    'primaryGroupOf',
    'metaOf',
    'grant',
    'revoke',
    'addToGroup',
    'removeFromGroup',
    'onPermissionsChange'
] as const satisfies readonly (typeof JSPRISMARINE_HOST_FUNCTIONS)[number][];

/**
 * The host function a member needs, when a host may lack it: a server that cannot give the member
 * installs none of its functions, and the module leaves the member out as an older server would.
 */
const MEMBER_HOST_FUNCTION: Readonly<Partial<Record<LiveMember, (typeof JSPRISMARINE_HOST_FUNCTIONS)[number]>>> = {
    permissions: 'hasPermission'
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
    const needs: Readonly<Record<string, string | undefined>> = MEMBER_HOST_FUNCTION;
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
        const required = needs[name];
        const condition =
            required === undefined ? 'host !== undefined' : `host !== undefined && ${JSON.stringify(required)} in host`;
        return `    if (${condition}) namespace[${key}] = ${source};`;
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
