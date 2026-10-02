import { beforeEach, describe, expect, it } from 'vitest';

import { Difficulty } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type { Entity } from '../entity/Entity';
import { Mob } from '../entity/Mob';
import Chunk from './chunk/Chunk';
import MobSpawner from './MobSpawner';
import { Position } from './Position';
import type { World } from './World';

/**
 * A world with ground, a player, and a list of entities - which is all the spawner touches.
 *
 * Time is settable, because half of what the spawner decides depends on whether it is night.
 */
class TestWorld {
    private readonly chunks = new Map<string, Chunk>();
    private readonly entities: Entity[] = [];
    private readonly players: any[] = [];

    public ticks = 6000; // Midday.

    public constructor(radius = 4, groundY = 64) {
        const stone = BlockRuntimeIds.getByName('minecraft:stone');
        const grass = BlockRuntimeIds.getByName('minecraft:grass_block');

        for (let cx = -radius; cx <= radius; cx++) {
            for (let cz = -radius; cz <= radius; cz++) {
                const chunk = new Chunk(cx, cz);
                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) {
                        chunk.fillColumn(x, z, -64, groundY - 1, stone);
                        chunk.fillColumn(x, z, groundY, groundY, grass);
                    }
                }
                this.chunks.set(`${cx},${cz}`, chunk);
            }
        }
    }

    public getLoadedChunk(cx: number, cz: number): Chunk | null {
        return this.chunks.get(`${cx},${cz}`) ?? null;
    }

    public getEntities(): Entity[] {
        return [...this.entities];
    }

    public getPlayers(): any[] {
        return this.players;
    }

    public getTicks(): number {
        return this.ticks;
    }

    public async addEntity(entity: Entity): Promise<void> {
        this.entities.push(entity);
    }

    public async removeEntity(entity: Entity): Promise<void> {
        const index = this.entities.indexOf(entity);
        if (index >= 0) this.entities.splice(index, 1);
    }

    public async broadcastMove(): Promise<void> {}

    public getServer(): any {
        return {
            getLogger: () => ({ debug: () => {}, warn: () => {} }),
            // Normal, so monsters are allowed - peaceful suppresses them entirely.
            getConfig: () => ({ getDifficulty: () => Difficulty.NORMAL })
        };
    }

    public getName(): string {
        return 'test';
    }

    public addPlayerAt(x: number, y: number, z: number): void {
        this.players.push({ getPosition: () => new Vector3(x, y, z), isOnline: () => true, gamemode: 0 });
    }

    public asWorld(): World {
        return this as unknown as World;
    }
}

describe('mob spawner', () => {
    let world: TestWorld;
    let spawner: MobSpawner;

    beforeEach(() => {
        world = new TestWorld();
        spawner = new MobSpawner(world.asWorld());
    });

    it('does nothing at all when nobody is playing', async () => {
        await spawner.tick(0);
        expect(world.getEntities()).toHaveLength(0);
    });

    it('only runs on its own interval, not every tick', async () => {
        world.addPlayerAt(8, 65, 8);

        await spawner.tick(1);
        expect(world.getEntities()).toHaveLength(0);

        await spawner.tick(40);
        expect(world.getEntities().length).toBeGreaterThan(0);
    });

    it('puts animals on the grass by day', async () => {
        world.ticks = 6000;
        world.addPlayerAt(8, 65, 8);
        await spawner.tick(40);

        const spawned = world.getEntities();
        expect(spawned.length).toBeGreaterThan(0);

        for (const entity of spawned) {
            // Daytime spawns are animals, never monsters.
            expect(['minecraft:zombie', 'minecraft:skeleton', 'minecraft:creeper']).not.toContain(entity.getType());

            // And each one is standing on the ground it was put on.
            expect(entity.getPosition().getY()).toBe(65);
        }
    });

    it('puts monsters out at night', async () => {
        world.ticks = 18000; // The middle of the night.
        world.addPlayerAt(8, 65, 8);

        // Several rounds, since each one only tries a handful of positions.
        for (let round = 0; round < 6; round++) await spawner.tick(40 * (round + 1));

        const types = world.getEntities().map((entity) => entity.getType());
        expect(
            types.some((type) => ['minecraft:zombie', 'minecraft:skeleton', 'minecraft:spider'].includes(type))
        ).toBe(true);
    });

    it('keeps mobs at a distance rather than on top of the player', async () => {
        world.addPlayerAt(8, 65, 8);
        await spawner.tick(40);

        for (const entity of world.getEntities()) {
            const at = entity.getPosition();
            const distance = Math.hypot(at.getX() - 8, at.getZ() - 8);

            // Far enough not to appear in front of them, near enough to be worth spawning.
            expect(distance).toBeGreaterThan(20);
            expect(distance).toBeLessThan(50);
        }
    });

    it('takes away mobs nobody is near', async () => {
        world.addPlayerAt(8, 65, 8);
        await spawner.tick(40);
        expect(world.getEntities().length).toBeGreaterThan(0);

        // Everyone walks a long way off. Without this, a world fills with everything that has ever
        // been beside a player and never empties.
        (world as any).players.length = 0;
        world.addPlayerAt(1000, 65, 1000);
        await spawner.tick(80);

        expect(world.getEntities()).toHaveLength(0);
    });

    it('never removes a mob that was put there on purpose', async () => {
        // A village's villagers are not the spawner's to tidy away.
        const villager = new Mob({ position: new Position(500.5, 65, 500.5, world.asWorld()) }).setPersistent();
        await world.addEntity(villager);

        world.addPlayerAt(8, 65, 8);
        await spawner.tick(40);

        expect(world.getEntities()).toContain(villager);
    });

    it('stops adding mobs once there are enough of them', async () => {
        world.addPlayerAt(8, 65, 8);

        for (let round = 1; round <= 40; round++) await spawner.tick(40 * round);

        // One player, so one player's worth of cap - plus a group's overshoot on the last round.
        expect(world.getEntities().length).toBeLessThanOrEqual(20);
    });
});
