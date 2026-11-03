import { describe, expect, it } from 'vitest';

import type { ContentPosition } from '../content/world/adapter';
import type { ContentGameEvent } from '../network/contentAdapter';
import type { GameEventListener, GameEventListenerWorld } from './GameEventListenerRegistry';
import { GameEventListenerRegistry } from './GameEventListenerRegistry';

const event: ContentGameEvent = { event: 'minecraft:block_open', at: { x: 8, y: 8, z: 8 } };

const listener = (
    at: ContentPosition,
    handleGameEvent: GameEventListener['handleGameEvent'],
    delivery: 'unspecified' | 'by_distance' = 'unspecified'
): GameEventListener => ({
    getPosition: () => at,
    getListenerRadius: () => 16,
    getDeliveryMode: () => delivery,
    handleGameEvent
});

describe('GameEventListenerRegistry', () => {
    it('skips loaded-column and section key work when no listener is registered', () => {
        const world: GameEventListenerWorld = {
            getLoadedChunk: () => {
                throw new Error('an empty registry must not walk chunk columns');
            }
        };

        new GameEventListenerRegistry(world).post(event);
    });

    it('keeps inline section order and delivers by-distance listeners nearest first', () => {
        const world: GameEventListenerWorld = { getLoadedChunk: () => ({}) };
        const registry = new GameEventListenerRegistry(world);
        const delivered: string[] = [];

        registry.add(listener({ x: 9, y: 8, z: 8 }, () => delivered.push('inline-first')));
        registry.add(listener({ x: 15, y: 8, z: 8 }, () => delivered.push('distance-far'), 'by_distance'));
        registry.add(listener({ x: 10, y: 8, z: 8 }, () => delivered.push('inline-second')));
        registry.add(listener({ x: 10, y: 8, z: 8 }, () => delivered.push('distance-near'), 'by_distance'));

        registry.post(event);

        expect(delivered).toEqual(['inline-first', 'inline-second', 'distance-near', 'distance-far']);
    });

    it('defers registration during delivery until the next event', () => {
        const registry = new GameEventListenerRegistry({ getLoadedChunk: () => ({}) });
        const delivered: string[] = [];
        const added = listener(event.at, () => delivered.push('added'));
        const registering = listener(event.at, () => {
            delivered.push('registering');
            registry.add(added);
        });
        registry.add(registering);

        registry.post(event);
        expect(delivered).toEqual(['registering']);

        registry.post(event);
        expect(delivered).toEqual(['registering', 'registering', 'added']);
    });
});
