import type { Cipheriv, Decipheriv } from 'node:crypto';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { connect } from 'node:net';

import type { JavaPacketDefinition, JavaPayload } from '@jsprismarine/protocol/java/packet/JavaPacket';
import {
    decodeJavaPacket,
    encodeJavaPacket,
    readJavaPacketId,
    javaPacketId
} from '@jsprismarine/protocol/java/packet/JavaPacket';

import { compressFrame, decompressFrame } from '@jsprismarine/protocol/java/wire/compression';
import { framed, JavaFrameReader } from '@jsprismarine/protocol/java/wire/frames';
import { NEWEST_JAVA_RELEASE } from '@jsprismarine/protocol/java/versions/javaReleases';

/**
 * A Java Edition client on a loopback socket, as far as a login needs one: it frames, compresses
 * once told to, encrypts once told to, and reads the server's packets in order.
 * @param port - The server's port on 127.0.0.1.
 * @returns The client.
 */
export const javaClient = async (port: number) => {
    const socket = connect(port, '127.0.0.1');
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    const reader = new JavaFrameReader();
    const frames: Buffer[] = [];
    const waiting: (() => void)[] = [];
    let cipher: { out: Cipheriv; in: Decipheriv } | undefined;
    let compression: number | undefined;
    socket.on('data', (chunk: Buffer) => {
        const read = reader.push(cipher === undefined ? chunk : cipher.in.update(chunk));
        if ('frames' in read) frames.push(...read.frames);
        for (const wake of waiting.splice(0)) wake();
    });
    const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));

    /** The next packet's id and fields, undecoded. */
    const next = async () => {
        while (frames.length === 0) await new Promise<void>((resolve) => waiting.push(resolve));
        const frame = frames.shift()!;
        return readJavaPacketId(compression === undefined ? frame : decompressFrame(frame, compression));
    };

    return {
        closed,
        next,
        send: <D extends JavaPacketDefinition>(definition: D, value: JavaPayload<D>): void => {
            const packet = encodeJavaPacket(NEWEST_JAVA_RELEASE, definition, value);
            const bytes = framed(compression === undefined ? packet : compressFrame(packet, compression));
            socket.write(cipher === undefined ? bytes : cipher.out.update(bytes));
        },
        /** The next packet, which must be `definition`. */
        receive: async <D extends JavaPacketDefinition>(definition: D): Promise<JavaPayload<D>> => {
            const { id, body } = await next();
            if (id !== javaPacketId(NEWEST_JAVA_RELEASE, definition))
                throw new Error(
                    `expected ${definition.name} (${javaPacketId(NEWEST_JAVA_RELEASE, definition)}), got packet ${id}`
                );
            return decodeJavaPacket(NEWEST_JAVA_RELEASE, definition, body);
        },
        /** Encrypts both ways from here on, as a client does once it has sent its encryption response. */
        encrypt: (secret: Buffer): void => {
            cipher = {
                out: createCipheriv('aes-128-cfb8', secret, secret),
                in: createDecipheriv('aes-128-cfb8', secret, secret)
            };
        },
        /** Compresses both ways from here on, as a client does once `Set Compression` arrives. */
        compress: (threshold: number): void => {
            compression = threshold;
        },
        destroy: () => socket.destroy()
    };
};
