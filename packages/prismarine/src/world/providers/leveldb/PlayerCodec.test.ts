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
    });
});
