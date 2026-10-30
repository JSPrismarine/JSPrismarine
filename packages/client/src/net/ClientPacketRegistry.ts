import { NetworkBinaryStream, PacketIdentifier, v2193 } from '@jsprismarine/protocol';

import type {
    Disconnect,
    NetworkPacket,
    NetworkSettings,
    PlayStatusData,
    ServerToClientHandshake,
    StartGame,
    Text
} from '@jsprismarine/protocol';

/** A packet class that can be built with no arguments, i.e. for decoding into. */
export type PacketConstructor = new () => NetworkPacket<any>;

/** The header's low ten bits are the id; the rest is split-screen addressing. */
const PID_MASK = 0x3ff;

export interface DecodedPacket {
    readonly id: number;
    readonly name: string;
    readonly data: unknown;
}

/**
 * The decoded payload each clientbound packet id carries, for the ids the client reads.
 *
 * This is a promise about registration, not something the registry enforces: `isPacket`
 * narrows on the id alone, so it is only right while each id here is registered to the
 * packet class whose data type is listed. `Client` registers that set.
 */
export interface ClientboundPacketData {
    [PacketIdentifier.NETWORK_SETTINGS]: NetworkSettings;
    [PacketIdentifier.SERVER_TO_CLIENT_HANDSHAKE]: ServerToClientHandshake;
    [PacketIdentifier.PLAY_STATUS]: PlayStatusData;
    [PacketIdentifier.START_GAME]: StartGame;
    [PacketIdentifier.DISCONNECT]: Disconnect;
    [PacketIdentifier.TEXT]: Text;
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
 * Which packet class handles which id, with no server anywhere in the signature.
 *
 * The server's registry is built around a `Server` - it logs through it, and its handlers
 * take it as their second argument - which is exactly why the client could not reuse it.
 * This one maps ids to codecs and stops there; what to *do* with a decoded packet is the
 * caller's business, and on the client that answer differs between the login sequence, the
 * game session and a bot's behavior script.
 *
 * An id with no class registered is not an error. A client meets packets it has no use for
 * from its first join - the server sends crafting data and biome definitions before the
 * player can move - and refusing to proceed until all of them are implemented would mean
 * implementing all of them before anything works at all.
 */
export default class ClientPacketRegistry {
    private readonly packets: Map<number, PacketConstructor> = new Map();
    private readonly unknown: Set<number> = new Set();

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
            data: packet.deserialize(new NetworkBinaryStream(buffer), { protocolVersion: this.protocolVersion })
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
