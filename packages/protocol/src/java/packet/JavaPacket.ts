/**
 * A Java Edition packet: where it is in the conversation, then its fields.
 *
 * A definition is the same declarative {@link PacketDefinition} a Bedrock packet's is
 * ([ADR 0003](../../../../../docs/adr/0003-declarative-wire-layouts.md)): one ordered field list,
 * resolved and encoded through {@link layoutAt}, with {@link JavaPayload} as its payload type. It
 * names its packet by phase, direction and Mojang's name for it rather than by number, and each
 * release's generated table gives the number, as a Bedrock codec's id table does for a Bedrock
 * packet's name. The frame around a packet, its length and, after login, its compression, belongs
 * to the connection.
 *
 * The layouts carry no gates: a gate admits Bedrock protocol numbers, and Java numbers its
 * releases on a scale of its own. A layout that changes between Java releases needs a Java gate.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

import type { PacketBound, PacketDefinition, PayloadOf } from '../../wire/define';
import { definePacket } from '../../wire/define';
import type { WireType } from '../../wire/fieldTypes';
import { frozen } from '../../wire/frozen';
import { layoutAt } from '../../wire/WireLayout';
import type { JavaProtocol } from '../versions/javaRelease';
import type { NewestPackets } from '../versions/newest';
import { varInt } from '../wire/javaTypes';

/** The newest release's table, which the packet paths are checked against. */
type Table = NewestPackets;

/** A phase of the conversation: handshake, status, login, configuration or play. */
export type JavaPhase = keyof Table;

/** Every packet the newest release has, as `phase/direction/name` in Mojang's names. */
export type JavaPacketPath = {
    [P in JavaPhase]: {
        [B in keyof Table[P] & PacketBound]: `${P}/${B}/${keyof Table[P][B] & string}`;
    }[keyof Table[P] & PacketBound];
}[JavaPhase];

/** One Java packet: where it is in the conversation, and its fields. */
export interface JavaPacketDefinition<
    F extends Record<string, WireType<unknown>> = Record<string, WireType<unknown>>
> extends PacketDefinition<F> {
    /** The community protocol page's name for the packet, which errors name it by. */
    readonly name: string;
    readonly phase: JavaPhase;
    readonly bound: PacketBound;
    /** Mojang's name for the packet, which a release's table gives its id under. */
    readonly key: string;
}

/** The fields a definition reads and writes, as one value. */
export type JavaPayload<D extends JavaPacketDefinition> = PayloadOf<D>;

/**
 * Defines a packet from its fields, in wire order.
 * @param name - The community protocol page's name for the packet.
 * @param path - Its phase, direction and Mojang's name, as `phase/direction/name`.
 * @param fields - The fields, in wire order.
 * @returns The definition.
 */
export const defineJavaPacket = <F extends Record<string, WireType<unknown>>>(
    name: string,
    path: JavaPacketPath,
    fields: F
): JavaPacketDefinition<F> => {
    // The path's type allows only `phase/direction/name`, which split cannot carry through. Mojang's
    // name may hold a slash of its own, as `debug/block_value` does, so only the first two split.
    const [phase, bound, ...mojangName] = path.split('/') as [JavaPhase, PacketBound, ...string[]];
    const key = mojangName.join('/');
    return frozen({ ...definePacket(name, fields), phase, bound, key });
};

/**
 * A packet's id in a release.
 * @param protocol - The release the connection speaks.
 * @param definition - The packet.
 * @returns Its id within its phase and direction.
 * @throws {Error} When the release has no such packet.
 */
export const javaPacketId = (protocol: JavaProtocol, definition: JavaPacketDefinition): number => {
    const id = protocol.packets[definition.phase]?.[definition.bound]?.[definition.key];
    if (id === undefined) {
        throw new ProtocolWireErrors.JavaPacketNotInRelease({
            name: definition.name,
            release: protocol.minecraftVersion
        });
    }
    return id;
};

/**
 * A packet's id and fields as the bytes inside one frame.
 * @param protocol - The release the connection speaks.
 * @param definition - The packet.
 * @param value - Its fields.
 * @returns The id as a VarInt, then the fields.
 */
export const encodeJavaPacket = <D extends JavaPacketDefinition>(
    protocol: JavaProtocol,
    definition: D,
    value: JavaPayload<D>
): Buffer => {
    const stream = new BinaryStream();
    varInt.write(stream, javaPacketId(protocol, definition));
    layoutAt(definition, protocol.protocolVersion).encode(stream, value);
    return stream.getBuffer();
};

/** A frame's packet id, and a stream positioned at its first field. */
export interface JavaPacketBody {
    readonly id: number;
    readonly body: BinaryStream;
}

/**
 * Reads the packet id at the start of a frame.
 * @param frame - The bytes inside one frame, after its length.
 * @returns The id, and a stream positioned at the fields.
 */
export const readJavaPacketId = (frame: Buffer): JavaPacketBody => {
    const body = new BinaryStream(frame);
    return { id: varInt.read(body), body };
};

/**
 * Reads a packet's fields and checks that nothing follows them.
 * @param protocol - The release the connection speaks.
 * @param definition - The packet the id named.
 * @param body - The stream {@link readJavaPacketId} left at the fields.
 * @returns The fields.
 * @throws {Error} When bytes follow the fields, so the client wrote another layout.
 */
export const decodeJavaPacket = <D extends JavaPacketDefinition>(
    protocol: JavaProtocol,
    definition: D,
    body: BinaryStream
): JavaPayload<D> => {
    const value = layoutAt(definition, protocol.protocolVersion).decode(body);
    const unread = body.getBuffer().byteLength - body.getReadIndex();
    if (unread > 0) throw new ProtocolWireErrors.JavaPacketHasTrailingBytes({ name: definition.name, unread });
    return value;
};
