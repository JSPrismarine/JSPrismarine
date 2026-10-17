import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { Attribute, AttributeIds, Attributes } from './Attribute';

describe('entity', () => {
    describe('Attribute', () => {
        // Protocol 748 (Minecraft 1.21.42) serialises an attribute as
        //   min, max, current, default_min, default_max, default : lf32 each
        //   name : string
        //   modifiers : varint count
        // https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.21.42/protocol.json
        const health = () => new Attribute({ name: AttributeIds.Health, min: 0, max: 20, def: 20, value: 15 });

        it('writes six floats before the name', () => {
            const stream = new BinaryStream();
            health().networkSerialize(stream);
            const buffer = stream.getBuffer();

            expect(buffer.readFloatLE(0)).toBe(0); // min
            expect(buffer.readFloatLE(4)).toBe(20); // max
            expect(buffer.readFloatLE(8)).toBe(15); // current
            expect(buffer.readFloatLE(12)).toBe(0); // default_min
            expect(buffer.readFloatLE(16)).toBe(20); // default_max
            expect(buffer.readFloatLE(20)).toBe(20); // default

            // The name starts right after the sixth float, as a varint-prefixed string.
            expect(buffer[24]).toBe(AttributeIds.Health.length);
            expect(buffer.subarray(25, 25 + AttributeIds.Health.length).toString()).toBe(AttributeIds.Health);
        });

        it('occupies exactly the bytes the layout accounts for', () => {
            const stream = new BinaryStream();
            health().networkSerialize(stream);

            // 6 floats + name length varint + name + modifier count varint
            expect(stream.getBuffer().byteLength).toBe(24 + 1 + AttributeIds.Health.length + 1);
        });

        it('round-trips through networkDeserialize', () => {
            const stream = new BinaryStream();
            health().networkSerialize(stream);

            const parsed = Attribute.networkDeserialize(new BinaryStream(stream.getBuffer()));
            expect(parsed.getName()).toBe(AttributeIds.Health);
            expect(parsed.getMin()).toBe(0);
            expect(parsed.getMax()).toBe(20);
            expect(parsed.getValue()).toBe(15);
            expect(parsed.getDefault()).toBe(20);
        });

        // `AddActor` carries the other layout the protocol has for an attribute:
        //   name : string
        //   min, current, max : lf32 each
        // https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.21.42/protocol.json
        describe('the short AddActor layout', () => {
            it('writes the name first, then min, current, max', () => {
                const stream = new BinaryStream();
                health().networkSerializeInitial(stream);
                const buffer = stream.getBuffer();

                const name = 1 + AttributeIds.Health.length;
                expect(buffer[0]).toBe(AttributeIds.Health.length);
                expect(buffer.subarray(1, name).toString()).toBe(AttributeIds.Health);

                expect(buffer.readFloatLE(name)).toBe(0); // min
                expect(buffer.readFloatLE(name + 4)).toBe(15); // current, between the bounds
                expect(buffer.readFloatLE(name + 8)).toBe(20); // max
                expect(buffer.byteLength).toBe(name + 12);
            });

            it('round-trips', () => {
                const stream = new BinaryStream();
                health().networkSerializeInitial(stream);

                const parsed = Attribute.networkDeserializeInitial(new BinaryStream(stream.getBuffer()));
                expect(parsed.getName()).toBe(AttributeIds.Health);
                expect(parsed.getMin()).toBe(0);
                expect(parsed.getValue()).toBe(15);
                expect(parsed.getMax()).toBe(20);
            });
        });

        it('clamps whatever it is given to its own bounds', () => {
            const attribute = health();

            attribute.setValue(1000);
            expect(attribute.getValue()).toBe(20);

            attribute.setValue(-1);
            expect(attribute.getValue()).toBe(0);
        });

        it('reports whether the value actually moved', () => {
            const attribute = health();

            expect(attribute.setValue(10)).toBe(true);
            expect(attribute.setValue(10)).toBe(false);
            // Clamped to a bound it is already at: still no change.
            expect(attribute.setValue(0)).toBe(true);
            expect(attribute.setValue(-5)).toBe(false);
        });

        it('refuses a value that is not a number, which would poison the packet', () => {
            const attribute = health();

            attribute.setValue(Number.NaN);
            expect(attribute.getValue()).toBe(0);
        });

        it('starts at its default when no value is given', () => {
            expect(new Attribute({ name: AttributeIds.Health, min: 0, max: 20, def: 20 }).getValue()).toBe(20);
        });
    });

    describe('Attributes', () => {
        // The player set: the generic one is what everything living has, and a food bar is
        // not that. An actor is only sent attributes it actually owns.
        const player = () => new Attributes(Attributes.getPlayerDefaults());

        it('holds the defaults, so a fresh player is fed and healthy', () => {
            const attributes = player();

            expect(attributes.getValue(AttributeIds.PlayerHunger)).toBe(20);
            expect(attributes.getValue(AttributeIds.PlayerSaturation)).toBe(20);
            expect(attributes.getValue(AttributeIds.PlayerExhaustion)).toBe(0);
            expect(attributes.getValue(AttributeIds.Health)).toBe(20);
        });

        it('gives a generic entity health and speed, but no food bar', () => {
            const attributes = new Attributes();

            expect(attributes.getValue(AttributeIds.Health)).toBe(20);
            expect(attributes.getAttribute(AttributeIds.Movement)).not.toBeNull();
            expect(attributes.getAttribute(AttributeIds.PlayerHunger)).toBeNull();
            expect(attributes.getAttribute(AttributeIds.PlayerSaturation)).toBeNull();
        });

        it('never hands a player an attribute a player does not have', () => {
            // The client looks every name up in the actor's own map. A horse's jump strength
            // on a player is not extra information, it is an entry with nowhere to go.
            const names = player()
                .getAttributes()
                .map((attribute) => attribute.getName());

            expect(names).not.toContain(AttributeIds.HorseJumpStrength);
            expect(names).not.toContain(AttributeIds.ZombieSpawnReinforcements);
        });

        it('hands out the attributes it holds, not a rebuilt copy of the defaults', () => {
            const attributes = player();
            attributes.setValue(AttributeIds.PlayerHunger, 3);

            const hunger = attributes.getAttributes().find((a) => a.getName() === AttributeIds.PlayerHunger);
            expect(hunger?.getValue()).toBe(3);
        });

        it('keeps changes made through it', () => {
            const attributes = player();

            attributes.setValue(AttributeIds.PlayerHunger, 7);
            expect(attributes.getValue(AttributeIds.PlayerHunger)).toBe(7);

            attributes.addValue(AttributeIds.PlayerHunger, -2);
            expect(attributes.getValue(AttributeIds.PlayerHunger)).toBe(5);
        });

        it('ignores an attribute it does not have', () => {
            const attributes = new Attributes();

            expect(attributes.getAttribute('minecraft:nonsense')).toBeNull();
            expect(attributes.setValue('minecraft:nonsense', 1)).toBe(false);
            expect(attributes.getValue('minecraft:nonsense', 42)).toBe(42);
        });

        it('remembers only what changed, so a tick sends a short packet', () => {
            const attributes = player();
            attributes.clearDirty();

            attributes.setValue(AttributeIds.PlayerHunger, 19);
            expect(attributes.getDirty().map((a) => a.getName())).toEqual([AttributeIds.PlayerHunger]);

            attributes.clearDirty();
            expect(attributes.getDirty()).toHaveLength(0);

            // Setting a value to what it already is changes nothing to send.
            attributes.setValue(AttributeIds.PlayerHunger, 19);
            expect(attributes.getDirty()).toHaveLength(0);
        });

        it('goes back to the defaults on reset, and says so', () => {
            const attributes = player();
            attributes.setValue(AttributeIds.PlayerHunger, 0);
            attributes.clearDirty();

            attributes.reset();
            expect(attributes.getValue(AttributeIds.PlayerHunger)).toBe(20);
            expect(attributes.getDirty().map((a) => a.getName())).toEqual([AttributeIds.PlayerHunger]);
        });

        it('gives every entity its own attributes', () => {
            const first = player();
            const second = player();

            first.setValue(AttributeIds.PlayerHunger, 1);
            expect(second.getValue(AttributeIds.PlayerHunger)).toBe(20);
        });
    });
});
