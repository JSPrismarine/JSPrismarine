import { Vector3 } from '@jsprismarine/math';
import * as Entities from '../entity/Entities';
import { spawnsMonsters } from '../entity/Difficulty';
import type { Entity, SpawnableEntityClass } from '../entity/Entity';
import { sizeOf } from '../entity/EntitySize';
import { Mob } from '../entity/Mob';
import BlockView from '../entity/ai/BlockView';
import { isNight } from './DayCycle';
import { Position } from './Position';
import type { World } from './World';

/**
 * Puts mobs into the world as players move through it, and takes them out again behind them.
 *
 * Both halves are the job. A spawner without a matching despawner fills the world with everything
 * that has ever been near a player and never stops - and since every mob costs a pathfinding budget
 * and a movement packet per tick, that is the difference between a world that feels inhabited and
 * one that stops responding after an hour's walk.
 *
 * Spawning is deliberately opportunistic rather than exhaustive: a handful of positions are tried
 * near each player every couple of seconds, and the ones that are unsuitable are simply dropped. It
 * costs a fixed amount of work per tick whatever the world looks like.
 */

/** Ticks between attempts. Two seconds: often enough to feel alive, rarely enough to be cheap. */
const SPAWN_INTERVAL = 40;

/** Positions tried per player per round. */
const ATTEMPTS_PER_PLAYER = 12;

/** Mobs spawn in this band around a player: outside their notice, inside their view. */
const MIN_SPAWN_DISTANCE = 24;
const MAX_SPAWN_DISTANCE = 44;

/** Beyond this from every player, a mob is taken away again. */
const DESPAWN_DISTANCE = 88;

/**
 * How many of each kind may exist per player.
 *
 * Per player rather than per world, so a busy server does not starve everyone of mobs, and an empty
 * one does not keep any.
 */
const PASSIVE_CAP_PER_PLAYER = 14;
const HOSTILE_CAP_PER_PLAYER = 20;

/** Mobs of one species that appear together, so animals arrive as herds rather than singly. */
const MIN_GROUP = 2;
const MAX_GROUP = 4;

/** Below this, and under cover, counts as dark enough for the things that like the dark. */
const UNDERGROUND_Y = 50;

/** Surfaces the animals of the overworld are willing to stand on. */
const PASSIVE_GROUND: ReadonlySet<string> = new Set([
    'minecraft:grass_block',
    'minecraft:dirt',
    'minecraft:grass_path'
]);

interface SpawnEntry {
    /** The class to build, looked up by its `MOB_ID`. */
    readonly type: string;
    /** Relative likelihood within its group. */
    readonly weight: number;
}

const PASSIVE_SPECIES: readonly SpawnEntry[] = [
    { type: 'minecraft:cow', weight: 8 },
    { type: 'minecraft:sheep', weight: 8 },
    { type: 'minecraft:pig', weight: 7 },
    { type: 'minecraft:chicken', weight: 6 },
    { type: 'minecraft:rabbit', weight: 3 },
    { type: 'minecraft:horse', weight: 2 },
    { type: 'minecraft:fox', weight: 1 }
];

const HOSTILE_SPECIES: readonly SpawnEntry[] = [
    { type: 'minecraft:zombie', weight: 9 },
    { type: 'minecraft:skeleton', weight: 7 },
    { type: 'minecraft:spider', weight: 6 },
    { type: 'minecraft:creeper', weight: 5 },
    { type: 'minecraft:enderman', weight: 1 }
];

export class MobSpawner {
    private readonly view: BlockView;

    public constructor(private readonly world: World) {
        this.view = new BlockView(world);
    }

    /**
     * One round of spawning and despawning, if this tick is one of the ones that does any.
     * @param {number} tick - The server tick.
     */
    public async tick(tick: number): Promise<void> {
        if (tick % SPAWN_INTERVAL !== 0) return;

        const players = this.world.getPlayers();
        if (players.length === 0) return;

        await this.despawnDistantMobs(players.map((player) => player.getPosition()));
        await this.spawnAroundPlayers(players.map((player) => player.getPosition()));
    }

    /**
     * Removes mobs nobody is near.
     *
     * Only mobs the spawner could have created: a villager belongs to its village and an animal a
     * player bred is theirs, so neither should evaporate because they walked away. That is what
     * {@link Mob.isPersistent} distinguishes.
     */
    private async despawnDistantMobs(players: readonly Vector3[]): Promise<void> {
        const doomed = this.world.getEntities().filter((entity) => {
            if (!(entity instanceof Mob) || entity.isPersistent()) return false;

            return this.distanceToNearest(entity.getPosition(), players) > DESPAWN_DISTANCE;
        });

        await Promise.all(doomed.map(async (entity) => this.world.removeEntity(entity)));
    }

    /** Tries a few positions near each player, and spawns a group at any that will take one. */
    private async spawnAroundPlayers(players: readonly Vector3[]): Promise<void> {
        const night = this.isNight();
        const counts = this.countMobs();

        // Peaceful means no monsters at all, not harmless ones: a zombie that spawned and then did
        // nothing would still crowd the caps and still be there when the setting was turned back.
        const monsters = spawnsMonsters(this.world.getServer().getConfig().getDifficulty());

        for (const player of players) {
            const hostile = monsters && (night || player.getY() < UNDERGROUND_Y);

            for (let attempt = 0; attempt < ATTEMPTS_PER_PLAYER; attempt++) {
                // Re-read each attempt: a group spawned a moment ago counts against the next one.
                const cap = hostile ? HOSTILE_CAP_PER_PLAYER : PASSIVE_CAP_PER_PLAYER;
                if ((hostile ? counts.hostile : counts.passive) >= cap * players.length) break;

                const spot = this.findSpawnSpot(player, hostile);
                if (!spot) continue;

                const species = MobSpawner.pick(hostile ? HOSTILE_SPECIES : PASSIVE_SPECIES);
                const spawned = await this.spawnGroup(species, spot, hostile);

                if (hostile) counts.hostile += spawned;
                else counts.passive += spawned;
            }
        }
    }

    /**
     * Somewhere near a player a mob could stand.
     *
     * Positions are thrown at the world and tested rather than searched for. A search would have to
     * walk the loaded chunks looking for suitable ground, which is both far more work and, because
     * it would always find the same places first, far more predictable.
     */
    private findSpawnSpot(player: Vector3, hostile: boolean): Vector3 | null {
        const angle = Math.random() * Math.PI * 2;
        const distance = MIN_SPAWN_DISTANCE + Math.random() * (MAX_SPAWN_DISTANCE - MIN_SPAWN_DISTANCE);

        const x = Math.floor(player.getX() + Math.cos(angle) * distance);
        const z = Math.floor(player.getZ() + Math.sin(angle) * distance);

        const chunk = this.world.getLoadedChunk(x >> 4, z >> 4);
        if (!chunk) return null;

        const surface = chunk.getHighestBlockAt(x, z);
        if (surface === null) return null;

        const feet = surface + 1;
        if (!this.view.canStandAt(x, feet, z)) return null;

        const ground = chunk.getBlock(x & 0xf, surface, z & 0xf).name;

        if (hostile) {
            // No light engine, so "dark" is night in the open or anywhere under cover deep enough
            // that the sun would not reach it. Coarse, but it puts monsters in caves and in the
            // dark rather than standing in a field at noon.
            if (!this.isNight() && (feet >= UNDERGROUND_Y || this.hasSkyAccess(x, feet, z))) return null;
            if (ground === 'minecraft:water') return null;
        } else if (!PASSIVE_GROUND.has(ground)) {
            return null;
        }

        return new Vector3(x + 0.5, feet, z + 0.5);
    }

    /** Whether a column is open to the sky, which is as close to a light level as this gets. */
    private hasSkyAccess(x: number, y: number, z: number): boolean {
        return this.view.seesSky(x, y, z);
    }

    /** Spawns a few of one species around a spot, skipping any that will not fit. */
    private async spawnGroup(species: SpawnEntry, center: Vector3, hostile: boolean): Promise<number> {
        const Species = Object.values(Entities).find((candidate) => candidate.MOB_ID === species.type) as
            SpawnableEntityClass | undefined;
        if (!Species) return 0;

        // Monsters arrive alone more often than animals do, which is most of what makes a herd of
        // cows read differently from a wandering zombie.
        const wanted = hostile
            ? 1 + Math.floor(Math.random() * 2)
            : MIN_GROUP + Math.floor(Math.random() * (MAX_GROUP - MIN_GROUP + 1));

        // Checked against the body this species actually has, not a generic one. A spider is 1.4
        // across and a ghast four: dropped into a spot only a sheep fits, they arrive inside the
        // scenery and spend their lives shoving themselves out of it.
        const { width, height } = sizeOf(species.type);

        let spawned = 0;
        for (let index = 0; index < wanted; index++) {
            const x = Math.floor(center.getX()) + Math.floor(Math.random() * 5) - 2;
            const z = Math.floor(center.getZ()) + Math.floor(Math.random() * 5) - 2;
            const y = this.view.groundBelow(x, Math.floor(center.getY()) + 2, z, 4, height, width);
            if (y === null) continue;

            const entity: Entity = new Species({
                position: new Position(x + 0.5, y, z + 0.5, this.world),
                yaw: Math.random() * 360
            });

            await this.world.addEntity(entity);
            spawned++;
        }

        return spawned;
    }

    /** How many spawner-owned mobs of each kind are about. */
    private countMobs(): { passive: number; hostile: number } {
        const counts = { passive: 0, hostile: 0 };

        for (const entity of this.world.getEntities()) {
            if (!(entity instanceof Mob) || entity.isPersistent()) continue;

            if (HOSTILE_SPECIES.some((species) => species.type === entity.getType())) counts.hostile++;
            else counts.passive++;
        }

        return counts;
    }

    private distanceToNearest(from: Vector3, players: readonly Vector3[]): number {
        let nearest = Number.POSITIVE_INFINITY;

        for (const player of players) {
            nearest = Math.min(
                nearest,
                Math.hypot(player.getX() - from.getX(), player.getY() - from.getY(), player.getZ() - from.getZ())
            );
        }

        return nearest;
    }

    private isNight(): boolean {
        return isNight(this.world.getTicks());
    }

    /** One entry, weighted. */
    private static pick(species: readonly SpawnEntry[]): SpawnEntry {
        const total = species.reduce((sum, entry) => sum + entry.weight, 0);
        let roll = Math.random() * total;

        for (const entry of species) {
            roll -= entry.weight;
            if (roll <= 0) return entry;
        }

        return species[species.length - 1]!;
    }
}

export default MobSpawner;
