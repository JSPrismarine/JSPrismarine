import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import type { WorldPlayerData } from '../../../config/JsonConfigTypes';
import { Dimensions, FIRST_CUSTOM_DIMENSION_ID, dimensionTypeOf } from '../../DimensionType';
import { VANILLA_DIMENSION_TYPES } from '../../vanillaDimensionTypes';
import { nbtBase64Of, nbtOfBase64 } from '../../../nbtBytes';
import { playerDataFromNbt, playerDataToNbt } from './PlayerCodec';

/** A player's own tags: a script's dynamic properties, as Bedrock keeps them on the actor. */
const ownTags = (): NBTTagCompound => {
    const properties = new NBTTagCompound('DynamicProperties');
    const pack = new NBTTagCompound('35579972-c85f-41ef-afae-6f7fd4ce0a02');
    pack.addValue('jsp:visits', new Types.DoubleVal(2));
    properties.addChild(pack);
    const tags = new NBTTagCompound('');
    tags.addChild(properties);
    tags.addValue('Air', new Types.ShortVal(300));
    return tags;
};

/** A level's dimension types with one custom type at the first custom id. */
const SKY = dimensionTypeOf(
    { ...VANILLA_DIMENSION_TYPES['minecraft:overworld'], minY: 0, height: 128 },
    'mypack:sky',
    FIRST_CUSTOM_DIMENSION_ID
);
const LEVEL_DIMENSIONS = [Dimensions.Overworld, Dimensions.Nether, SKY];

const record = (extra: Partial<WorldPlayerData> = {}): WorldPlayerData => ({
    username: 'Player',
    gamemode: 'Survival',
    position: { x: 1.5, y: 64, z: -2.5, pitch: 0, yaw: 90, headYaw: 90 },
    ...extra
});

describe('world', () => {
    describe('PlayerCodec', () => {
        describe('persistentNbt', () => {
            it("writes the player's own tags at the root, where the game keeps them, and reads them back", () => {
                const data = record({ persistentNbt: nbtBase64Of(ownTags()) });
                const nbt = playerDataToNbt(data);

                expect(
                    nbt
                        .getCompound('DynamicProperties', false)
                        ?.getCompound('35579972-c85f-41ef-afae-6f7fd4ce0a02', false)
                        ?.getDouble('jsp:visits', 0)
                ).toBe(2);
                expect(nbt.getShort('Air', 0)).toBe(300);
                expect(nbt.getCompound('JSPrismarine', false)?.has('DynamicProperties')).toBe(false);
                expect(playerDataFromNbt(nbt)).toEqual(data);
            });

            it('never lets an own tag shadow one the codec writes, and leaves the field out when there are none', () => {
                const shadow = new NBTTagCompound('');
                shadow.addValue('PlayerGameType', new Types.NumberVal(3));
                shadow.addValue('NameTag', new Types.StringVal('Impostor'));
                const data = record({ persistentNbt: nbtBase64Of(shadow) });
                const nbt = playerDataToNbt(data);

                expect(nbt.getNumber('PlayerGameType', -1)).toBe(0);
                expect(nbt.getString('NameTag', '')).toBe('Player');
                expect(playerDataFromNbt(nbt)).toEqual(record());
                expect(playerDataFromNbt(playerDataToNbt(record()))).toEqual(record());
            });

            it("reads the tags of a record the game wrote as the player's own, and writes them back", () => {
                // As the game writes a player: Bedrock's tags at the root and no JSPrismarine compound.
                const written = new NBTTagCompound('');
                written.addValue('PlayerGameType', new Types.NumberVal(1));
                written.addValue(
                    'Pos',
                    new Set([new Types.FloatVal(1.5), new Types.FloatVal(64), new Types.FloatVal(-2.5)])
                );
                written.addValue('Air', new Types.ShortVal(300));
                written.addChild(ownTags().getCompound('DynamicProperties', false)!);

                const data = playerDataFromNbt(written);
                const own = nbtOfBase64(data.persistentNbt ?? '');
                expect(own?.getShort('Air', 0)).toBe(300);
                expect(own?.has('DynamicProperties')).toBe(true);
                expect(own?.has('Pos')).toBe(false);
                expect(own?.has('PlayerGameType')).toBe(false);
                expect(data.gamemode).toBe('Creative');

                const back = playerDataToNbt(data);
                expect(back.getShort('Air', 0)).toBe(300);
                expect(back.has('DynamicProperties')).toBe(true);
            });
        });

        it("writes the portal cooldown under Bedrock's PortalCooldown tag", () => {
            const nbt = playerDataToNbt(record({ portalCooldown: 7 }));

            expect(nbt.getNumber('PortalCooldown', -1)).toBe(7);
            expect(nbt.getCompound('JSPrismarine', false)?.has('PortalCooldown')).toBe(false);
        });

        it('reads the portal cooldown back', () => {
            const data = record({ portalCooldown: 7 });

            expect(playerDataFromNbt(playerDataToNbt(data))).toEqual(data);
        });

        it('leaves the cooldown out of a record that has none, both ways', () => {
            const data = record();
            const nbt = playerDataToNbt(data);

            expect(nbt.has('PortalCooldown')).toBe(false);
            expect(playerDataFromNbt(nbt)).toEqual(data);
        });

        it('round-trips the recipe book, an empty one included, and leaves out one the record lacks', () => {
            const unlocked = record({ recipeBook: ['minecraft:torch', 'minecraft:stick'] });
            const empty = record({ recipeBook: [] });

            expect(playerDataFromNbt(playerDataToNbt(unlocked))).toEqual(unlocked);
            expect(playerDataFromNbt(playerDataToNbt(empty))).toEqual(empty);
            expect(playerDataFromNbt(playerDataToNbt(record()))).not.toHaveProperty('recipeBook');
        });

        it("round-trips the ticks since rest under Bedrock's TimeSinceRest tag", () => {
            const data = record({ timeSinceRest: 80_000 });
            const nbt = playerDataToNbt(data);

            expect(nbt.getNumber('TimeSinceRest', -1)).toBe(80_000);
            expect(playerDataFromNbt(nbt)).toEqual(data);
        });

        describe('seenCredits', () => {
            it("writes the flag under Bedrock's HasSeenCredits tag", () => {
                const nbt = playerDataToNbt(record({ seenCredits: true }));

                expect(nbt.getByte('HasSeenCredits', -1)).toBe(1);
                expect(nbt.getCompound('JSPrismarine', false)?.has('HasSeenCredits')).toBe(false);
            });

            it('round-trips the flag, seen and not seen', () => {
                for (const seenCredits of [true, false]) {
                    const data = record({ seenCredits });

                    expect(playerDataFromNbt(playerDataToNbt(data))).toEqual(data);
                }
            });

            it("reads Java's seenCredits tag on a record without Bedrock's", () => {
                const nbt = playerDataToNbt(record());
                nbt.addValue('seenCredits', new Types.ByteVal(1));

                expect(playerDataFromNbt(nbt).seenCredits).toBe(true);
            });

            it('leaves the flag out of a record that has none, both ways', () => {
                const data = record();
                const nbt = playerDataToNbt(data);

                expect(nbt.has('HasSeenCredits')).toBe(false);
                expect(playerDataFromNbt(nbt)).toEqual(data);
            });
        });

        describe('dimension', () => {
            it("writes the player's dimension as Bedrock's DimensionId and the Java id beside it", () => {
                const nbt = playerDataToNbt(record({ dimension: 'minecraft:the_nether' }));

                expect(nbt.getNumber('DimensionId', -1)).toBe(1);
                expect(nbt.getCompound('JSPrismarine', false)?.getString('dimension', '')).toBe('minecraft:the_nether');
            });

            it('round-trips the dimension and the spawn dimension', () => {
                const data = record({
                    dimension: 'minecraft:the_end',
                    spawn: { x: 1, y: 2, z: 3, dimension: 'minecraft:the_nether' }
                });
                const nbt = playerDataToNbt(data);

                expect(nbt.getNumber('DimensionId', -1)).toBe(2);
                expect(nbt.getNumber('SpawnDimension', -1)).toBe(1);
                expect(playerDataFromNbt(nbt)).toEqual(data);
            });

            it('reads a record the game wrote, with integers and no JSPrismarine compound', () => {
                const nbt = new NBTTagCompound('');
                nbt.addValue('Pos', new Set([1.5, 64, -2.5].map((value) => new Types.FloatVal(value))));
                nbt.addValue('Rotation', new Set([90, 0].map((value) => new Types.FloatVal(value))));
                nbt.addValue('DimensionId', new Types.NumberVal(1));
                nbt.addValue('SpawnX', new Types.NumberVal(7));
                nbt.addValue('SpawnY', new Types.NumberVal(70));
                nbt.addValue('SpawnZ', new Types.NumberVal(-7));
                nbt.addValue('SpawnDimension', new Types.NumberVal(2));

                const data = playerDataFromNbt(nbt);

                expect(data.dimension).toBe('minecraft:the_nether');
                expect(data.spawn).toEqual({ x: 7, y: 70, z: -7, dimension: 'minecraft:the_end' });
            });

            it('keeps a custom dimension by its Java id, which has no Bedrock integer', () => {
                const data = record({ dimension: 'mypack:sky' });
                const nbt = playerDataToNbt(data);

                expect(nbt.has('DimensionId')).toBe(false);
                expect(playerDataFromNbt(nbt).dimension).toBe('mypack:sky');
            });

            it("writes a custom dimension's id from the level's types, for the player and the spawn", () => {
                const data = record({
                    dimension: 'mypack:sky',
                    spawn: { x: 1, y: 2, z: 3, dimension: 'mypack:sky' }
                });
                const nbt = playerDataToNbt(data, LEVEL_DIMENSIONS);

                expect(nbt.getNumber('DimensionId', -1)).toBe(1000);
                expect(nbt.getNumber('SpawnDimension', -1)).toBe(1000);
                expect(playerDataFromNbt(nbt, LEVEL_DIMENSIONS)).toEqual(data);
            });

            it("reads a custom dimension's id back through the level's types when the Java id is missing", () => {
                const nbt = new NBTTagCompound('');
                nbt.addValue('DimensionId', new Types.NumberVal(1000));
                nbt.addValue('SpawnX', new Types.NumberVal(7));
                nbt.addValue('SpawnY', new Types.NumberVal(70));
                nbt.addValue('SpawnZ', new Types.NumberVal(-7));
                nbt.addValue('SpawnDimension', new Types.NumberVal(1000));

                const data = playerDataFromNbt(nbt, LEVEL_DIMENSIONS);

                expect(data.dimension).toBe('mypack:sky');
                expect(data.spawn).toEqual({ x: 7, y: 70, z: -7, dimension: 'mypack:sky' });
                // Without the level's types the id names nothing, and the record says so.
                expect(playerDataFromNbt(nbt).dimension).toBeUndefined();
            });

            it('still reads the legacy spawnDimension string on a record without SpawnDimension', () => {
                const data = record({ spawn: { x: 1, y: 2, z: 3, dimension: 'minecraft:overworld', forced: true } });
                const nbt = playerDataToNbt(data);
                nbt.remove('SpawnDimension');

                expect(playerDataFromNbt(nbt).spawn).toEqual(data.spawn);
            });

            it('leaves the dimension out of a record that has none, both ways', () => {
                const data = record();
                const nbt = playerDataToNbt(data);

                expect(nbt.has('DimensionId')).toBe(false);
                expect(playerDataFromNbt(nbt).dimension).toBeUndefined();
            });
        });
    });
});
