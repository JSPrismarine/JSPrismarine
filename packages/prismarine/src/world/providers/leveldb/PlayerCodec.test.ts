import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import type { WorldPlayerData } from '../../../config/JsonConfigTypes';
import { Dimensions, FIRST_CUSTOM_DIMENSION_ID, dimensionTypeOf } from '../../Dimension';
import { VANILLA_DIMENSION_TYPES } from '../../vanillaDimensionTypes';
import { playerDataFromNbt, playerDataToNbt } from './PlayerCodec';

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
