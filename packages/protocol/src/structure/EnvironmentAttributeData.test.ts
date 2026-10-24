import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import EnvironmentAttributeData, {
    AttributeDataType,
    BoolAttributeOperation,
    ColorAttributeOperation,
    FloatAttributeOperation
} from './EnvironmentAttributeData';
import NoiseAlignment, { NoiseAlignmentType } from './NoiseAlignment';

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

/** `TRANSITIONING` on the wire, written by hand in the order the docs list the fields. */
const TRANSITIONING_BYTES = Buffer.from([
    ...[0x0b, ...Buffer.from('fog_density', 'utf8')], // AttributeName, 11 bytes
    0x01, // FromAttribute is present
    0x01, // FromAttribute selector: FloatAttributeData
    ...[0x00, 0x00, 0x80, 0x3e], // value 0.25, little-endian float
    ...[0x03, ...Buffer.from('ADD', 'utf8')], // operation
    0x01, // constraintMin is present
    ...[0x00, 0x00, 0x80, 0xbf], // constraintMin -1
    0x00, // constraintMax is absent
    0x02, // Attribute selector: ColorAttributeData
    ...[0x20, 0x40, 0xff, 0x80], // value 0x80ff4020, little-endian uint32
    ...[0x08, ...Buffer.from('MULTIPLY', 'utf8')], // operation
    0x01, // ToAttribute is present
    0x00, // ToAttribute selector: BoolAttributeData
    0x01, // value true
    ...[0x04, ...Buffer.from('XNOR', 'utf8')], // operation
    ...[0x14, 0x00, 0x00, 0x00], // CurrentTransitionTicks 20, little-endian uint32
    ...[0x64, 0x00, 0x00, 0x00], // TotalTransitionTicks 100
    ...[0x0b, ...Buffer.from('in_out_quad', 'utf8')], // Easing, the lower-case docs name
    ...[0x05, 0x00, 0x00, 0x00], // LocalTransitionTicks 5
    0x01, // NoiseTransition
    0x00, // NoiseAlignment type minLocalTransitionEnd
    ...[0xac, 0x02] // NoiseAlignment value 300, varuint32
]);

/** The default attribute on the wire: no name, no transition, boolean false overriding. */
const DEFAULT_BYTES = Buffer.from([
    0x00, // AttributeName ""
    0x00, // FromAttribute is absent
    0x00, // Attribute selector: BoolAttributeData
    0x00, // value false
    ...[0x08, ...Buffer.from('OVERRIDE', 'utf8')], // operation
    0x00, // ToAttribute is absent
    ...[0x00, 0x00, 0x00, 0x00], // CurrentTransitionTicks 0
    ...[0x00, 0x00, 0x00, 0x00], // TotalTransitionTicks 0
    ...[0x06, ...Buffer.from('linear', 'utf8')], // Easing
    ...[0x00, 0x00, 0x00, 0x00], // LocalTransitionTicks 0
    0x00, // NoiseTransition
    0x00, // NoiseAlignment type
    0x00 // NoiseAlignment value 0
]);

describe('EnvironmentAttributeData', () => {
    it('writes every field and all three value alternatives in docs order', () => {
        const stream = new NetworkBinaryStream();
        TRANSITIONING.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...TRANSITIONING_BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(TRANSITIONING_BYTES);
        const attribute = EnvironmentAttributeData.deserialize(stream);

        expect(attribute).toEqual(TRANSITIONING);
        expect(stream.feof()).toBe(true);
    });

    it('writes the default attribute with absent optionals', () => {
        const stream = new NetworkBinaryStream();
        new EnvironmentAttributeData().serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...DEFAULT_BYTES]);
    });

    it('reads the default attribute back', () => {
        const stream = new NetworkBinaryStream(DEFAULT_BYTES);
        const attribute = EnvironmentAttributeData.deserialize(stream);

        expect(attribute).toEqual(new EnvironmentAttributeData());
        expect(stream.feof()).toBe(true);
    });

    it('rejects an operation name the docs do not list', () => {
        const bytes = Buffer.from([0x00, 0x00, 0x00, 0x00, ...[0x03, ...Buffer.from('FOO', 'utf8')]]);

        expect(() => EnvironmentAttributeData.deserialize(new NetworkBinaryStream(bytes))).toThrow(
            'Unknown BoolAttributeOperation "FOO"'
        );
    });

    it('rejects a value selector outside the three alternatives', () => {
        const bytes = Buffer.from([0x00, 0x00, 0x03]);

        expect(() => EnvironmentAttributeData.deserialize(new NetworkBinaryStream(bytes))).toThrow(
            'Unknown attribute value alternative 3'
        );
    });
});
