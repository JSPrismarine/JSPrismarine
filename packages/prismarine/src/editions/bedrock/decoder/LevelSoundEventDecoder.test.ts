import { LevelSoundEvent } from '@jsprismarine/minecraft';
import LevelSoundEventPacket from '@jsprismarine/protocol/bedrock/packet/LevelSoundEventPacket';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../../testing/decodeView.test-utils';
import type { StubMembers } from '../../../testing/stub.test.helper';
import LevelSoundEventDecoder from './LevelSoundEventDecoder';

const SENDER_ID = 7n;

const soundAt = (x: number, y: number, z: number, fields: StubMembers<LevelSoundEventPacket> = {}) =>
    Object.assign(new LevelSoundEventPacket(), {
        sound: LevelSoundEvent.ATTACK_NODAMAGE,
        positionX: x,
        positionY: y,
        positionZ: z,
        ...fields
    });

describe('LevelSoundEventDecoder', () => {
    it('decodes a sound with no actor, keeping its position and fields', () => {
        const { view, logged } = decodeView();

        const [intent] = new LevelSoundEventDecoder().decode(soundAt(2, 64, 1), view);

        expect(intent).toMatchObject({ kind: 'playSound', x: 2, y: 64, z: 1, sound: LevelSoundEvent.ATTACK_NODAMAGE });
        expect(logged).toEqual([]);
    });

    it('decodes a sound the sender attributes to itself', () => {
        const { view } = decodeView();

        expect(
            new LevelSoundEventDecoder().decode(
                soundAt(0, 64, 0, { entityUniqueId: SENDER_ID, entityType: 'minecraft:player' }),
                view
            )
        ).toHaveLength(1);
    });

    it('drops a sound attributed to another actor', () => {
        const { view, logged } = decodeView();

        expect(new LevelSoundEventDecoder().decode(soundAt(0, 64, 0, { entityUniqueId: 99n }), view)).toEqual([]);
        expect(logged).toEqual(['Dropped sound attack.nodamage from tester: attributed to actor 99']);
    });

    it('drops a sound attributed to another kind of actor', () => {
        const { view, logged } = decodeView();

        expect(
            new LevelSoundEventDecoder().decode(soundAt(0, 64, 0, { entityType: 'minecraft:zombie' }), view)
        ).toEqual([]);
        expect(logged).toEqual(['Dropped sound attack.nodamage from tester: attributed to a minecraft:zombie']);
    });

    it('leaves the distance check to the world, decoding a far-away sound', () => {
        const { view } = decodeView();

        expect(new LevelSoundEventDecoder().decode(soundAt(5000, 64, -5000), view)).toHaveLength(1);
    });
});
