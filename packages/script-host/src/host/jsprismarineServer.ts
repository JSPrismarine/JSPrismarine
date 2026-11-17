/**
 * `@jsprismarine/server`, the native module a pack imports for what only JSPrismarine has
 * ([ADR 0020](../../../../docs/adr/0020-scripts-run-in-quickjs-on-the-world-thread.md)).
 *
 * {@link JSPRISMARINE_SERVER} defines its members once. The runtime builds each pack's namespace
 * from it, and the typings package `@jsprismarine/script-types` emits its declarations from it
 * with {@link jsprismarineServerTypings}, so the module and its types cannot drift apart.
 *
 * This file imports nothing, so the typings build can load it with Node's type stripping.
 */

/** The name a pack imports the module by. */
export const JSPRISMARINE_MODULE = '@jsprismarine/server';

/** One property of an object the module exports. */
interface PropertyDefinition {
    readonly type: 'string' | 'number';
    /** Its documentation, which the typings carry. */
    readonly summary: string;
    /** Its value when it is the same on every server; the embedder supplies the others. */
    readonly value?: string;
}

/** An object the module exports, frozen, with properties of plain values. */
interface ObjectDefinition {
    readonly summary: string;
    readonly properties: Readonly<Record<string, PropertyDefinition>>;
}

/**
 * The members of `@jsprismarine/server`, by export name. Each export is a frozen object of plain
 * values that stay the same for the server's whole run, so a pack reads nothing that differs
 * between two runs of the same build.
 */
export const JSPRISMARINE_SERVER = {
    jsprismarine: {
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
    }
} as const satisfies Readonly<Record<string, ObjectDefinition>>;

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

/**
 * The script that evaluates to the module's namespace object, run in the pack's context.
 * @param info - The server the pack runs on.
 * @returns A script whose value is the namespace, its exports and their objects frozen.
 */
export const jsprismarineServerSource = (info: JsprismarineServerInfo): string => {
    const supplied: Readonly<Record<string, string | number>> = info;
    const members = Object.entries(JSPRISMARINE_SERVER).map(([name, member]) => {
        const values = Object.fromEntries(
            Object.entries(member.properties).map(([key, property]) => [
                key,
                'value' in property ? property.value : supplied[key]
            ])
        );
        return `${JSON.stringify(name)}: Object.freeze(${JSON.stringify(values)})`;
    });
    return `Object.freeze({ ${members.join(', ')} })`;
};

const docComment = (summary: string, indent: string): string => `${indent}/** ${summary} */`;

/**
 * The declarations a pack's TypeScript sees for `@jsprismarine/server`: one ambient module, so a
 * project that names the typings package in its `types` gets them for the module name.
 * @returns The contents of the typings package's `index.d.ts`.
 */
export const jsprismarineServerTypings = (): string => {
    const members = Object.entries(JSPRISMARINE_SERVER).flatMap(([name, member]) => [
        docComment(member.summary, '    '),
        `    export const ${name}: {`,
        ...Object.entries(member.properties).flatMap(([key, property]) => [
            docComment(property.summary, '        '),
            `        readonly ${key}: ${'value' in property ? JSON.stringify(property.value) : property.type};`
        ]),
        '    };'
    ]);
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
        '}',
        ''
    ].join('\n');
};
