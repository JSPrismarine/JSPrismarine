import type { Cipheriv, Decipheriv } from 'node:crypto';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { connect } from 'node:net';

import type { JavaPacketDefinition } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { decodeJavaPacket, encodeJavaPacket, readJavaPacketId } from '@jsprismarine/protocol/java/packet/JavaPacket';

import { compressFrame, decompressFrame } from '../network/java/javaCompression';
import { framed, TcpFrameReader } from '../network/transport/tcpFrames';

/**
 * A Java Edition client on a loopback socket, as far as a login needs one: it frames, compresses
 * once told to, encrypts once told to, and reads the server's packets in order.
 * @param port - The server's port on 127.0.0.1.
 * @returns The client.
 */
export const javaClient = async (port: number) => {
    const socket = connect(port, '127.0.0.1');
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    const reader = new TcpFrameReader();
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
        send: <T>(definition: JavaPacketDefinition<T>, value: T): void => {
            const packet = encodeJavaPacket(definition, value);
            const bytes = framed(compression === undefined ? packet : compressFrame(packet, compression));
            socket.write(cipher === undefined ? bytes : cipher.out.update(bytes));
        },
        /** The next packet, which must be `definition`. */
        receive: async <T>(definition: JavaPacketDefinition<T>): Promise<T> => {
            const { id, body } = await next();
            if (id !== definition.id)
                throw new Error(`expected ${definition.name} (${definition.id}), got packet ${id}`);
            return decodeJavaPacket(definition, body);
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
