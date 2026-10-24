import { beforeEach, describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { Difficulty, Gametype } from '@jsprismarine/minecraft';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type { Config } from '../config/Config';
import type { Entity } from '../entity/Entity';
import { Mob } from '../entity/Mob';
import type Player from '../Player';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
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
    private readonly players: Player[] = [];

    public ticks = 6000; // Midday.

    /** The face this shows to the code under test. Every member reads the state above. */
    private readonly world = stub<World>({
        getLoadedChunk: (cx, cz) => this.chunks.get(`${cx},${cz}`) ?? null,
        getEntities: () => this.getEntities(),
        getPlayers: () => this.players,
        getTicks: () => this.ticks,
        addEntity: (entity) => this.addEntity(entity),
        removeEntity: async (entity) => {
            const index = this.entities.indexOf(entity);
            if (index >= 0) this.entities.splice(index, 1);
        },
        broadcastMove: async () => {},
        getServer: () =>
            stub<Server>({
                getLogger: () => stub<Logger>({ debug: () => {}, warn: () => {} }),
                // Normal, so monsters are allowed - peaceful suppresses them entirely.
                getConfig: () => stub<Config>({ getDifficulty: () => Difficulty.NORMAL })
            }),
        getName: () => 'test'
    });

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

    public getEntities(): Entity[] {
        return [...this.entities];
    }

    public async addEntity(entity: Entity): Promise<void> {
        this.entities.push(entity);
    }

    public addPlayerAt(x: number, y: number, z: number): void {
        this.players.push(
            stub<Player>({
                getPosition: () => new Position(x, y, z, this.world),
                isOnline: () => true,
                gamemode: Gametype.SURVIVAL
            })
        );
    }

    /** Everyone leaves, so a test can put the players somewhere else entirely. */
    public clearPlayers(): void {
        this.players.length = 0;
    }

    public asWorld(): World {
        return this.world;
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
        world.clearPlayers();
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
