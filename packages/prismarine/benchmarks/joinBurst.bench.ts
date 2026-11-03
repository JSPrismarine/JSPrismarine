/**
 * Measures per-packet join encoding, compression, wire size, and cached reuse against vanilla content.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:join-burst [compression-level] [recipe-limit]`.
 */
import { createHash } from 'node:crypto';

import type { Logger } from '@jsprismarine/logger';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec, type ProtocolCodec } from '@jsprismarine/protocol';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import AvailableActorIdentifiersPacket from '@jsprismarine/protocol/packet/AvailableActorIdentifiersPacket';
import BiomeDefinitionListPacket from '@jsprismarine/protocol/packet/BiomeDefinitionListPacket';
import CraftingDataPacket from '@jsprismarine/protocol/packet/CraftingDataPacket';
import CreativeContentPacket from '@jsprismarine/protocol/packet/CreativeContentPacket';
import FeatureRegistryPacket from '@jsprismarine/protocol/packet/FeatureRegistryPacket';
import ItemRegistryPacket from '@jsprismarine/protocol/packet/ItemRegistryPacket';
import JigsawStructureDataPacket from '@jsprismarine/protocol/packet/JigsawStructureDataPacket';
import { createHash } from 'node:crypto';

import { buildServerContent } from '../src/content/ServerContent';
import type { ServerContent } from '../src/content/ServerContent';
import { joinContentPayloads, limitCraftingData } from '../src/network/contentPayloads';
import { encodePacketBatch } from '../src/network/encodePacketBatch';
import { syncActorPropertyPacket } from '../src/network/actorProperties';
import { cachedJoinPacketBatch } from '../src/network/joinPacketCache';
import { stub } from '../src/testing/stub.test.helper';
import Codec2193 from '../src/network/codec/Codec2193';
import Codec2225 from '../src/network/codec/Codec2225';
import { craftingRecipeCount } from '../src/network/contentPayloads';
const argumentsAfterScript = process.argv.slice(2).filter((argument) => argument !== '--');
const COMPRESSION_LEVEL = Number.parseInt(argumentsAfterScript[0] ?? '7', 10);
const RECIPE_LIMIT = Number.parseInt(argumentsAfterScript[1] ?? '-1', 10);
const COMPRESSION_THRESHOLD = 256;
const SAMPLES = 5;

if (!Number.isInteger(COMPRESSION_LEVEL) || COMPRESSION_LEVEL < -1 || COMPRESSION_LEVEL > 9) {
    throw new RangeError('compression level must be an integer from -1 through 9');
}
if (!Number.isSafeInteger(RECIPE_LIMIT)) throw new RangeError('recipe limit must be a safe integer');

interface Candidate {
    readonly name: string;
    readonly create: () => NetworkPacket<unknown>;
}

interface Measurement {
    readonly rawBytes: number;
    readonly wireBytes: number;
    readonly cachedWireBytes: number;
    readonly encodeMs: number;
    readonly deflateMs: number;
    readonly cachedBuildMs: number;
    readonly cacheHitUs: number;
    readonly digest: string;
}

const logger = stub<Logger>({ info: () => {}, warn: () => {}, error: () => {} });
const content = buildServerContent();
const missingPacks = content.diagnostics.filter((diagnostic) => diagnostic.code === 'pack.missing');
if (missingPacks.length > 0) {
    throw new Error(
        `Full vanilla content is required for this benchmark; missing pack sources: ${missingPacks
            .map(({ pack, message }) => `${pack}: ${message}`)
            .join('; ')}`
    );
}
const defaultPayloads = joinContentPayloads(content, logger, { itemData: Codec2193.itemData });
if (defaultPayloads === undefined) throw new Error('Could not build vanilla join payloads');
if (craftingRecipeCount(defaultPayloads.crafting) === 0) {
    throw new Error('Full vanilla crafting data is required; run the pinned bedrock-data fetch and Java datagen first');
}

const candidatesFor = (contentBuild: ServerContent, codec: ProtocolCodec): Candidate[] => {
    const payloads = joinContentPayloads(contentBuild, logger, { itemData: codec.itemData });
    if (payloads === undefined) throw new Error(`Could not build join payloads for protocol ${codec.protocolVersion}`);

    const recipes = RECIPE_LIMIT < 0 ? payloads.crafting : limitCraftingData(payloads.crafting, RECIPE_LIMIT);
    const candidates: Candidate[] = [
        { name: 'JigsawStructureData', create: () => new JigsawStructureDataPacket() },
        { name: 'ItemRegistry', create: () => new ItemRegistryPacket({ items: [...payloads.items] }) },
        ...[...contentBuild.entities.registry.values()].flatMap((type) => {
            const packet = syncActorPropertyPacket(type.identifier, type.entity.description.properties);
            return packet === undefined
                ? []
                : [
                      {
                          name: `ActorProperties:${type.identifier}`,
                          create: () => {
                              const created = syncActorPropertyPacket(
                                  type.identifier,
                                  type.entity.description.properties
                              );
                              if (created === undefined)
                                  throw new Error(`Lost actor properties for ${type.identifier}`);
                              return created;
                          }
                      }
                  ];
        }),
        { name: 'AvailableActorIdentifiers', create: () => new AvailableActorIdentifiersPacket() },
        { name: 'BiomeDefinitionList', create: () => new BiomeDefinitionListPacket() },
        { name: 'FeatureRegistry', create: () => new FeatureRegistryPacket({ features: [] }) },
        { name: 'CreativeContent', create: () => new CreativeContentPacket(payloads.creative) }
    ];
    if (RECIPE_LIMIT !== 0 && craftingRecipeCount(recipes) > 0) {
        candidates.push({ name: 'CraftingData', create: () => new CraftingDataPacket(recipes) });
    }

    return candidates;
};

const encodedPacket = (source: NetworkPacket<unknown>, codec: ProtocolCodec): NetworkPacket<unknown> => {
    const packet = codec.prepareOutbound(source);
    const id = codec.netIdOf(packet.getName());
    if (id !== undefined) packet.setNetId(id);
    packet.encode(codec.context);
    return packet;
};

const median = (values: readonly number[]): number => {
    const ordered = [...values].sort((left, right) => left - right);
    return ordered[Math.floor(ordered.length / 2)]!;
};

const measureCandidate = async (
    contentBuild: ServerContent,
    codec: ProtocolCodec,
    candidate: Candidate
): Promise<Measurement> => {
    const encodeTimes: number[] = [];
    const deflateTimes: number[] = [];
    let rawBytes = 0;
    let wireBytes = 0;
    const compressor = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, level: COMPRESSION_LEVEL });

    for (let sample = 0; sample < SAMPLES; sample++) {
        const packet = candidate.create();
        const encodeStarted = performance.now();
        const encoded = encodedPacket(packet, codec);
        encodeTimes.push(performance.now() - encodeStarted);
        const raw = encoded.getBuffer();
        rawBytes = raw.byteLength;

        const deflateStarted = performance.now();
        const wire = compressor.encode([raw]);
        deflateTimes.push(performance.now() - deflateStarted);
        wireBytes = wire.byteLength;
    }

    const variation = `${candidate.name}:recipe-limit=${RECIPE_LIMIT}`;
    const packet = candidate.create();
    const cachedStarted = performance.now();
    const cached = await cachedJoinPacketBatch(
        contentBuild,
        codec,
        variation,
        COMPRESSION_LEVEL,
        COMPRESSION_THRESHOLD,
        [packet]
    );
    const cachedBuildMs = performance.now() - cachedStarted;

    const hitStarted = performance.now();
    const hit = await cachedJoinPacketBatch(contentBuild, codec, variation, COMPRESSION_LEVEL, COMPRESSION_THRESHOLD, [
        candidate.create()
    ]);
    const cacheHitUs = (performance.now() - hitStarted) * 1000;

    const fresh = encodePacketBatch([candidate.create()], codec, {
        compressionLevel: COMPRESSION_LEVEL,
        compressionThreshold: COMPRESSION_THRESHOLD
    });
    if (!cached.content.equals(fresh.content) || !hit.content.equals(fresh.content)) {
        throw new Error(`${codec.protocolVersion} ${candidate.name} cached bytes differ from a fresh encode`);
    }
    if (cached.packets[0]?.getBuffer().byteLength !== rawBytes) {
        throw new Error(`${codec.protocolVersion} ${candidate.name} cached raw size changed`);
    }

    return {
        rawBytes,
        wireBytes,
        cachedWireBytes: cached.content.byteLength,
        encodeMs: median(encodeTimes),
        deflateMs: median(deflateTimes),
        cachedBuildMs,
        cacheHitUs,
        digest: createHash('sha256').update(cached.content).digest('hex')
    };
};

console.log(
    `content=${content.items.types.size} resolved items, recipes=${craftingRecipeCount(defaultPayloads.crafting)}, compression-level=${COMPRESSION_LEVEL}, compression-threshold=${COMPRESSION_THRESHOLD}, recipe-limit=${RECIPE_LIMIT}`
);
console.log(
    'codec\tpacket\traw bytes\twire bytes before/after\tencode ms before/after\tdeflate ms before/after\tfirst cached build ms\tsteady cache hit µs\tsha256'
);

for (const codec of [Codec2193, Codec2225]) {
    for (const candidate of candidatesFor(content, codec)) {
        const result = await measureCandidate(content, codec, candidate);
        console.log(
            `${codec.protocolVersion}\t${candidate.name}\t${result.rawBytes}\t${result.wireBytes}/${result.cachedWireBytes}\t${result.encodeMs.toFixed(3)}/0.000\t${result.deflateMs.toFixed(3)}/0.000\t${result.cachedBuildMs.toFixed(3)}\t${result.cacheHitUs.toFixed(2)}\t${result.digest}`
        );
    }
}
