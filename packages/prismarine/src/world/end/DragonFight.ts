/**
 * The End's dragon fight, Java's `EnderDragonFight` over the data-driven runtime.
 *
 * One of these lives on the End world and is ticked by it. It owns the persistent fight state
 * (whether the dragon is alive, where the exit portal stands, which gateways remain), spawns
 * the dragon when one should exist, and runs the boss bar for the players in the arena. The
 * fight's consequences grow in later slices: the dragon's death opens the portal, and four
 * placed crystals respawn it.
 */
import { endPodium } from '@jsprismarine/features';
import { shuffledCopy } from '@jsprismarine/features';
import { LegacyRandomSource } from '@jsprismarine/worldgen';

import type { DataEntity } from '../../entity/data/DataEntity';
import { BossBar } from '../../network/BossBar';
import type Player from '../../Player';
import type { World } from '../World';
import type { DragonFightState } from '../WorldPersistence';
import { fightFeatureWorld } from './worldFeatureAdapter';

export type { DragonFightState } from '../WorldPersistence';

/** The dragon spawns and respawn-crystal beams aim here, Java's `DRAGON_SPAWN_Y` over (0, 0). */
const DRAGON_SPAWN = { x: 0, y: 128, z: 0 } as const;

/** How far from (0, 128, 0) a player still counts as in the arena, Java's `validPlayer` range. */
const ARENA_RADIUS = 192;

/** How often the fight re-checks who is in the arena, Java's `TIME_BETWEEN_PLAYER_SCANS`. */
const PLAYER_SCAN_INTERVAL = 20;

/** How long a missing dragon stays missing before one is spawned, Java's `MAX_TICKS_BEFORE_DRAGON_RESPAWN`. */
const DRAGON_RESPAWN_CHECK_TICKS = 1200;

/** How many gateway positions ring the island, Java's `GATEWAY_COUNT`. */
const GATEWAY_COUNT = 20;

/** The dragon heals one point this often while a crystal is near, Java's `checkCrystals` cadence. */
const CRYSTAL_HEAL_INTERVAL = 10;

/** How close a crystal must be to heal the dragon, Java's `nearestCrystal` search radius. */
const CRYSTAL_HEAL_RADIUS = 32;

const DRAGON_IDENTIFIER = 'minecraft:ender_dragon';
const CRYSTAL_IDENTIFIER = 'minecraft:ender_crystal';

/** A fight no save has seen yet: everything at Java's codec defaults, waiting for the scan. */
const freshState = (): DragonFightState => ({
    dragonKilled: false,
    previouslyKilled: false,
    needsStateScanning: true,
    gateways: [],
    respawnTime: 0,
    respawnCrystalIds: []
});

/**
 * The persistent dragon fight of one End world.
 *
 * Java keeps the arena loaded through a chunk ticket while the boss bar has players; this
 * server has no ticket system, so the whole fight runs only while a player is within
 * {@link ARENA_RADIUS} of the dragon's spawn point, which also keeps the arena's chunks
 * loaded through that player. An empty arena freezes the fight where it stands.
 */
export class DragonFight {
    private readonly world: World;
    private readonly fight: DragonFightState;
    private readonly bar: BossBar;
    /** The live dragon, resolved from {@link DragonFightState.dragonUniqueId} leniently. */
    private dragon: DataEntity | undefined;
    private ticks = 0;
    /** Ticks the dragon has been missing while its reference is still held, Java's `ticksSinceDragonSeen`. */
    private ticksSinceDragonSeen = 0;
    /** Whether anyone is in the arena, cached between the 20-tick player scans. */
    private playerNear = false;
    /** The percent last sent, so health that did not change costs no packet. */
    private lastBarPercent: number | undefined;
    /** Whether the missing dragon type has been reported, so the log says it once. */
    private reportedMissingDragonType = false;

    /**
     * Restores a fight from its saved state, or starts a fresh one that scans the world on its
     * first ticks. An empty gateway list fills with the indices 0 through 19 shuffled by the
     * Java LCG over the world seed, as Java's `init` fills it.
     */
    public constructor(world: World, state: DragonFightState | undefined, seed: bigint) {
        this.world = world;
        this.fight = state ?? freshState();
        if (this.fight.gateways.length === 0) {
            this.fight.gateways = shuffledCopy(
                Array.from({ length: GATEWAY_COUNT }, (_, index) => index),
                new LegacyRandomSource(seed)
            );
        }
        this.bar = new BossBar({ actorUniqueId: 0n, name: 'entity.minecraft.ender_dragon' });
        world.dataEntities().onEntityRemoved((entity, reason) => this.entityRemoved(entity, reason));
    }

    /**
     * One fight tick, run from the End world's own tick.
     *
     * Every 20 ticks the boss bar gains the players in the arena and loses the rest; nothing
     * else runs while the arena is empty. The first populated tick scans the world once: find
     * the podium or place it inactive, and find the dragon or decide one is owed. After that,
     * a missing dragon is re-sought - and spawned when the fight holds no reference or has
     * waited 1200 ticks - the crystals heal it, and its health drives the bar.
     */
    public async tick(): Promise<void> {
        this.ticks += 1;
        if ((this.ticks - 1) % PLAYER_SCAN_INTERVAL === 0) await this.updatePlayers();
        if (!this.playerNear) return;

        if (this.fight.needsStateScanning) await this.scanState();
        if (this.fight.dragonKilled) return;

        await this.resolveDragon();
        if (this.dragon === undefined) return;

        if (this.ticks % CRYSTAL_HEAL_INTERVAL === 0) this.healFromCrystals(this.dragon);
        await this.updateBar(this.dragon);
    }

    /**
     * Takes the dragon's death: the bar empties and hides, and the fight remembers the kill, so
     * no new dragon spawns until a respawn sequence runs. The death's consequences in the world
     * - the open portal, the egg, the gateway, the experience - land in a later slice.
     */
    public async setDragonKilled(dragon: DataEntity): Promise<void> {
        if (this.fight.dragonUniqueId !== undefined && dragon.persistentIdentity !== this.fight.dragonUniqueId) return;

        this.dragon = undefined;
        this.fight.dragonUniqueId = undefined;
        this.fight.dragonKilled = true;
        this.fight.previouslyKilled = true;
        this.lastBarPercent = 0;
        await this.bar.setPercent(0);
        for (const player of this.bar.players()) await this.bar.removePlayer(player);
    }

    /**
     * The live fight state the save stores as `WorldPersistenceData.dragonFight`.
     *
     * The object is the fight's own, read at save time; callers do not write to it.
     */
    public state(): DragonFightState {
        return this.fight;
    }

    /** Reacts to the runtime letting go of the tracked dragon, however that happened. */
    private entityRemoved(entity: DataEntity, reason: string): void {
        if (entity.persistentIdentity !== this.fight.dragonUniqueId) return;

        this.dragon = undefined;
        if (reason === 'death' || reason === 'death_behavior') {
            this.setDragonKilled(entity).catch((error: unknown) => this.report(String(error)));
        } else if (reason !== 'chunk unload') {
            // Gone without dying or being saved - forget it, so the 1200-tick check spawns anew.
            this.fight.dragonUniqueId = undefined;
        }
    }

    /** Puts the bar on the players in the arena and takes it off everyone else. */
    private async updatePlayers(): Promise<void> {
        const near = this.world.getPlayers().filter((player) => this.inArena(player));
        this.playerNear = near.length > 0;

        if (!this.fight.dragonKilled) for (const player of near) await this.bar.addPlayer(player);
        for (const player of this.bar.players()) {
            if (this.fight.dragonKilled || !near.includes(player)) await this.bar.removePlayer(player);
        }
    }

    private inArena(player: Player): boolean {
        const position = player.getPosition();
        const dx = position.getX() - DRAGON_SPAWN.x;
        const dy = position.getY() - DRAGON_SPAWN.y;
        const dz = position.getZ() - DRAGON_SPAWN.z;
        return dx * dx + dy * dy + dz * dz <= ARENA_RADIUS * ARENA_RADIUS;
    }

    /**
     * Java's `scanState`, run once per save: find the exit portal or place the inactive podium,
     * then decide whether a dragon exists or is owed.
     *
     * An active portal means a dragon died here before. No portal at all means a fresh world:
     * the inactive podium is placed where Java puts it, at the top of the (0, 0) column stepped
     * down through bedrock while above y 63. With no portal history and no live dragon, the
     * first dragon is owed, so `dragonKilled` stays false and the tick spawns one.
     */
    private async scanState(): Promise<void> {
        await this.loadArenaCenter();

        const found = this.findExitPortal();
        if (found !== undefined) {
            this.fight.exitPortalLocation = found.origin;
            this.fight.previouslyKilled = found.active;
        } else {
            this.fight.previouslyKilled = false;
            this.placeExitPortal(false);
        }

        const dragon = this.findLiveDragon();
        if (dragon !== undefined) {
            await this.adopt(dragon);
            this.fight.dragonKilled = false;
        } else {
            this.fight.dragonKilled = true;
        }
        if (!this.fight.previouslyKilled && dragon === undefined) this.fight.dragonKilled = false;

        this.fight.needsStateScanning = false;
    }

    /** Loads the four chunks the podium search and placement span, around (0, 0). */
    private async loadArenaCenter(): Promise<void> {
        for (const x of [-8, 8]) for (const z of [-8, 8]) await this.world.getChunkAt(x, z);
    }

    /**
     * Finds the podium in the (0, z 0) column by its bedrock signature: the four-high pillar
     * above the origin and the rim's four cardinal cells. Java matches a block pattern at every
     * end portal block entity within eight chunks first, but both editions only ever place the
     * podium in this column, so the column scan is the whole search here.
     */
    private findExitPortal(): { origin: { x: number; y: number; z: number }; active: boolean } | undefined {
        const minY = this.world.getDimension().minY;
        for (let y = this.world.topOfColumn(0, 0); y > minY; y -= 1) {
            if (!this.isPodiumOrigin(y)) continue;

            const active = this.world.loadedBlockAt(1, y, 0)?.name === 'minecraft:end_portal';
            return { origin: { x: 0, y, z: 0 }, active };
        }
        return undefined;
    }

    private isPodiumOrigin(y: number): boolean {
        const bedrockAt = (x: number, dy: number, z: number): boolean =>
            this.world.loadedBlockAt(x, y + dy, z)?.name === 'minecraft:bedrock';
        for (let dy = 0; dy < 4; dy += 1) if (!bedrockAt(0, dy, 0)) return false;
        return bedrockAt(3, 0, 0) && bedrockAt(-3, 0, 0) && bedrockAt(0, 0, 3) && bedrockAt(0, 0, -3);
    }

    /** Places the podium through the `end_podium` feature and records where it stands. */
    private placeExitPortal(active: boolean): void {
        const origin = this.fight.exitPortalLocation ?? { x: 0, y: this.podiumY(), z: 0 };
        this.fight.exitPortalLocation = origin;
        endPodium(active).place(fightFeatureWorld(this.world), new LegacyRandomSource(this.world.getSeed()), origin);
    }

    /** Java's `spawnExitPortal` position: the (0, 0) surface, stepped down through bedrock above y 63. */
    private podiumY(): number {
        const minY = this.world.getDimension().minY;
        let y = this.topBlockY();
        while (y > 63 && this.world.loadedBlockAt(0, y, 0)?.name === 'minecraft:bedrock') y -= 1;
        return Math.max(y, minY + 1);
    }

    /** The y of the topmost non-air block at (0, 0), or below the floor when the column is void. */
    private topBlockY(): number {
        const minY = this.world.getDimension().minY;
        for (let y = this.world.topOfColumn(0, 0) - 1; y >= minY; y -= 1) {
            if (this.world.loadedBlockAt(0, y, 0)?.name !== 'minecraft:air') return y;
        }
        return minY - 1;
    }

    /**
     * Keeps {@link dragon} pointing at the live dragon, leniently: a loaded dragon is adopted
     * whoever spawned it, and one that stays missing - the reference never resolved, or 1200
     * ticks passed - is replaced by a fresh spawn at (0, 128, 0), Java's `findOrCreateDragon`.
     */
    private async resolveDragon(): Promise<void> {
        if (this.dragon !== undefined) return;

        const live = this.findLiveDragon();
        if (live !== undefined) {
            await this.adopt(live);
            this.ticksSinceDragonSeen = 0;
            return;
        }

        this.ticksSinceDragonSeen += 1;
        if (this.fight.dragonUniqueId !== undefined && this.ticksSinceDragonSeen < DRAGON_RESPAWN_CHECK_TICKS) return;

        const spawned = this.world.dataEntities().runtime.spawn(DRAGON_IDENTIFIER, { ...DRAGON_SPAWN });
        this.ticksSinceDragonSeen = 0;
        if (spawned === undefined) {
            if (!this.reportedMissingDragonType) {
                this.reportedMissingDragonType = true;
                this.report(`no loaded pack declares ${DRAGON_IDENTIFIER}, so the fight has no dragon`);
            }
            return;
        }
        await this.adopt(spawned);
    }

    /** The loaded dragon this fight's reference names, or any loaded dragon, Java's `getDragons`. */
    private findLiveDragon(): DataEntity | undefined {
        const dragons = this.world
            .dataEntities()
            .runtime.all()
            .filter((entity) => entity.identifier === DRAGON_IDENTIFIER);
        return dragons.find((entity) => entity.persistentIdentity === this.fight.dragonUniqueId) ?? dragons[0];
    }

    private async adopt(dragon: DataEntity): Promise<void> {
        this.dragon = dragon;
        this.fight.dragonUniqueId = dragon.persistentIdentity;
        await this.bar.setActorUniqueId(this.actorIdOf(dragon));
    }

    /** The actor id the client tracks the dragon's body by, which is what the bar binds to. */
    private actorIdOf(dragon: DataEntity): bigint {
        return this.world.dataEntities().bodies.bodyOf(dragon.id)?.getRuntimeId() ?? BigInt(dragon.id);
    }

    /** Java's `checkCrystals`: one point of health per ten ticks while a crystal is within 32. */
    private healFromCrystals(dragon: DataEntity): void {
        const health = dragon.instance.attributes.get('health');
        if (health === undefined || health.current <= 0 || health.current >= health.max) return;
        if (!this.crystalNear(dragon)) return;

        dragon.instance.attributes.set('health', health.current + 1);
    }

    private crystalNear(dragon: DataEntity): boolean {
        const radiusSquared = CRYSTAL_HEAL_RADIUS * CRYSTAL_HEAL_RADIUS;
        return this.world
            .dataEntities()
            .runtime.all()
            .some((entity) => {
                if (entity.identifier !== CRYSTAL_IDENTIFIER) return false;
                const dx = entity.position.x - dragon.position.x;
                const dy = entity.position.y - dragon.position.y;
                const dz = entity.position.z - dragon.position.z;
                return dx * dx + dy * dy + dz * dz <= radiusSquared;
            });
    }

    /** Follows the dragon's health onto the bar, sending only when the percent moved. */
    private async updateBar(dragon: DataEntity): Promise<void> {
        const health = dragon.instance.attributes.get('health');
        const percent = health === undefined || health.max <= 0 ? 0 : health.current / health.max;
        if (percent === this.lastBarPercent) return;

        this.lastBarPercent = percent;
        await this.bar.setPercent(percent);
    }

    private report(message: string): void {
        this.world.getServer().getLogger().warn(`dragon fight: ${message}`, 'world/end/DragonFight');
    }
}
