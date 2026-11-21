/**
 * `AddVolumeEntityPacket`: tells the client about a volume entity, the box a behavior pack's
 * volume definition covers, and the components that apply inside it.
 *
 * Protocol 2193 layout, in wire order: the entity network id, the components as a network NBT
 * compound (the docs leave its type as "unknown"), the JSON identifier and instance name, two
 * block positions, the dimension type, then the engine version.
 *
 * 1.26.70-preview.20 removes this packet and `RemoveVolumeEntityPacket`.
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';
import { blockPosStructure, networkNbtCompound } from '../structureTypes';

import type { PayloadOf } from '../../../wire/define';

/** The `AddVolumeEntityPacket` field list. */
export const addVolumeEntityPacket = definePacket('AddVolumeEntityPacket', {
    /** `Entity Network Id`, the `Raw Id` the server later removes the volume by. */
    entityNetworkId: t.varuint32,
    /** `Components`: the volume's components, such as `minecraft:fog`, as a network NBT compound. */
    components: networkNbtCompound,
    /** `JSON Identifier`: the volume definition's identifier, for example `custom:fog_volume`. */
    jsonIdentifier: t.string,
    /** `Instance Name` of this volume in the world. */
    instanceName: t.string,
    /** `Min Bounds`: the corner of the volume with the lowest coordinates, in blocks. */
    minBounds: blockPosStructure,
    /** `Max Bounds`: the corner of the volume with the highest coordinates, in blocks. */
    maxBounds: blockPosStructure,
    /** `Dimension Type`: 0 for the Overworld, 1 for the Nether, 2 for the End. */
    dimension: t.varint32,
    /** `Engine Version` the volume definition was written for, as a semantic version string. */
    engineVersion: t.string
});

/** The fields of an `AddVolumeEntityPacket`, in wire order. */
export type AddVolumeEntityPayload = PayloadOf<typeof addVolumeEntityPacket>;
