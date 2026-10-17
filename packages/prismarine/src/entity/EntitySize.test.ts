import { describe, expect, it } from 'vitest';

import * as Entities from './Entities';
import { DEFAULT_SIZE, ENTITY_SIZES, sizeOf } from './EntitySize';
import { EYE_HEIGHT } from './Human';

describe('entity sizes', () => {
    it('has a size for every entity this server can spawn', () => {
        // The table and the classes are written in different files and nothing but this keeps them
        // in step. Without it, adding a mob and forgetting its size is silent: it gets the 1 x 1
        // default, collides against the world as a cube, and is announced to the client as one.
        //
        // It would also have caught `minecraft:sliverfish`, which sat misspelt in the class for
        // long enough that the client had never once been told what a silverfish was.
        const missing = Object.values(Entities)
            .map((entity) => (entity as { MOB_ID?: string }).MOB_ID)
            .filter((type): type is string => typeof type === 'string')
            .filter((type) => !(type in ENTITY_SIZES));

        expect(missing).toStrictEqual([]);
    });

    it('names every entity the way the client does', () => {
        // A table keyed by a name the client does not know is a table that never matches.
        for (const type of Object.keys(ENTITY_SIZES)) {
            expect(type).toMatch(/^minecraft:[a-z0-9_]+$/);
        }
    });

    it('is Bedrock’s numbers, not a guess', () => {
        // Spot checks against `minecraft:collision_box` in the vanilla behaviour packs, chosen to
        // cover the shapes that behave differently: wider than tall, taller than wide, and the
        // player, whose size everything used to be announced as.
        expect(sizeOf('minecraft:sheep')).toStrictEqual({ width: 0.9, height: 1.3 });
        expect(sizeOf('minecraft:spider')).toStrictEqual({ width: 1.4, height: 0.9 });
        expect(sizeOf('minecraft:enderman')).toStrictEqual({ width: 0.6, height: 2.9 });
        expect(sizeOf('minecraft:chicken')).toStrictEqual({ width: 0.6, height: 0.8 });
        expect(sizeOf('minecraft:player')).toStrictEqual({ width: 0.6, height: 1.8 });
    });

    it('falls back to a block for an entity it does not model', () => {
        // Worlds hold mobs this server has no class for, and they arrive as `GenericEntity`.
        // Mojang's own default, and the conservative one: an obstacle rather than a point.
        expect(sizeOf('minecraft:allay_from_some_future_version')).toStrictEqual(DEFAULT_SIZE);
        expect(DEFAULT_SIZE).toStrictEqual({ width: 1, height: 1 });
    });

    it('puts a human’s feet below its eyes', () => {
        // The one number in the codebase that is not a size: a Bedrock client reports where its
        // eyes are, so a player's position is 1.62 above the body it belongs to.
        expect(EYE_HEIGHT).toBe(1.62);
    });
});
