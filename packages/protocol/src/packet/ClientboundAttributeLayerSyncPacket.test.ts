import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import AttributeLayerData from '../structure/AttributeLayerData';
import AttributeLayerSettings from '../structure/AttributeLayerSettings';
import EnvironmentAttributeData, {
    AttributeDataType,
    BoolAttributeOperation,
    ColorAttributeOperation,
    FloatAttributeOperation
} from '../structure/EnvironmentAttributeData';
import NoiseAlignment, { NoiseAlignmentType } from '../structure/NoiseAlignment';
import ClientboundAttributeLayerSyncPacket, { AttributeLayerSyncDataType } from './ClientboundAttributeLayerSyncPacket';

import type { ClientboundAttributeLayerSync } from './ClientboundAttributeLayerSyncPacket';

/** The packet id header: 345 as a varuint32. */
const HEADER = [0xd9, 0x02];

/** A boolean attribute that is not transitioning. */
const STILL = new EnvironmentAttributeData({
    attributeName: 'a',
    attribute: { type: AttributeDataType.Bool, value: false, operation: BoolAttributeOperation.OVERRIDE },
    currentTransitionTicks: 0,
    totalTransitionTicks: 0,
    easing: 'linear',
    localTransitionTicks: 0,
    noiseTransition: false,
    noiseAlignment: new NoiseAlignment()
});

/** `STILL` on the wire. */
const STILL_BYTES = [
    ...[0x01, ...Buffer.from('a', 'utf8')], // AttributeName
    0x00, // FromAttribute is absent
    0x00, // Attribute selector: BoolAttributeData
    0x00, // value false
    ...[0x08, ...Buffer.from('OVERRIDE', 'utf8')], // operation
    0x00, // ToAttribute is absent
    ...[0x00, 0x00, 0x00, 0x00], // CurrentTransitionTicks
    ...[0x00, 0x00, 0x00, 0x00], // TotalTransitionTicks
    ...[0x06, ...Buffer.from('linear', 'utf8')], // Easing
    ...[0x00, 0x00, 0x00, 0x00], // LocalTransitionTicks
    0x00, // NoiseTransition
    0x00, // NoiseAlignment type
    0x00 // NoiseAlignment value
];

/** An attribute mid-transition that exercises all three value alternatives. */
const TRANSITIONING = new EnvironmentAttributeData({
    attributeName: 'fog_density',
    fromAttribute: {
        type: AttributeDataType.Float,
        value: 0.25,
        operation: FloatAttributeOperation.ADD,
        constraintMin: -1
    },
    attribute: { type: AttributeDataType.Color, value: 0x80ff4020, operation: ColorAttributeOperation.MULTIPLY },
    toAttribute: { type: AttributeDataType.Bool, value: true, operation: BoolAttributeOperation.XNOR },
    currentTransitionTicks: 20,
    totalTransitionTicks: 100,
    easing: 'in_out_quad',
    localTransitionTicks: 5,
    noiseTransition: true,
    noiseAlignment: new NoiseAlignment(NoiseAlignmentType.MIN_LOCAL_TRANSITION_END, 300)
});

const UPDATE_LAYERS: ClientboundAttributeLayerSync = {
    data: {
        type: AttributeLayerSyncDataType.UpdateAttributeLayers,
        attributeLayers: [
            new AttributeLayerData('night', 'perlin', 1, new AttributeLayerSettings(7, 0.75, true, false), [STILL])
        ]
    }
};

/** `UPDATE_LAYERS` on the wire, header bytes included, written by hand in the order the docs list the fields. */
const UPDATE_LAYERS_BYTES = Buffer.from([
    ...HEADER,
    0x00, // Data selector: UpdateAttributeLayersData
    0x01, // Attribute Layers count, varuint32
    ...[0x05, ...Buffer.from('night', 'utf8')], // Name
    0x01, // NoiseName is present
    ...[0x06, ...Buffer.from('perlin', 'utf8')], // NoiseName
    0x02, // Dimension 1, ZigZag varint32
    ...[0x07, 0x00, 0x00, 0x00], // Settings: Priority 7, little-endian int32
    ...[0x00, 0x00, 0x40, 0x3f], // Settings: Weight 0.75, little-endian float
    0x01, // Settings: Enabled
    0x00, // Settings: TransitionsPaused
    0x01, // Attributes count, varuint32
    ...STILL_BYTES
]);

const UPDATE_SETTINGS: ClientboundAttributeLayerSync = {
    data: {
        type: AttributeLayerSyncDataType.UpdateAttributeLayerSettings,
        attributeLayerName: 'night',
        attributeLayerDimension: -1,
        attributeLayerSettings: new AttributeLayerSettings(-2, 1.5, false, true)
    }
};

/** `UPDATE_SETTINGS` on the wire. */
const UPDATE_SETTINGS_BYTES = Buffer.from([
    ...HEADER,
    0x01, // Data selector: UpdateAttributeLayerSettingsData
    ...[0x05, ...Buffer.from('night', 'utf8')], // Attribute Layer Name
    0x01, // Attribute Layer Dimension -1, ZigZag varint32
    ...[0xfe, 0xff, 0xff, 0xff], // Priority -2, little-endian int32
    ...[0x00, 0x00, 0xc0, 0x3f], // Weight 1.5, little-endian float
    0x00, // Enabled
    0x01 // TransitionsPaused
]);

const UPDATE_ATTRIBUTES: ClientboundAttributeLayerSync = {
    data: {
        type: AttributeLayerSyncDataType.UpdateEnvironmentAttributes,
        attributeLayerName: 'night',
        attributeLayerDimension: 2,
        attributes: [TRANSITIONING, STILL]
    }
};

const REMOVE_ATTRIBUTES: ClientboundAttributeLayerSync = {
    data: {
        type: AttributeLayerSyncDataType.RemoveEnvironmentAttributes,
        attributeLayerName: 'night',
        attributeLayerDimension: 0,
        attributes: ['fog_density', 'a']
    }
};

/** `REMOVE_ATTRIBUTES` on the wire. */
const REMOVE_ATTRIBUTES_BYTES = Buffer.from([
    ...HEADER,
    0x03, // Data selector: RemoveEnvironmentAttributesData
    ...[0x05, ...Buffer.from('night', 'utf8')], // Attribute Layer Name
    0x00, // Attribute Layer Dimension 0
    0x02, // Attributes count, varuint32
    ...[0x0b, ...Buffer.from('fog_density', 'utf8')], // first removed attribute name
    ...[0x01, ...Buffer.from('a', 'utf8')] // second removed attribute name
]);

const roundTrip = (data: ClientboundAttributeLayerSync): ClientboundAttributeLayerSync => {
    const buffer = new ClientboundAttributeLayerSyncPacket(data).serialize(new NetworkBinaryStream());
    return new ClientboundAttributeLayerSyncPacket().deserialize(new NetworkBinaryStream(buffer));
};

describe('ClientboundAttributeLayerSyncPacket', () => {
    it('writes UpdateAttributeLayersData in the order protocol 2193 defines', () => {
        const buffer = new ClientboundAttributeLayerSyncPacket(UPDATE_LAYERS).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...UPDATE_LAYERS_BYTES]);
    });

    it('reads a hand-built UpdateAttributeLayersData to its end', () => {
        const stream = new NetworkBinaryStream(UPDATE_LAYERS_BYTES);
        const data = new ClientboundAttributeLayerSyncPacket().deserialize(stream);

        expect(data).toEqual(UPDATE_LAYERS);
        expect(stream.feof()).toBe(true);
    });

    it('writes UpdateAttributeLayerSettingsData after the name and dimension', () => {
        const buffer = new ClientboundAttributeLayerSyncPacket(UPDATE_SETTINGS).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...UPDATE_SETTINGS_BYTES]);
    });

    it('reads a hand-built UpdateAttributeLayerSettingsData to its end', () => {
        const stream = new NetworkBinaryStream(UPDATE_SETTINGS_BYTES);
        const data = new ClientboundAttributeLayerSyncPacket().deserialize(stream);

        expect(data).toEqual(UPDATE_SETTINGS);
        expect(stream.feof()).toBe(true);
    });

    it('writes RemoveEnvironmentAttributesData as a list of names', () => {
        const buffer = new ClientboundAttributeLayerSyncPacket(REMOVE_ATTRIBUTES).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...REMOVE_ATTRIBUTES_BYTES]);
    });

    it('reads a hand-built RemoveEnvironmentAttributesData to its end', () => {
        const stream = new NetworkBinaryStream(REMOVE_ATTRIBUTES_BYTES);
        const data = new ClientboundAttributeLayerSyncPacket().deserialize(stream);

        expect(data).toEqual(REMOVE_ATTRIBUTES);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips every alternative', () => {
        for (const data of [UPDATE_LAYERS, UPDATE_SETTINGS, UPDATE_ATTRIBUTES, REMOVE_ATTRIBUTES]) {
            expect(roundTrip(data)).toEqual(data);
        }
    });

    it('rejects a selector outside the four alternatives', () => {
        const stream = new NetworkBinaryStream(Buffer.from([...HEADER, 0x04]));

        expect(() => new ClientboundAttributeLayerSyncPacket().deserialize(stream)).toThrow(
            'Unknown ClientboundAttributeLayerSyncPacket data variant 4'
        );
    });
});
