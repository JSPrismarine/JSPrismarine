import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import type { WorldPlayerData } from '../../../config/JsonConfigTypes';
import { playerDataFromNbt, playerDataToNbt } from './PlayerCodec';

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
