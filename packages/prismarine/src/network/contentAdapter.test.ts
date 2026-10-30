import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { createContentEffectsGroup, replicatorEffectAudience } from './contentAdapter';
import PlaySoundPacket from './packet/PlaySoundPacket';
import SpawnParticleEffectPacket from './packet/SpawnParticleEffectPacket';

import type { ContentEffectAudience, ContentGameEvent } from './contentAdapter';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import type { ContentPosition } from '../content/world/adapter';

/** One call to {@link ContentEffectAudience.near}, kept so a test can read it back. */
interface SentPacket {
    position: ContentPosition;
    packet: NetworkPacket;
    radius: number;
}

const recordingAudience = (dimension = 0) => {
    const sent: SentPacket[] = [];
    const audience: ContentEffectAudience = {
        dimension,
        near: (position, packet, radius) => void sent.push({ position, packet, radius })
    };

    return { audience, sent };
};

describe('network', () => {
    describe('createContentEffectsGroup', () => {
        it('plays a named sound in the middle of the block', () => {
            const { audience, sent } = recordingAudience();
            createContentEffectsGroup({ audience }).playSound({ x: 10, y: 64, z: -3 }, 'block.door.open');

            expect(sent).toHaveLength(1);
            const [first] = sent;
            const packet = first?.packet;
            if (!(packet instanceof PlaySoundPacket)) throw new Error('expected a PlaySoundPacket');

            expect(packet.name).toBe('block.door.open');
            expect(packet.position?.getX()).toBe(10.5);
            expect(packet.position?.getY()).toBe(64.5);
            expect(packet.position?.getZ()).toBe(-2.5);
            expect(first?.radius).toBe(32);
        });

        it('spawns a named particle in the dimension the audience names', () => {
            const { audience, sent } = recordingAudience(2);
            createContentEffectsGroup({ audience }).spawnParticle(
                { x: 0, y: 1, z: 2 },
                'minecraft:crop_growth_emitter'
            );

            const packet = sent[0]?.packet;
            if (!(packet instanceof SpawnParticleEffectPacket)) throw new Error('expected a SpawnParticleEffectPacket');

            expect(packet.effectName).toBe('minecraft:crop_growth_emitter');
            expect(packet.dimensionId).toBe(2);
            expect(packet.actorId).toBe(-1n);
            expect(packet.position.getX()).toBe(0.5);
        });

        it('hands a game event to the listener, source included', () => {
            const { audience, sent } = recordingAudience();
            const heard: ContentGameEvent[] = [];

            const effects = createContentEffectsGroup({ audience, onGameEvent: (event) => void heard.push(event) });
            effects.emitGameEvent('minecraft:block_open', { x: 1, y: 2, z: 3 }, 42);
            effects.emitGameEvent('minecraft:block_close', { x: 1, y: 2, z: 3 });

            expect(heard).toEqual([
                { event: 'minecraft:block_open', at: { x: 1, y: 2, z: 3 }, sourceId: 42 },
                { event: 'minecraft:block_close', at: { x: 1, y: 2, z: 3 } }
            ]);
            // A game event has no Bedrock packet, so nothing reached a client.
            expect(sent).toHaveLength(0);
        });

        it('drops a game event when nothing is listening', () => {
            const { audience } = recordingAudience();
            expect(() =>
                createContentEffectsGroup({ audience }).emitGameEvent('minecraft:block_open', { x: 0, y: 0, z: 0 })
            ).not.toThrow();
        });
    });

    describe('replicatorEffectAudience', () => {
        it('asks the replicator who is near, with the radius it was given', () => {
            const calls: Array<{ position: Vector3; radius: number | undefined }> = [];
            const audience = replicatorEffectAudience(
                { sendAround: (position, _packet, options) => void calls.push({ position, radius: options?.radius }) },
                1
            );

            audience.near({ x: 4, y: 5, z: 6 }, new PlaySoundPacket(), 32);

            expect(audience.dimension).toBe(1);
            expect(calls).toHaveLength(1);
            expect(calls[0]?.position).toEqual(new Vector3(4, 5, 6));
            expect(calls[0]?.radius).toBe(32);
        });
    });
});
