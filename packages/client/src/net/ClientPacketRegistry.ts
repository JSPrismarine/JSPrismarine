import { NetworkBinaryStream, PacketIdentifier, v2193 } from '@jsprismarine/protocol';

import type {
    ChangeDimensionPayload,
    Disconnect,
    LevelChunk,
    MovePlayer,
    NetworkChunkPublisherUpdatePayload,
    NetworkPacket,
    NetworkSettings,
    PlayStatusData,
    PlayerActionData,
    ServerToClientHandshake,
    ShowCreditsPayload,
    StartGame,
    Text
} from '@jsprismarine/protocol';
import type { ClientContext, ClientPacketHandler, ClientPhase } from './ClientHandler';

/** A packet class that can be built with no arguments, i.e. for decoding into. */
export type PacketConstructor = new () => NetworkPacket<any>;

/** The header's low ten bits are the id; the rest is split-screen addressing. */
const PID_MASK = 0x3ff;

/** One packet as the registry decoded it. */
export interface DecodedPacket {
    readonly id: number;
    /** The name of the packet class that decoded it, which its handlers are registered under. */
    readonly name: string;
    readonly data: unknown;
    /** The packet that decoded it, which holds `data` as its payload. */
    readonly packet: NetworkPacket;
}

/** A handler held under its packet's name, bound to the packet class it was registered with. */
interface BoundHandler {
    readonly phases: readonly ClientPhase[];
    /**
     * Runs the handler when `packet` is an instance of its class, and does nothing otherwise.
     * Typed `object` so that `instanceof` narrows it to the class's own payload type.
     */
    readonly run: (packet: object, context: ClientContext) => void | Promise<void>;
}

/**
 * The decoded payload each clientbound packet id carries, for the ids the client reads.
 *
 * This is a promise about registration, not something the registry enforces: `isPacket`
 * narrows on the id alone, so it is only right while each id here is registered to the
 * packet class whose data type is listed. `Client` registers that set. It is for code that
 * watches the session's `packet` event; a handler registered with
 * {@link ClientPacketRegistry.registerHandler} gets its payload typed by its packet class.
 */
export interface ClientboundPacketData {
    [PacketIdentifier.NETWORK_SETTINGS]: NetworkSettings;
    [PacketIdentifier.SERVER_TO_CLIENT_HANDSHAKE]: ServerToClientHandshake;
    [PacketIdentifier.PLAY_STATUS]: PlayStatusData;
    [PacketIdentifier.START_GAME]: StartGame;
    [PacketIdentifier.DISCONNECT]: Disconnect;
    [PacketIdentifier.TEXT]: Text;
    [PacketIdentifier.CHANGE_DIMENSION]: ChangeDimensionPayload;
    [PacketIdentifier.NETWORK_CHUNK_PUBLISHER_UPDATE]: NetworkChunkPublisherUpdatePayload;
    [PacketIdentifier.PLAYER_ACTION]: PlayerActionData;
    [PacketIdentifier.LEVEL_CHUNK]: LevelChunk;
    [PacketIdentifier.MOVE_PLAYER]: MovePlayer;
    [PacketIdentifier.SHOW_CREDITS]: ShowCreditsPayload;
}

/**
 * Narrows a decoded packet to the data type its id is registered with.
 *
 * Checks the id only; see `ClientboundPacketData` for why that is enough.
 */
export const isPacket = <K extends keyof ClientboundPacketData>(
    packet: DecodedPacket,
    id: K
): packet is DecodedPacket & { readonly id: K; readonly data: ClientboundPacketData[K] } => packet.id === id;

/**
 * Which packet class decodes which id, and which handlers answer each packet.
 *
 * Handlers are in the shape the server's use
 * ([ADR 0014](../../../../docs/adr/0014-handlers-share-a-shape-and-run-in-the-input-step.md)),
 * registered under the name of their packet class, and take a client context in place of the
 * server's. Who registers them differs: the login sequence registers its steps for as long as
 * the login runs, and the dimension change and credits responders theirs for the life of the
 * client.
 *
 * An id with no class registered is not an error. A client meets packets it has no use for
 * from its first join - the server sends crafting data and biome definitions before the
 * player can move - and refusing to proceed until all of them are implemented would mean
 * implementing all of them before anything works at all.
 */
export default class ClientPacketRegistry {
    private readonly packets: Map<number, PacketConstructor> = new Map();
    private readonly unknown: Set<number> = new Set();
    /** The handlers of each packet name, in the order they were registered. */
    private readonly handlers: Map<string, BoundHandler[]> = new Map();

    /**
     * Creates a registry that decodes version-gated packets for one negotiated protocol.
     * @param protocolVersion - The protocol version used by the connection.
     */
    public constructor(private readonly protocolVersion: number = v2193.protocolVersion) {}

    /**
     * Registers a packet class under its default network id.
     * @param constructor - The packet class to register.
     */
    public register(constructor: PacketConstructor): void {
        const id = new constructor().getId();

        if (this.packets.has(id)) {
            throw new Error(`Packet id 0x${id.toString(16)} is already registered to ${this.packets.get(id)!.name}`);
        }

        this.packets.set(id, constructor);
    }

    public registerAll(constructors: readonly PacketConstructor[]): void {
        for (const constructor of constructors) this.register(constructor);
    }

    public has(id: number): boolean {
        return this.packets.has(id);
    }

    /**
     * Registers a handler for the packets one class decodes.
     *
     * The handler is held under the class's name and runs for a packet of that name only when
     * the class decoded it, so its payload is the one the class produces. Registering a
     * handler does not register the class for decoding; a packet whose class is not registered
     * with {@link ClientPacketRegistry.register} never reaches it.
     * @param packet - The packet class whose payload the handler takes.
     * @param handler - The handler, which runs after the handlers registered before it.
     * @returns A function that removes the handler again.
     */
    public registerHandler<T>(packet: new () => NetworkPacket<T>, handler: ClientPacketHandler<T>): () => void {
        const bound: BoundHandler = {
            phases: handler.phases,
            run: (decoded, context) => {
                if (!(decoded instanceof packet)) return;
                const data = decoded.getPacketData();
                if (data === null) return;
                return handler.handle(data, context);
            }
        };

        const handlers = this.handlers.get(packet.name) ?? [];
        handlers.push(bound);
        this.handlers.set(packet.name, handlers);

        return () => {
            const index = handlers.indexOf(bound);
            if (index !== -1) handlers.splice(index, 1);
        };
    }

    /**
     * Runs the handlers registered for a decoded packet that accept the session's phase, in the
     * order they were registered.
     *
     * Each handler is called before the next one starts, and none is waited for. A handler that
     * throws does not stop the ones after it.
     * @param decoded - A packet {@link ClientPacketRegistry.decode} returned.
     * @param phase - The phase the session is in.
     * @param context - What the handlers are handed.
     * @returns The promise of each handler that returned one or threw, for the caller to wait
     *   for and to report the failure of.
     */
    public dispatch(decoded: DecodedPacket, phase: ClientPhase, context: ClientContext): Promise<void>[] {
        const handlers = this.handlers.get(decoded.name);
        if (handlers === undefined) return [];

        const work: Promise<void>[] = [];
        // A copy, so a handler that removes itself or another does not skip one for this packet.
        for (const handler of [...handlers]) {
            if (!handler.phases.includes(phase)) continue;
            try {
                const result = handler.run(decoded.packet, context);
                if (result !== undefined) work.push(result);
            } catch (error: unknown) {
                work.push(Promise.reject(error));
            }
        }
        return work;
    }

    /**
     * Decodes one packet, or returns null if nothing is registered for its id.
     *
     * @param buffer - a single packet as it came out of the batch, header included.
     */
    public decode(buffer: Buffer): DecodedPacket | null {
        const id = ClientPacketRegistry.readPacketId(buffer);
        const constructor = this.packets.get(id);

        if (!constructor) {
            this.unknown.add(id);
            return null;
        }

        const packet = new constructor();
        return {
            id,
            name: constructor.name,
            data: packet.deserialize(new NetworkBinaryStream(buffer), { protocolVersion: this.protocolVersion }),
            packet
        };
    }

    /**
     * Every id seen that nothing was registered for.
     *
     * Kept because it is the honest measure of how much of the protocol is implemented, and
     * because it is what a "what is this server sending that we ignore?" question needs.
     */
    public getUnknownIds(): number[] {
        return Array.from(this.unknown).sort((a, b) => a - b);
    }

    /**
     * Peeks the id without consuming anything.
     *
     * The header is an unsigned varint, so the id is not simply the first byte - which is
     * how the server reads it, and which works only because every id it handles happens to
     * fit in seven bits or to have a low byte that collides with nothing.
     */
    public static readPacketId(buffer: Buffer): number {
        let value = 0;

        for (let shift = 0, cursor = 0; shift <= 28; shift += 7, cursor++) {
            if (cursor >= buffer.byteLength) throw new Error('Packet header runs past the end of the buffer');

            const byte = buffer[cursor]!;
            value |= (byte & 0x7f) << shift;

            if ((byte & 0x80) === 0) return value & PID_MASK;
        }

        throw new Error('Packet header varint did not terminate after 5 bytes');
    }
}
