import { beforeEach, describe, expect, it } from 'vitest';

import { Difficulty, Gametype } from '@jsprismarine/minecraft';
import { Position } from '../../world/Position';
import type { Entity } from '../Entity';
import Human from '../Human';
import { MetadataFlag } from '../Metadata';
import Skeleton from '../hostile/Skeleton';
import RangedAttackGoal from './goals/RangedAttackGoal';

/**
 * The archer's pose and its shots.
 *
 * The pose is the half that is easy to get wrong and impossible to notice from the server: a
 * skeleton that fires without setting the flag shoots arrows from a bow held at its side, and
 * everything else about the attack looks correct while it does.
 */
const scene = () => {
    const nearby: Entity[] = [];
    const spawned: string[] = [];
    const metadataSent: bigint[] = [];

    const world: any = {
        getName: () => 'test',
        getServer: () => ({
            post: () => {},
            getTick: () => 0,
            getLogger: () => ({ verbose: () => {}, error: () => {}, debug: () => {}, warn: () => {} }),
            getConfig: () => ({ getDifficulty: () => Difficulty.NORMAL })
        }),
        sendActorEvent: async () => {},
        sendActorSound: async () => {},
        // The whole point of the question: does a metadata change actually go anywhere?
        sendActorMetadata: async (entity: Entity) => void metadataSent.push(entity.getRuntimeId()),
        broadcastMove: async () => {},
        getGameRuleManager: () => ({ getGameRule: () => [true, true] }),
        getEntityGrid: () => ({ near: () => nearby }),
        addEntity: async (entity: Entity) => void spawned.push(entity.getType()),
        removeEntity: async () => {},
        getLoadedChunk: () => null
    };

    const skeleton = new Skeleton({ position: new Position(0, 64, 0, world) });
    nearby.push(skeleton);

    const victim = new Human({ position: new Position(8, 64, 0, world) });
    (victim as any).gamemode = Gametype.SURVIVAL;
    nearby.push(victim);

    return { world, skeleton, victim, spawned, metadataSent };
};

describe('an archer', () => {
    let stage: ReturnType<typeof scene>;
    let goal: RangedAttackGoal;

    beforeEach(() => {
        stage = scene();
        goal = new RangedAttackGoal();
        stage.skeleton.setTarget(stage.victim);
    });

    it('is holding a bow, which is the only reason anybody can see one', () => {
        expect(stage.skeleton.getHeldItem()?.getName()).toBe('minecraft:bow');
    });

    describe('telling the client who it is fighting', () => {
        it('puts the target in its metadata, which is what poses it', () => {
            // Mojang's own skeleton controller enters its attack state on `query.has_target` and
            // never looks at `is_using_item`. Without this the bow stays at its side however
            // faithfully every other flag is set - which is exactly what it did.
            expect(stage.skeleton.metadata.targetEntityId).toBe(stage.victim.getRuntimeId());
        });

        it('clears it again when it gives up', () => {
            stage.skeleton.setTarget(null);

            expect(stage.skeleton.metadata.targetEntityId).toBe(0n);
        });

        it('tells everyone watching, rather than only itself', () => {
            const before = stage.metadataSent.length;
            stage.skeleton.setTarget(null);

            expect(stage.metadataSent.length).toBeGreaterThan(before);
        });

        it('says nothing when the target has not actually changed', () => {
            const before = stage.metadataSent.length;
            stage.skeleton.setTarget(stage.victim);

            expect(stage.metadataSent).toHaveLength(before);
        });
    });

    it('raises the bow the moment it starts, and tells everyone watching', () => {
        expect(drawn(stage.skeleton)).toBe(false);

        goal.start(stage.skeleton);

        expect(drawn(stage.skeleton)).toBe(true);
        expect(stage.metadataSent).toContain(stage.skeleton.getRuntimeId());
    });

    it('sets the charging flag too, since the two clients disagree on which to read', () => {
        goal.start(stage.skeleton);

        expect(stage.skeleton.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(MetadataFlag.CHARGING))).toBe(true);
    });

    it('lowers it again when it stops shooting', () => {
        goal.start(stage.skeleton);
        goal.stop(stage.skeleton);

        expect(drawn(stage.skeleton)).toBe(false);
    });

    it('does not send the same state twice', () => {
        goal.start(stage.skeleton);
        const afterStart = stage.metadataSent.length;

        // Held down, tick after tick. Only the changes are worth a packet.
        goal.tick(stage.skeleton);
        goal.tick(stage.skeleton);

        expect(stage.metadataSent).toHaveLength(afterStart);
    });

    it('looses an arrow once it has drawn', () => {
        goal.start(stage.skeleton);

        // The whole reload, which is what the draw is.
        for (let tick = 0; tick < 21; tick++) goal.tick(stage.skeleton);

        expect(stage.spawned).toContain('minecraft:arrow');
    });

    it('keeps the bow up through the shot, rather than dropping it to fire', () => {
        // The bug this replaced: lowering the bow for the single tick of each loose meant a client
        // that plays its release animation on the flag going false showed only that - a twitch
        // once a shot, and never a draw.
        goal.start(stage.skeleton);

        for (let tick = 0; tick < 60; tick++) {
            goal.tick(stage.skeleton);
            expect(drawn(stage.skeleton)).toBe(true);
        }

        expect(stage.spawned.length).toBeGreaterThan(1);
    });

    it('sends the pose once, not once a shot', () => {
        goal.start(stage.skeleton);
        const afterStart = stage.metadataSent.length;

        for (let tick = 0; tick < 60; tick++) goal.tick(stage.skeleton);

        expect(stage.metadataSent).toHaveLength(afterStart);
    });

    it('waits before its first shot rather than firing the instant it sees you', () => {
        goal.start(stage.skeleton);
        goal.tick(stage.skeleton);

        expect(stage.spawned).toEqual([]);
    });

    it('will not shoot at something out of range', () => {
        const far = new Human({ position: new Position(80, 64, 0, stage.world) });
        stage.skeleton.setTarget(far);

        expect(goal.canUse(stage.skeleton)).toBe(false);
    });
});

/** Whether the bow is up, as the client would read it. */
const drawn = (entity: Entity): boolean =>
    entity.metadata.getDataFlag(MetadataFlag.INDEX, BigInt(MetadataFlag.USINGITEM));
