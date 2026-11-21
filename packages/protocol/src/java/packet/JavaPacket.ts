/**
 * A Java Edition packet: an id within its phase and direction, then its fields.
 *
 * A definition is declarative, as [ADR 0003](../../../../../docs/adr/0003-declarative-wire-layouts.md)
 * asks of Bedrock's packets: one {@link record} of field types, read and written in order. The
 * frame around a packet, its length and, after login, its compression, belongs to the connection.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

import type { RecordOf, WireType } from '../../wire/fieldTypes';
import { record } from '../../wire/fieldTypes';
import { varInt } from '../wire/javaTypes';

/** One Java packet's id and fields. */
export interface JavaPacketDefinition<T> {
    /** The community protocol page's name for the packet. */
    readonly name: string;
    /** The packet id within its phase and direction. */
    readonly id: number;
    readonly fields: WireType<T>;
}

/**
 * Defines a packet from its fields, in wire order.
 * @param name - The community protocol page's name for the packet.
 * @param id - The packet id within its phase and direction.
 * @param fields - The fields, in wire order.
 * @returns The definition.
 */
export const defineJavaPacket = <F extends Record<string, WireType<unknown>>>(
    name: string,
    id: number,
    fields: F
): JavaPacketDefinition<RecordOf<F>> => Object.freeze({ name, id, fields: record(fields) });

/**
 * A packet's id and fields as the bytes inside one frame.
 * @param definition - The packet.
 * @param value - Its fields.
 * @returns The id as a VarInt, then the fields.
 */
export const encodeJavaPacket = <T>(definition: JavaPacketDefinition<T>, value: T): Buffer => {
    const stream = new BinaryStream();
    varInt.write(stream, definition.id);
    definition.fields.write(stream, value);
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
 * @param definition - The packet the id named.
 * @param body - The stream {@link readJavaPacketId} left at the fields.
 * @returns The fields.
 * @throws {Error} When bytes follow the fields, so the client wrote another layout.
 */
export const decodeJavaPacket = <T>(definition: JavaPacketDefinition<T>, body: BinaryStream): T => {
    const value = definition.fields.read(body);
    const unread = body.getBuffer().byteLength - body.getReadIndex();
    if (unread > 0) throw new ProtocolWireErrors.JavaPacketHasTrailingBytes({ name: definition.name, unread });
    return value;
};
