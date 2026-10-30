/**
 * Resource pack negotiation payloads. The info packet advertises pack metadata and whether
 * packs are required; the stack packet selects the order and experiments for the world.
 * Field names and order follow each packet's docs page.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { Experiment } from '@jsprismarine/minecraft';
import type { WireType } from '../fieldTypes';
import type { PackIdVersion, ResourcePackEntry } from '../../packet/ResourcePacksInfoPacket';
import type { ResourcePackStackEntry } from '../../packet/ResourcePackStackPacket';

/** `PackIdVersion` on the wire: the two uuid halves, then the version string. */
const packIdVersion = t.custom<PackIdVersion>(
    'PackIdVersion',
    (s, v) => {
        t.lu64.write(s, v.uuidMostSignificant);
        t.lu64.write(s, v.uuidLeastSignificant);
        t.string.write(s, v.version);
    },
    (s) => ({
        uuidMostSignificant: t.lu64.read(s),
        uuidLeastSignificant: t.lu64.read(s),
        version: t.string.read(s)
    })
);

/** `PackInfoData` on the wire, in docs order. */
const resourcePackEntry = t.custom<ResourcePackEntry>(
    'PackInfoData',
    (s, v) => {
        packIdVersion.write(s, v.id);
        t.lu64.write(s, v.sizeBytes);
        t.string.write(s, v.contentKey);
        t.string.write(s, v.subPackName);
        t.string.write(s, v.contentIdentity);
        t.bool.write(s, v.hasScripts);
        t.bool.write(s, v.isAddonPack);
        t.bool.write(s, v.isRayTracingCapable);
        t.string.write(s, v.cdnUrl);
    },
    (s) => ({
        id: packIdVersion.read(s),
        sizeBytes: t.lu64.read(s),
        contentKey: t.string.read(s),
        subPackName: t.string.read(s),
        contentIdentity: t.string.read(s),
        hasScripts: t.bool.read(s),
        isAddonPack: t.bool.read(s),
        isRayTracingCapable: t.bool.read(s),
        cdnUrl: t.string.read(s)
    })
);

/** The `ResourcePacksInfoPacket` field list. */
export const resourcePacksInfoPacket = definePacket('ResourcePacksInfoPacket', {
    /** `Resource Pack Required`: whether the client must accept before joining. */
    resourcePackRequired: t.bool,
    /** `Has Addon Packs`. */
    hasAddonPacks: t.bool,
    /** `Has Scripts`. */
    hasScripts: t.bool,
    /** `Force Disable Vibrant Visuals`: turns deferred rendering off for the session. */
    forceDisableVibrantVisuals: t.bool,
    /** `World Template Id And Version`: all zeroes and an empty version for a template-free world. */
    worldTemplate: packIdVersion,
    /** `Resource Packs`: one entry per pack the client has to download. */
    resourcePackEntries: t.list(resourcePackEntry)
});

/** The docs' `PackInstanceId` on the wire: `Pack ID`, `Version`, `Sub Pack Name` strings. */
const packInstanceId = t.custom<ResourcePackStackEntry>(
    'PackInstanceId',
    (s, v) => {
        t.string.write(s, v.uuid);
        t.string.write(s, v.version);
        t.string.write(s, v.subPackName);
    },
    (s) => ({ uuid: t.string.read(s), version: t.string.read(s), subPackName: t.string.read(s) })
);

/** One `Experiments` toggle: `Name` string, `Enabled` boolean. */
const experimentToggle = t.custom<Experiment>(
    'ExperimentToggle',
    (s, v) => {
        t.string.write(s, v.name);
        t.bool.write(s, v.enabled);
    },
    (s) => ({ name: t.string.read(s), enabled: t.bool.read(s) })
);

/**
 * The `ResourcePackStackPacket` field list.
 *
 * One pack list, not two. 748 sent the behavior packs ahead of the texture packs, and a reader
 * that still expects them takes the texture pack count for the behavior pack count and every
 * field after it is read from the wrong place.
 */
export const resourcePackStackPacket = definePacket('ResourcePackStackPacket', {
    /** `Texture Pack Required`: when true the client must download the packs or leave. */
    texturePackRequired: t.bool,
    /** `Texture Pack List`, applied in order with the first entry on top. */
    texturePacks: t.list(packInstanceId),
    /** `Base Game Version`. Vanilla sends `*`. */
    gameVersion: t.string,
    /**
     * `Experiments` toggles: active toggles followed by always-on ones. The docs mark the
     * count "No size compression": uint32 little endian, the one non-varint count here.
     */
    experiments: t.listWith(t.lu32, experimentToggle),
    /** `ExperimentsEverToggled`: whether any experiment was ever toggled in this world. */
    experimentsAlreadyEnabled: t.bool,
    /** `Include Editor Packs`: whether an Editor world adds the vanilla editor packs. */
    includeEditorPacks: t.bool
});

/**
 * The `ResourcePackChunkRequestPacket` field list.
 *
 * `Chunk` is a signed int32, not a varint: a chunk index travels as four fixed bytes.
 */
export const resourcePackChunkRequestPacket = definePacket('ResourcePackChunkRequestPacket', {
    /** `Resource Name`: the pack id and version joined by an underscore. */
    resourceName: t.string,
    /** `Chunk`: the zero-based index of the chunk wanted. */
    chunk: t.li32
});

/**
 * The `ResourcePackChunkDataPacket` field list.
 *
 * The chunk may be no larger than the `Chunk Size` announced in `ResourcePackDataInfoPacket`.
 */
export const resourcePackChunkDataPacket = definePacket('ResourcePackChunkDataPacket', {
    /** `Resource Name`: the pack id and version joined by an underscore, as the request named them. */
    resourceName: t.string,
    /** `Chunk ID`: the zero-based index of this chunk. */
    chunkId: t.lu32,
    /** `Byte Offset`: where this chunk starts in the zip, in bytes. */
    byteOffset: t.lu64,
    /** `Chunk Data`: a varint byte length, then the chunk's bytes. */
    chunkData: t.byteArray
});

/**
 * The `ResourcePackDataInfoPacket` field list.
 *
 * The client answers with one `ResourcePackChunkRequestPacket` per chunk, and the server
 * replies to each with a `ResourcePackChunkDataPacket`.
 */
export const resourcePackDataInfoPacket = definePacket('ResourcePackDataInfoPacket', {
    /** `Resource Name`: the pack id and version joined by an underscore. */
    resourceName: t.string,
    /** `Chunk Size`: the largest chunk, in bytes. */
    chunkSize: t.lu32,
    /** `Number of Chunks`: how many chunks the pack is split into. */
    numberOfChunks: t.lu32,
    /** `File Size`: the size of the whole zip, in bytes. */
    fileSize: t.lu64,
    /** `File Hash`: a SHA256 digest of the zip, as raw bytes rather than text. */
    fileHash: t.byteArray,
    /** `Is Premium Pack`: whether the player needs an entitlement to use the pack. */
    isPremiumPack: t.bool,
    /** `Pack Type`: a `PackType`, 6 for a resource pack. */
    packType: t.uint8
});

/**
 * The `Response Type` string of each alternative, indexed by the alternative index.
 *
 * Real clients and gophertunnel send these in lower case. Mojang's docs list them as `Cancel`,
 * `Downloading`, `DownloadingFinished` and `ResourcePackStackFinished`. The lower case form is
 * the one proven on the wire, so it stays. Decoding discards the string, so either casing reads.
 */
const RESPONSE_TYPE_NAMES = ['cancel', 'downloading', 'downloadingfinished', 'resourcepackstackfinished'];

/**
 * What separates a status from its alternative index: `Refused` is 1 and `Cancel` is alternative 0.
 *
 * Protocol 2207 renumbers the docs enum to 1..4, which matches the status values. A bump past 2193
 * has to drop this offset.
 */
const ALTERNATIVE_OFFSET = 1;

/** The status whose alternative is the only one followed by `Downloading Packs`. */
const SEND_PACKS = 2;

/** The decoded `Response`: a status and, for `SendPacks` only, the packs being downloaded. */
export interface ResourcePackResponseData {
    /** The alternative index plus one, as `ResourcePackStatus` numbers it. */
    status: number;
    /** `Downloading Packs`. Empty for every status other than `SendPacks`. */
    packIds: string[];
}

/**
 * `Response`: a `oneOf` of four alternatives, as the alternative index then its name.
 *
 * Which fields travel is decided by the answer itself, not by the protocol version, so the
 * branch lives in this wire type's reader and writer rather than in a gate.
 */
export const resourcePackResponse: WireType<ResourcePackResponseData> = t.custom(
    'Response',
    (stream, response) => {
        const selector = response.status - ALTERNATIVE_OFFSET;
        const name = RESPONSE_TYPE_NAMES[selector];
        if (name === undefined) throw new Error(`No resource pack response alternative for status ${response.status}`);

        t.varuint32.write(stream, selector);
        t.string.write(stream, name);

        if (response.status !== SEND_PACKS) return;

        t.varuint32.write(stream, response.packIds.length);
        for (const id of response.packIds) {
            t.string.write(stream, id);
        }
    },
    (stream) => {
        const selector = t.varuint32.read(stream);
        if (selector >= RESPONSE_TYPE_NAMES.length) {
            throw new Error(`Unknown resource pack response alternative ${selector}`);
        }

        const status = selector + ALTERNATIVE_OFFSET;
        t.string.read(stream);

        if (status !== SEND_PACKS) return { status, packIds: [] };

        const packIds: string[] = [];
        let count = t.varuint32.read(stream);
        while (count-- > 0) {
            packIds.push(t.string.read(stream));
        }

        return { status, packIds };
    }
);

/**
 * The `ResourcePackClientResponsePacket` field list: one field, `Response`.
 *
 * The schema types `Response Type` as an int8 and caps `Downloading Packs` at 65535 entries,
 * which reads like a one byte status and a uint16 count. That is the layout before protocol
 * 2193. Since the Cereal conversion the bytes are the ones above: a 1.26.51 client's
 * `DownloadingFinished` is `02 13` followed by the 19 bytes of `downloadingfinished`, and
 * gophertunnel at protocol 2193 writes the same. Until protocol 748 the list was written after
 * every alternative; a real server reads the two stray bytes as the next packet.
 */
export const resourcePackClientResponsePacket = definePacket('ResourcePackClientResponsePacket', {
    /** `Response`: which answer this is, and the packs it names. */
    response: resourcePackResponse
});
