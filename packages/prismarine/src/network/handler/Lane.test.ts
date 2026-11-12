import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
    BindingElement,
    Identifier,
    ImportDeclaration,
    Node,
    ParameterDeclaration,
    PropertyAccessExpression,
    VariableDeclaration
} from 'tsc-ts/api';
import { getTextOfNode, parseSourceFile, SyntaxKind, walkPreorder } from 'tsc-ts/api';
import { describe, expect, it } from 'vitest';

import { Logger } from '@jsprismarine/logger';
import { reportProgress } from '../../../../../.test/reportProgress';
import PacketHandlerRegistry from '../PacketHandlerRegistry';
import type { Lane } from '@jsprismarine/protocol/handler/Lane';
import { LANES, strictestLane } from '@jsprismarine/protocol/handler/Lane';

const here = fileURLToPath(new URL('.', import.meta.url));

const registeredHandlers = async () => {
    const logger = new Logger();
    const registry = new PacketHandlerRegistry({ getLogger: () => logger });
    await registry.enable();
    return [...registry.getHandlers().values()];
};

const isIdentifier = (node: Node): node is Identifier => node.kind === SyntaxKind.Identifier;
const isPropertyAccess = (node: Node): node is PropertyAccessExpression =>
    node.kind === SyntaxKind.PropertyAccessExpression;
const isImport = (node: Node): node is ImportDeclaration => node.kind === SyntaxKind.ImportDeclaration;
const isParameter = (node: Node): node is ParameterDeclaration => node.kind === SyntaxKind.Parameter;
const isBindingElement = (node: Node): node is BindingElement => node.kind === SyntaxKind.BindingElement;
const isVariableDeclaration = (node: Node): node is VariableDeclaration => node.kind === SyntaxKind.VariableDeclaration;

/**
 * Modules a connection-lane handler may import: the protocol, plain Bedrock enums, codecs and
 * the handler interfaces. `../../` is the package barrel, allowed for type imports only.
 */
const CONNECTION_IMPORTS: readonly RegExp[] = [
    /^@jsprismarine\/protocol(\/|$)/,
    /^@jsprismarine\/minecraft$/,
    /^\.\.\/PlayerSession$/,
    /^\.\.\/ClientConnection$/,
    /^\.\.\/codec\/CodecRegistry$/,
    /^\.\/(PacketHandler|ConnectionContext|SessionHandler|HandlerContext)$/
];

/**
 * What a connection-lane handler may call on its session. Every `PlayerSession` method listed
 * was traced to state the session owns, and `identity` and `runtimeId` are fixed for the
 * session: `setClientCacheEnabled` and `handleClientCacheBlobStatus` touch only the session's
 * blob cache.
 */
const SESSION_MEMBERS: ReadonlySet<string> = new Set([
    'getPlayer',
    'identity',
    'runtimeId',
    'getConnection',
    'setClientCacheEnabled',
    'handleClientCacheBlobStatus'
]);
/** `ClientConnection` members that reach the player, and through it the world. */
const CONNECTION_WORLD_MEMBERS: ReadonlySet<string> = new Set([
    'closePlayerSession',
    'getPlayerSession',
    'resumeLogin'
]);
/** The player's identity, fixed for the session; nothing else of the player may be read. */
const PLAYER_IDENTITY: ReadonlySet<string> = new Set(['getName', 'getRuntimeId']);

/**
 * Connection-lane handlers that still reach the world, and why they are in that lane anyway.
 * ADR 0014 keeps login I/O out of the tick; its result is to enter the world as an input.
 * The test fails when one of these stops reaching the world, so the list only shrinks.
 */
const KNOWN_WORLD_ACCESS: ReadonlyMap<string, string> = new Map([
    [
        'LoginHandler',
        "admission builds the player in front of the join, through its context's `login.players`, and kicks a duplicate"
    ],
    ['ClientToServerHandshakeHandler', 'resumes the login admission after encryption starts']
]);

/** Name of the member a property access reads, when it is a plain identifier. */
const memberName = (access: PropertyAccessExpression): string | null =>
    isIdentifier(access.name) ? access.name.text : null;

/**
 * The handler contexts, each with the member that holds what the handler's packet arrived on:
 * a session's `session`, and the `connection` of a connection that has no session yet.
 */
const CONTEXT_TYPES: ReadonlyMap<string, readonly [member: string, kind: string]> = new Map([
    ['SessionContext', ['session', 'PlayerSession']],
    ['InputContext', ['session', 'PlayerSession']],
    ['ConnectionContext', ['connection', 'ClientConnection']]
]);

/**
 * The parameter kind a `PlayerSession` or `ClientConnection` annotation names. A
 * context parameter is its context type, and the `session` or `connection` destructured from one
 * a `PlayerSession` or a `ClientConnection`.
 */
const parameterKinds = (root: Node): Map<string, string> => {
    const kinds = new Map<string, string>();
    walkPreorder(root, (node) => {
        if (!isParameter(node) || node.type === undefined) return;
        const type = getTextOfNode(node.type);
        const held = CONTEXT_TYPES.get(type);
        if (!isIdentifier(node.name)) {
            if (held === undefined) return;
            walkPreorder(node.name, (element) => {
                if (!isBindingElement(element) || element.name === undefined || !isIdentifier(element.name)) return;
                const property =
                    element.propertyName !== undefined && isIdentifier(element.propertyName)
                        ? element.propertyName.text
                        : element.name.text;
                if (property === held[0]) kinds.set(element.name.text, held[1]);
            });
            return;
        }
        if (type === 'PlayerSession' || type === 'ClientConnection') {
            kinds.set(node.name.text, type);
        }
        if (held !== undefined) kinds.set(node.name.text, type);
    });
    return kinds;
};

/**
 * The kind of the object a property access reads from: a parameter, or the `session` or
 * `connection` of a context.
 */
const receiverKind = (access: PropertyAccessExpression, kinds: ReadonlyMap<string, string>): string | undefined => {
    const receiver = access.expression;
    if (isIdentifier(receiver)) return kinds.get(receiver.text);
    if (isPropertyAccess(receiver) && isIdentifier(receiver.expression)) {
        const context = kinds.get(receiver.expression.text);
        const held = context === undefined ? undefined : CONTEXT_TYPES.get(context);
        return held !== undefined && memberName(receiver) === held[0] ? held[1] : undefined;
    }
    return undefined;
};

/** Whether `node` reads only the player's identity: `x.getName` or `x.getRuntimeId`. */
const readsIdentity = (node: Node): boolean => {
    const parent = node.parent;
    if (parent === undefined || !isPropertyAccess(parent) || parent.expression !== node) return false;
    const name = memberName(parent);
    return name !== null && PLAYER_IDENTITY.has(name);
};

/**
 * Every way a handler module reaches world or entity state that the syntax shows: an import
 * outside {@link CONNECTION_IMPORTS}, a call on its `PlayerSession` or
 * `ClientConnection` outside the allowed members, or a use of the player beyond its identity.
 */
const worldAccess = (file: string): string[] => {
    const source = parseSourceFile(file, readFileSync(file, 'utf8'));
    const found: string[] = [];
    const kinds = parameterKinds(source);
    const playerVariables = new Set<string>();

    for (const statement of source.statements.nodes) {
        if (!isImport(statement)) continue;
        const specifier = getTextOfNode(statement.moduleSpecifier).slice(1, -1);
        const typeOnly = statement.importClause?.phaseModifier === SyntaxKind.TypeKeyword;
        const allowed =
            CONNECTION_IMPORTS.some((pattern) => pattern.test(specifier)) || (typeOnly && specifier === '../../');
        if (!allowed) found.push(`imports ${specifier}`);
    }

    walkPreorder(source, (node) => {
        if (!isPropertyAccess(node)) return;
        const member = memberName(node);
        const kind = receiverKind(node, kinds);
        if (member === null || kind === undefined) return;

        if (kind === 'PlayerSession' && !SESSION_MEMBERS.has(member)) found.push(`calls session.${member}`);
        if (kind === 'ClientConnection' && CONNECTION_WORLD_MEMBERS.has(member)) {
            found.push(`calls connection.${member}`);
        }
        if (kind === 'PlayerSession' && member === 'getConnection') {
            const call = node.parent;
            const next = call?.parent;
            const chained = next !== undefined && isPropertyAccess(next) ? memberName(next) : null;
            if (chained !== null && CONNECTION_WORLD_MEMBERS.has(chained)) found.push(`calls connection.${chained}`);
        }
        if (kind === 'PlayerSession' && member === 'getPlayer') {
            const call = node.parent;
            const holder = call?.parent;
            if (call === undefined || holder === undefined) return;
            if (isVariableDeclaration(holder) && isIdentifier(holder.name)) {
                playerVariables.add(holder.name.text);
            } else if (!readsIdentity(call)) {
                found.push(`uses the player beyond its identity: ${getTextOfNode(holder)}`);
            }
        }
    });

    walkPreorder(source, (node) => {
        if (!isIdentifier(node) || !playerVariables.has(node.text)) return;
        const parent = node.parent;
        if (parent?.kind === SyntaxKind.VariableDeclaration) return;
        if (parent !== undefined && isPropertyAccess(parent) && parent.name === node) return;
        if (!readsIdentity(node)) found.push(`uses the player beyond its identity: ${getTextOfNode(parent ?? node)}`);
    });

    return found;
};

describe('network/handler/Lane', () => {
    it('gives every registered handler a lane', async () => {
        const handlers = await registeredHandlers();
        const totals = new Map<Lane, number>(LANES.map((lane) => [lane, 0]));

        for (const handler of handlers) {
            expect(LANES, handler.constructor.name).toContain(handler.lane);
            totals.set(handler.lane, (totals.get(handler.lane) ?? 0) + 1);
        }

        reportProgress(
            `${handlers.length} packet handlers: ${LANES.map((lane) => `${totals.get(lane)} ${lane}`).join(', ')}`,
            'Handler lanes'
        );
    });

    it('puts the handlers that relay to other players in the input lane', async () => {
        const lanes = new Map((await registeredHandlers()).map((handler) => [handler.constructor.name, handler.lane]));

        for (const relay of ['ActorEventHandler', 'AnimateHandler', 'EmoteHandler', 'LevelSoundEventHandler']) {
            expect(lanes.get(relay), relay).toBe('input');
        }
    });

    it("moves a player's position only from input-lane handlers", async () => {
        // The client owns a player's movement (ADR 0008): its reports and the server moves a
        // packet asks for, such as a respawn or a world change, are applied in the input step.
        const writes = /applyClientMovement\(|setPlayerPosition\(|\.setPosition\(|\.respawn\(|changeWorld\(/;
        const lanes = new Map((await registeredHandlers()).map((handler) => [handler.constructor.name, handler.lane]));
        const movers = [...lanes.keys()].filter((name) => {
            const file = `${here}${name}.ts`;
            return existsSync(file) && writes.test(readFileSync(file, 'utf8'));
        });

        expect(movers).toEqual(expect.arrayContaining(['PlayerAuthInputHandler', 'RespawnHandler']));
        for (const mover of movers) expect(lanes.get(mover), mover).toBe('input');
    });

    it('answers sub-chunk requests in the read lane', async () => {
        const lanes = new Map((await registeredHandlers()).map((handler) => [handler.constructor.name, handler.lane]));

        expect(lanes.get('SubChunkRequestHandler')).toBe('read');
    });

    it('keeps world and entity state out of connection-lane handlers', async () => {
        const connection = (await registeredHandlers())
            .filter((handler) => handler.lane === 'connection')
            .map((handler) => handler.constructor.name);
        const reaching = new Map<string, string[]>();

        for (const name of connection) {
            const access = worldAccess(`${here}${name}.ts`);
            if (access.length > 0) reaching.set(name, access);
        }

        for (const [name, access] of reaching) {
            expect(KNOWN_WORLD_ACCESS.has(name), `${name} ${access.join('; ')}`).toBe(true);
        }
        expect([...reaching.keys()].sort()).toStrictEqual([...KNOWN_WORLD_ACCESS.keys()].sort());
    });

    it('flags the world access it guards against', () => {
        expect(worldAccess(`${here}SetPlayerGameTypeHandler.ts`)).toContain('calls session.sendGamemode');
        expect(worldAccess(`${here}AnimateHandler.ts`).some((use) => use.includes('getWorld'))).toBe(true);
    });

    it('merges two handlers into the stricter lane', () => {
        expect(strictestLane('connection', 'read')).toBe('read');
        expect(strictestLane('input', 'read')).toBe('input');
        expect(strictestLane('connection', 'connection')).toBe('connection');
    });
});
