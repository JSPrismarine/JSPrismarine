import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import AttributeLayerData from '../structure/AttributeLayerData';
import AttributeLayerData2225 from '../structure/AttributeLayerData2225';
import AttributeLayerSettings from '../structure/AttributeLayerSettings';
import { EasingType } from '../structure/CameraInstruction';
import EnvironmentAttributeData, {
    AttributeDataType,
    BoolAttributeOperation,
    ColorAttributeOperation,
    FloatAttributeOperation
} from '../structure/EnvironmentAttributeData';
import EnvironmentAttributeData2225, { AttributePayloadType } from '../structure/EnvironmentAttributeData2225';
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

/** A constant boolean attribute at protocol 2225. */
const CONSTANT_2225 = new EnvironmentAttributeData2225('a', {
    type: AttributePayloadType.Constant,
    attribute: { type: AttributeDataType.Bool, value: true, operation: BoolAttributeOperation.XNOR }
});

/** `CONSTANT_2225` on the wire. */
const CONSTANT_2225_BYTES = [
    ...[0x01, ...Buffer.from('a', 'utf8')], // AttributeName
    0x00, // Payload selector: ConstantAttributeData
    0x00, // Attribute selector: BoolAttributeData
    0x01, // value true
    ...[0x04, ...Buffer.from('XNOR', 'utf8')] // operation
];

/** A float to color transition with no noise. */
const TRANSITION_2225 = new EnvironmentAttributeData2225('fog', {
    type: AttributePayloadType.Transition,
    fromAttribute: {
        type: AttributeDataType.Float,
        value: 1,
        operation: FloatAttributeOperation.ADD,
        constraintMax: 2
    },
    toAttribute: { type: AttributeDataType.Color, value: 0x01020304, operation: ColorAttributeOperation.MULTIPLY },
    settings: { totalTransitionTicks: 300, currentTransitionTicks: 7, easing: EasingType.IN_OUT_BOUNCE, clockName: 'c' }
});

/** `TRANSITION_2225` on the wire. */
const TRANSITION_2225_BYTES = [
    ...[0x03, ...Buffer.from('fog', 'utf8')], // AttributeName
    0x01, // Payload selector: TransitionAttributeData
    0x01, // FromAttribute selector: FloatAttributeData
    ...[0x00, 0x00, 0x80, 0x3f], // value 1, little-endian float
    ...[0x03, ...Buffer.from('ADD', 'utf8')], // operation
    0x00, // constraintMin is absent
    0x01, // constraintMax is present
    ...[0x00, 0x00, 0x00, 0x40], // constraintMax 2
    0x02, // ToAttribute selector: ColorAttributeData
    ...[0x04, 0x03, 0x02, 0x01], // value, little-endian uint32
    ...[0x08, ...Buffer.from('MULTIPLY', 'utf8')], // operation
    ...[0xac, 0x02], // TotalTransitionTicks 300, varuint32
    0x07, // CurrentTransitionTicks
    0x32, // Easing 25 (in_out_bounce), ZigZag varint32
    ...[0x01, ...Buffer.from('c', 'utf8')] // ClockName
];

/** A noise-driven transition between two booleans. */
const NOISE_2225 = new EnvironmentAttributeData2225('n', {
    type: AttributePayloadType.NoiseTransition,
    fromAttribute: { type: AttributeDataType.Bool, value: false, operation: BoolAttributeOperation.OVERRIDE },
    toAttribute: { type: AttributeDataType.Bool, value: true, operation: BoolAttributeOperation.OR },
    settings: {
        totalTransitionTicks: 10,
        currentTransitionTicks: 0,
        easing: EasingType.LINEAR,
        clockName: '',
        localTransitionTicks: 3,
        noiseName: 'perlin',
        noiseAlignment: new NoiseAlignment(NoiseAlignmentType.MIN_LOCAL_TRANSITION_END, 300)
    }
});

/** `NOISE_2225` on the wire. */
const NOISE_2225_BYTES = [
    ...[0x01, ...Buffer.from('n', 'utf8')], // AttributeName
    0x02, // Payload selector: NoiseTransitionAttributeData
    0x00, // FromAttribute selector: BoolAttributeData
    0x00, // value false
    ...[0x08, ...Buffer.from('OVERRIDE', 'utf8')], // operation
    0x00, // ToAttribute selector: BoolAttributeData
    0x01, // value true
    ...[0x02, ...Buffer.from('OR', 'utf8')], // operation
    0x0a, // TotalTransitionTicks
    0x00, // CurrentTransitionTicks
    0x00, // Easing 0 (linear)
    0x00, // ClockName ""
    0x03, // LocalTransitionTicks
    ...[0x06, ...Buffer.from('perlin', 'utf8')], // NoiseName
    0x00, // NoiseAlignment type
    ...[0xac, 0x02] // NoiseAlignment value 300, varuint32
];

const UPDATE_LAYERS_2225: ClientboundAttributeLayerSync = {
    data: {
        type: AttributeLayerSyncDataType.UpdateAttributeLayers,
        attributeLayers: [
            new AttributeLayerData2225('night', 1, new AttributeLayerSettings(7, 0.75, true, false), [
                CONSTANT_2225,
                TRANSITION_2225,
                NOISE_2225
            ])
        ]
    }
};

/** `UPDATE_LAYERS_2225` on the wire: no `NoiseName` after the layer's name. */
const UPDATE_LAYERS_2225_BYTES = Buffer.from([
    ...HEADER,
    0x00, // Data selector: UpdateAttributeLayersData
    0x01, // Attribute Layers count
    ...[0x05, ...Buffer.from('night', 'utf8')], // Name
    0x02, // Dimension 1, ZigZag varint32
    ...[0x07, 0x00, 0x00, 0x00], // Settings: Priority 7
    ...[0x00, 0x00, 0x40, 0x3f], // Settings: Weight 0.75
    0x01, // Settings: Enabled
    0x00, // Settings: TransitionsPaused
    0x03, // Attributes count
    ...CONSTANT_2225_BYTES,
    ...TRANSITION_2225_BYTES,
    ...NOISE_2225_BYTES
]);

const UPDATE_ATTRIBUTES_2225: ClientboundAttributeLayerSync = {
    data: {
        type: AttributeLayerSyncDataType.UpdateEnvironmentAttributes,
        attributeLayerName: 'night',
        attributeLayerDimension: 2,
        attributes: [TRANSITION_2225]
    }
};

const at2225 = { protocolVersion: 2225 };

describe('ClientboundAttributeLayerSyncPacket at protocol 2225', () => {
    it('writes UpdateAttributeLayersData without NoiseName and with attribute payloads', () => {
        const buffer = new ClientboundAttributeLayerSyncPacket(UPDATE_LAYERS_2225).serialize(
            new NetworkBinaryStream(),
            at2225
        );

        expect([...buffer]).toEqual([...UPDATE_LAYERS_2225_BYTES]);
    });

    it('reads a hand-built UpdateAttributeLayersData to its end', () => {
        const stream = new NetworkBinaryStream(UPDATE_LAYERS_2225_BYTES);
        const data = new ClientboundAttributeLayerSyncPacket().deserialize(stream, at2225);

        expect(data).toEqual(UPDATE_LAYERS_2225);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips UpdateEnvironmentAttributesData', () => {
        const buffer = new ClientboundAttributeLayerSyncPacket(UPDATE_ATTRIBUTES_2225).serialize(
            new NetworkBinaryStream(),
            at2225
        );

        expect([...buffer]).toEqual([
            ...HEADER,
            0x02, // Data selector: UpdateEnvironmentAttributesData
            ...[0x05, ...Buffer.from('night', 'utf8')], // Attribute Layer Name
            0x04, // Attribute Layer Dimension 2, ZigZag varint32
            0x01, // Attributes count
            ...TRANSITION_2225_BYTES
        ]);
        expect(new ClientboundAttributeLayerSyncPacket().deserialize(new NetworkBinaryStream(buffer), at2225)).toEqual(
            UPDATE_ATTRIBUTES_2225
        );
    });

    it('writes the alternatives that carry no layer structure as it does at 2193', () => {
        for (const data of [UPDATE_SETTINGS, REMOVE_ATTRIBUTES]) {
            const at2193 = new ClientboundAttributeLayerSyncPacket(data).serialize(new NetworkBinaryStream());
            const at2225Bytes = new ClientboundAttributeLayerSyncPacket(data).serialize(
                new NetworkBinaryStream(),
                at2225
            );

            expect([...at2225Bytes]).toEqual([...at2193]);
        }
    });

    it('rejects an unknown easing value', () => {
        const bytes = Buffer.from(TRANSITION_2225_BYTES);
        const easing = bytes.indexOf(0x32, TRANSITION_2225_BYTES.length - 4);
        bytes[easing] = 0x40; // 32, one past in_out_elastic
        const stream = new NetworkBinaryStream(
            Buffer.from([...HEADER, 0x02, ...[0x05, ...Buffer.from('night', 'utf8')], 0x00, 0x01, ...bytes])
        );

        expect(() => new ClientboundAttributeLayerSyncPacket().deserialize(stream, at2225)).toThrow(
            'Unknown easing_function 32'
        );
    });

    it('refuses layers built for the 2193 layout', () => {
        expect(() =>
            new ClientboundAttributeLayerSyncPacket(UPDATE_LAYERS).serialize(new NetworkBinaryStream(), at2225)
        ).toThrow('no Data in the 2225 layout');
    });

    it('refuses layers built for the 2225 layout at 2193', () => {
        expect(() =>
            new ClientboundAttributeLayerSyncPacket(UPDATE_LAYERS_2225).serialize(new NetworkBinaryStream())
        ).toThrow('no Data in the 2193 layout');
    });
});
