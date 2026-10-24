import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import AttributeLayerData from './AttributeLayerData';
import AttributeLayerSettings from './AttributeLayerSettings';
import EnvironmentAttributeData, { AttributeDataType, BoolAttributeOperation } from './EnvironmentAttributeData';
import NoiseAlignment from './NoiseAlignment';

/** A Nether layer sampling a noise, with one boolean attribute that is not transitioning. */
const NIGHT = new AttributeLayerData('night', 'perlin', 1, new AttributeLayerSettings(7, 0.75, true, false), [
    new EnvironmentAttributeData({
        attributeName: 'a',
        attribute: { type: AttributeDataType.Bool, value: false, operation: BoolAttributeOperation.OVERRIDE },
        currentTransitionTicks: 0,
        totalTransitionTicks: 0,
        easing: 'linear',
        localTransitionTicks: 0,
        noiseTransition: false,
        noiseAlignment: new NoiseAlignment()
    })
]);

/** `NIGHT` on the wire, written by hand in the order the docs list the fields. */
const NIGHT_BYTES = Buffer.from([
    ...[0x05, ...Buffer.from('night', 'utf8')], // Name
    0x01, // NoiseName is present
    ...[0x06, ...Buffer.from('perlin', 'utf8')], // NoiseName
    0x02, // Dimension 1, ZigZag varint32
    ...[0x07, 0x00, 0x00, 0x00], // Settings: Priority 7, little-endian int32
    ...[0x00, 0x00, 0x40, 0x3f], // Settings: Weight 0.75, little-endian float
    0x01, // Settings: Enabled
    0x00, // Settings: TransitionsPaused
    0x01, // Attributes count, varuint32
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
]);

/** The default layer on the wire: no name, no noise, Overworld, zero settings, no attributes. */
const DEFAULT_BYTES = Buffer.from([
    0x00, // Name ""
    0x00, // NoiseName is absent
    0x00, // Dimension 0
    ...Array.from({ length: 10 }, () => 0x00), // Settings, all zero
    0x00 // Attributes count
]);

describe('AttributeLayerData', () => {
    it('writes every field in docs order', () => {
        const stream = new NetworkBinaryStream();
        NIGHT.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...NIGHT_BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(NIGHT_BYTES);
        const layer = AttributeLayerData.deserialize(stream);

        expect(layer).toEqual(NIGHT);
        expect(stream.feof()).toBe(true);
    });

    it('writes the default layer as 14 bytes', () => {
        const stream = new NetworkBinaryStream();
        new AttributeLayerData().serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...DEFAULT_BYTES]);
    });

    it('reads the default layer back', () => {
        const stream = new NetworkBinaryStream(DEFAULT_BYTES);
        const layer = AttributeLayerData.deserialize(stream);

        expect(layer).toEqual(new AttributeLayerData());
        expect(stream.feof()).toBe(true);
    });
});
