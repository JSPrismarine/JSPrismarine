import type { ProtocolCodec } from '@jsprismarine/protocol';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import type { ServerContent } from '../content/ServerContent';
import type MinecraftSession from './MinecraftSession';
import { encodePacketBatchBySize } from './encodePacketBatch';
import type { EncodedPacketBatch } from './encodePacketBatch';

/** Batches tied to the content build, so replacing content releases its encoded bytes. */
const batches = new WeakMap<ServerContent, WeakMap<ProtocolCodec, Map<string, Promise<EncodedPacketBatch>>>>();

/**
 * Encodes one viewer-independent join packet batch once for a content, codec, and variation.
 * Recipe limits and compression levels belong in the variation key so changing either cannot
 * reuse bytes built for a different join configuration.
 * @param content - The current server content build.
 * @param codec - The client's negotiated protocol codec.
 * @param variation - The packet kind and any value that changes its payload, such as recipe limit.
 * @param compressionLevel - The server's current compression level.
 * @param packets - The packets that make up this cached batch.
 * @returns The encoded batch shared by all equivalent joins.
 */
export const cachedJoinPacketBatch = (
    content: ServerContent,
    codec: ProtocolCodec,
    variation: string,
    compressionLevel: number,
    packets: readonly NetworkPacket<unknown>[]
): Promise<EncodedPacketBatch> => {
    let byCodec = batches.get(content);
    if (byCodec === undefined) {
        byCodec = new WeakMap();
        batches.set(content, byCodec);
    }

    let byVariation = byCodec.get(codec);
    if (byVariation === undefined) {
        byVariation = new Map();
        byCodec.set(codec, byVariation);
    }

    const key = `${variation}:${compressionLevel}`;
    const cached = byVariation.get(key);
    if (cached !== undefined) return cached;

    // Store the in-flight promise before compression starts. Simultaneous joins with the same
    // cache key then share one encode instead of racing to duplicate the expensive deflate.
    const pending = Promise.resolve().then(async () => {
        const encoded = encodePacketBatchBySize(packets, codec, { compressionLevel });
        return encoded instanceof Promise ? await encoded : encoded;
    });
    byVariation.set(key, pending);
    void pending.catch(() => {
        if (byVariation?.get(key) === pending) byVariation.delete(key);
    });

    return pending;
};

/**
 * Sends one cached join packet, falling back to the ordinary path without a content build.
 * A discriminator is needed when one packet class carries several static definitions, as
 * `SyncActorPropertyPacket` does for each entity identifier.
 * @param session - The session that will frame the bytes on its own transport.
 * @param content - The immutable content build that owns these bytes, or undefined before a build.
 * @param recipeLimit - The crafting limit selected for this join.
 * @param compressionLevel - The server's current zlib level.
 * @param packet - The viewer-independent packet to encode and send.
 * @param cacheDiscriminator - Stable identity for a distinct payload of the same packet class.
 * @returns Completion of the session's ordered send.
 */
export const sendCachedJoinPacket = (
    session: Pick<MinecraftSession, 'codec' | 'sendDataPacket' | 'sendSharedBatchAsync'>,
    content: ServerContent | undefined,
    recipeLimit: number,
    compressionLevel: number,
    packet: NetworkPacket<unknown>,
    cacheDiscriminator = ''
): Promise<void> => {
    if (content === undefined) return session.sendDataPacket(packet);

    const batch = cachedJoinPacketBatch(
        content,
        session.codec,
        `${packet.getName()}:${cacheDiscriminator}:recipe-limit=${recipeLimit}`,
        compressionLevel,
        [packet]
    );

    return session.sendSharedBatchAsync(batch, packet);
};
