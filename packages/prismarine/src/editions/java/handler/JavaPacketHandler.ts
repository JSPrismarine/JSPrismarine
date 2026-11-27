/**
 * The handlers of what a Java Edition client sends, in the shape Bedrock's handlers share
 * ([ADR 0014](../../../../../../docs/adr/0014-handlers-share-a-shape-and-run-in-the-input-step.md)).
 *
 * A handler names the packet definition it reads, and the definition's phase is the one phase it
 * is read in. The ids come from the release the connection speaks, so the same handlers serve
 * every release whose table has their packets.
 */
import type { KeyObject } from 'node:crypto';

import type { PacketHandler } from '@jsprismarine/protocol/handler/PacketHandler';
import type { JavaPacketDefinition, JavaPayload } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { javaPacketId } from '@jsprismarine/protocol/java/packet/JavaPacket';
import type { JavaProtocol } from '@jsprismarine/protocol/java/versions/javaRelease';

import type { EditionTranslation } from '../editionTranslation';
import type { hasJoined } from '../javaAuth';
import type { JavaConnection, JavaConnectionPhase } from '../JavaConnection';
import type { JavaLoginOptions } from '../JavaConnections';

/** What every Java connection on the server shares. */
export interface JavaServices {
    readonly options: JavaLoginOptions;
    /** The RSA key the logins encrypt their shared secret with. */
    readonly key: { readonly publicDer: Buffer; readonly privateKey: KeyObject };
    /** Asks the session server whether a player joined. */
    readonly askSessionServer: typeof hasJoined;
    /** The session id every `Login Success` carries, one for as long as the server runs, as vanilla's is. */
    readonly sessionId: string;
    /** Java item ids to the world's items, for the stacks a creative client sends. */
    readonly items: EditionTranslation<string, number | undefined>;
}

/** What a Java handler is handed beside the packet. */
export interface JavaContext {
    readonly connection: JavaConnection;
    readonly services: JavaServices;
}

/** A handler of one serverbound Java packet. */
export interface JavaPacketHandler<D extends JavaPacketDefinition = JavaPacketDefinition> extends PacketHandler<
    JavaPayload<D>,
    JavaContext,
    JavaConnectionPhase
> {
    readonly packet: D;
}

/**
 * A handler of `packet`, read in the packet's own phase.
 * @param packet - The serverbound packet it reads.
 * @param handle - What it does with one.
 * @returns The handler.
 */
export const javaHandler = <D extends JavaPacketDefinition>(
    packet: D,
    handle: (payload: JavaPayload<D>, context: JavaContext) => void | Promise<void>
): JavaPacketHandler<D> => ({ packet, phases: [packet.phase], handle });

/** What a frame's id names in a connection's phase. */
export type JavaLookup =
    | { readonly kind: 'handled'; readonly handler: JavaPacketHandler }
    /** A packet the phase has, which no handler reads, such as the client's tick end. */
    | { readonly kind: 'unread' }
    /** An id the phase has no packet for. */
    | { readonly kind: 'unknown' };

/** The handlers, by release, phase and id. */
export class JavaPacketHandlers {
    private readonly byRelease = new Map<JavaProtocol, Map<JavaConnectionPhase, Map<number, JavaPacketHandler>>>();

    /** @param handlers - Every handler, at most one a packet. */
    public constructor(private readonly handlers: readonly JavaPacketHandler[]) {}

    /**
     * What a serverbound id names.
     * @param protocol - The release the connection speaks.
     * @param phase - The connection's phase.
     * @param id - The frame's packet id.
     * @returns The handler, or whether the phase has such a packet at all.
     */
    public lookup(protocol: JavaProtocol, phase: JavaConnectionPhase, id: number): JavaLookup {
        const handler = this.tableOf(protocol).get(phase)?.get(id);
        if (handler !== undefined) return { kind: 'handled', handler };
        const known = Object.values(protocol.packets[phase]?.serverbound ?? {}).includes(id);
        return { kind: known ? 'unread' : 'unknown' };
    }

    private tableOf(protocol: JavaProtocol): Map<JavaConnectionPhase, Map<number, JavaPacketHandler>> {
        let table = this.byRelease.get(protocol);
        if (table !== undefined) return table;
        table = new Map();
        for (const handler of this.handlers) {
            const { phase } = handler.packet;
            let ids = table.get(phase);
            if (ids === undefined) table.set(phase, (ids = new Map()));
            ids.set(javaPacketId(protocol, handler.packet), handler);
        }
        this.byRelease.set(protocol, table);
        return table;
    }
}
