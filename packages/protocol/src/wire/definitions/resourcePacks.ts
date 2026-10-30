/**
 * The resource pack negotiation packets, layouts unchanged between protocols 2193 and 2225.
 * Field names and order follow each packet's docs page.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PackIdVersion, ResourcePackEntry } from '../../packet/ResourcePacksInfoPacket';

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
