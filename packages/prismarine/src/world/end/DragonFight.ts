/**
 * The End's dragon fight, Java's `EnderDragonFight` over the data-driven runtime.
 *
 * One of these lives on the End world and is ticked by it. It owns the persistent fight state
 * (whether the dragon is alive, where the exit portal stands, which gateways remain), spawns
 * the dragon when one should exist, runs the boss bar for the players in the arena, and takes
 * the dragon's death: the exit portal opens, the egg lands on a world's first kill, a gateway
 * is spent and the experience is paid. Four crystals can start the pillar-reset sequence that
 * summons the dragon again.
 */
import { blockState, endGateway, endPodium, endSpike, endSpikesForSeed, shuffledCopy } from '@jsprismarine/features';
import type { EndSpike } from '@jsprismarine/features';
import { Vector3 } from '@jsprismarine/math';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import { LegacyRandomSource } from '@jsprismarine/worldgen';

import type { DataEntity } from '../../entity/data/DataEntity';
import { explode } from '../../entity/Explosion';
import { addExperiencePoints } from '../../entity/Experience';
import { BossBar } from '../../network/BossBar';
import type Player from '../../Player';
import type { World } from '../World';
import type { DragonFightState, DragonRespawnStage } from '../WorldPersistence';
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

/** How far out the gateway ring sits, Java's `GATEWAY_DISTANCE`. */
const GATEWAY_DISTANCE = 96;

/** The y every gateway stands at, Java's `spawnNewGateway`. */
const GATEWAY_Y = 75;

/** A twentieth of the circle, the angle step in Java's `spawnNewGateway`. */
const GATEWAY_ANGLE_STEP = 0.15707963267948966;

/** Experience for a world's first dragon kill, Java's `EnderDragon.tickDeath`. */
const FIRST_KILL_EXPERIENCE = 12000;

/** Experience for every kill after the first. */
const REPEAT_KILL_EXPERIENCE = 500;

/** The dragon heals one point this often while a crystal is near, Java's `checkCrystals` cadence. */
const CRYSTAL_HEAL_INTERVAL = 10;

/** How close a crystal must be to heal the dragon, Java's `nearestCrystal` search radius. */
const CRYSTAL_HEAL_RADIUS = 32;

/** The four crystals sit three blocks from the podium center, Java's respawn portal shape. */
const RESPAWN_CRYSTAL_OFFSETS = [
    { x: 3, z: 0 },
    { x: -3, z: 0 },
    { x: 0, z: 3 },
    { x: 0, z: -3 }
] as const;

/** Java waits 100 ticks before the pillars start moving. */
const RESPAWN_PREPARE_TICKS = 100;
/** Each pillar takes 40 ticks to reset, Java's `SPIKE_TICKS`. */
const RESPAWN_PILLAR_TICKS = 40;
/** Java waits 100 ticks while the dragon is summoned. */
const RESPAWN_SUMMON_TICKS = 100;

const DRAGON_IDENTIFIER = 'minecraft:ender_dragon';
const CRYSTAL_IDENTIFIER = 'minecraft:ender_crystal';
const XP_ORB_IDENTIFIER = 'minecraft:xp_orb';

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
    /** A saved respawn first loads its portal chunks before checking the crystal identities. */
    private respawnChunksLoaded: boolean;
    /**
     * A death's world consequences still in flight.
     *
     * The removal listener is synchronous, so {@link setDragonKilled} runs as its own task;
     * the next tick waits it out, so no tick or save sees a half-opened portal.
     */
    private settling: Promise<void> | undefined;

    /**
     * Restores a fight from its saved state, or starts a fresh one that scans the world on its
     * first ticks. An empty gateway list fills with the indices 0 through 19 shuffled by the
     * Java LCG over the world seed, as Java's `init` fills it.
     */
    public constructor(world: World, state: DragonFightState | undefined, seed: bigint) {
        this.world = world;
        this.fight = state ?? freshState();
        this.respawnChunksLoaded = this.fight.respawnStage === undefined;
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
        if (this.settling !== undefined) {
            await this.settling;
            this.settling = undefined;
        }

        this.ticks += 1;
        if ((this.ticks - 1) % PLAYER_SCAN_INTERVAL === 0) await this.updatePlayers();
        if (!this.playerNear) return;

        if (this.fight.needsStateScanning) await this.scanState();
        if (this.fight.respawnStage !== undefined) {
            await this.tickRespawn();
            return;
        }
        if (this.fight.dragonKilled) return;

        await this.resolveDragon();
        if (this.dragon === undefined) return;

        if (this.ticks % CRYSTAL_HEAL_INTERVAL === 0) this.healFromCrystals(this.dragon);
        await this.updateBar(this.dragon);
    }

    /**
     * Takes the dragon's death, in Java's `setDragonKilled` order: the bar empties and hides,
     * the podium is re-placed active with end portal blocks filling its ring, one gateway
     * index is spent on a new gateway, the egg lands on a world's first kill, the experience
     * is paid, and the flags flip so no new dragon spawns until a respawn sequence runs.
     *
     * The removal listener calls this when the 200-tick death hold ends, which is when Java's
     * `tickDeath` calls its counterpart.
     */
    public async setDragonKilled(dragon: DataEntity): Promise<void> {
        if (this.fight.dragonUniqueId !== undefined && dragon.persistentIdentity !== this.fight.dragonUniqueId) return;

        const firstKill = !this.fight.previouslyKilled;
        this.dragon = undefined;
        this.fight.dragonUniqueId = undefined;
        this.lastBarPercent = 0;
        await this.bar.setPercent(0);
        for (const player of this.bar.players()) await this.bar.removePlayer(player);

        this.placeExitPortal(true);
        await this.spawnNewGateway();
        if (firstKill) this.placeDragonEgg();
        this.awardExperience(dragon, firstKill);

        this.fight.dragonKilled = true;
        this.fight.previouslyKilled = true;
    }

    /**
     * The live fight state the save stores as `WorldPersistenceData.dragonFight`.
     *
     * The object is the fight's own, read at save time; callers do not write to it.
     */
    public state(): DragonFightState {
        return this.fight;
    }

    /**
     * Starts Java's four-crystal respawn sequence when the crystals occupy the exit portal's
     * four edge cells. Crystal placement remains valid in worlds without an End fight; this
     * method is the only place that consumes the four-crystal arrangement.
     *
     * @returns Whether the fight accepted the four crystals and started its saved stage machine.
     */
    public tryRespawn(): boolean {
        if (!this.fight.dragonKilled || this.fight.respawnStage !== undefined) return false;
        const origin = this.fight.exitPortalLocation;
        if (origin === undefined) return false;

        const crystals = RESPAWN_CRYSTAL_OFFSETS.map(({ x, z }) =>
            this.findCrystalAt({ x: origin.x + x, y: origin.y + 2, z: origin.z + z })
        ).filter((crystal) => crystal !== undefined);
        if (crystals.length !== RESPAWN_CRYSTAL_OFFSETS.length) return false;

        this.fight.respawnCrystalIds = crystals.map((crystal) => crystal.persistentIdentity);
        this.fight.respawnStage = 'start';
        this.fight.respawnTime = 0;
        this.respawnChunksLoaded = true;
        this.placeExitPortal(false);
        return true;
    }

    /** Aborts when a driving crystal is destroyed; chunk unloads remain resumable. */
    public onCrystalDestroyed(crystal: DataEntity, reason: string): void {
        if (!this.fight.respawnCrystalIds.includes(crystal.persistentIdentity)) return;
        if (reason === 'death' || reason === 'death_behavior' || reason === 'explosion') this.abortRespawn();
    }

    /** Reacts to the runtime letting go of the tracked dragon, however that happened. */
    private entityRemoved(entity: DataEntity, reason: string): void {
        if (entity.identifier === CRYSTAL_IDENTIFIER) this.onCrystalDestroyed(entity, reason);
        if (entity.persistentIdentity !== this.fight.dragonUniqueId) return;

        this.dragon = undefined;
        if (reason === 'death' || reason === 'death_behavior') {
            this.settling = this.setDragonKilled(entity).catch((error: unknown) => this.report(String(error)));
        } else if (reason !== 'chunk unload') {
            // Gone without dying or being saved - forget it, so the 1200-tick check spawns anew.
            this.fight.dragonUniqueId = undefined;
        }
    }

    /** Advances the saved 1 + 100 + 10×40 + 100 tick respawn sequence. */
    private async tickRespawn(): Promise<void> {
        const stage = this.fight.respawnStage;
        if (stage === undefined) return;

        if (!this.respawnChunksLoaded) {
            await this.loadArenaCenter();
            this.respawnChunksLoaded = true;
        }
        if (!this.respawnCrystalIdsAreLive()) {
            this.abortRespawn();
            return;
        }

        switch (stage) {
            case 'start':
                this.setRespawnCrystalBeam(DRAGON_SPAWN);
                this.setRespawnStage('preparing_to_summon_pillars');
                return;
            case 'preparing_to_summon_pillars':
                this.fight.respawnTime += 1;
                if (this.fight.respawnTime >= RESPAWN_PREPARE_TICKS) this.setRespawnStage('summoning_pillars');
                return;
            case 'summoning_pillars': {
                const spikes = endSpikesForSeed(this.world.getSeed());
                const time = this.fight.respawnTime;
                const spike = spikes[Math.floor(time / RESPAWN_PILLAR_TICKS)];
                if (spike === undefined) {
                    this.setRespawnStage('summoning_dragon');
                    return;
                }

                if (time % RESPAWN_PILLAR_TICKS === 0) {
                    this.setRespawnCrystalBeam({ x: spike.centerX, y: spike.height + 1, z: spike.centerZ });
                }
                if (time % RESPAWN_PILLAR_TICKS === RESPAWN_PILLAR_TICKS - 1) await this.resetSpike(spike);

                this.fight.respawnTime += 1;
                if (this.fight.respawnTime >= spikes.length * RESPAWN_PILLAR_TICKS) {
                    this.setRespawnCrystalBeam(DRAGON_SPAWN);
                    this.setRespawnStage('summoning_dragon');
                }
                return;
            }
            case 'summoning_dragon':
                this.setRespawnCrystalBeam(DRAGON_SPAWN);
                this.fight.respawnTime += 1;
                if (this.fight.respawnTime >= RESPAWN_SUMMON_TICKS) await this.finishRespawn();
                return;
        }
    }

    /** Saves the next phase and resets its phase-local clock. */
    private setRespawnStage(stage: DragonRespawnStage): void {
        this.fight.respawnStage = stage;
        this.fight.respawnTime = 0;
    }

    /** Finds a crystal whose feet occupy one exact block cell. */
    private findCrystalAt(at: { x: number; y: number; z: number }): DataEntity | undefined {
        return this.world
            .dataEntities()
            .runtime.all()
            .find(
                (entity) =>
                    entity.identifier === CRYSTAL_IDENTIFIER &&
                    Math.floor(entity.position.x) === at.x &&
                    entity.position.y === at.y &&
                    Math.floor(entity.position.z) === at.z
            );
    }

    /** Whether every saved crystal is present in the loaded entity runtime. */
    private respawnCrystalIdsAreLive(): boolean {
        const liveIds = new Set(
            this.world
                .dataEntities()
                .runtime.all()
                .filter((entity) => entity.identifier === CRYSTAL_IDENTIFIER)
                .map((entity) => entity.persistentIdentity)
        );
        return (
            this.fight.respawnCrystalIds.length === RESPAWN_CRYSTAL_OFFSETS.length &&
            this.fight.respawnCrystalIds.every((id) => liveIds.has(id))
        );
    }

    /** Points the four driving crystals at one position. */
    private setRespawnCrystalBeam(target: { x: number; y: number; z: number }): void {
        const ids = new Set(this.fight.respawnCrystalIds);
        for (const crystal of this.world.dataEntities().runtime.all()) {
            if (ids.has(crystal.persistentIdentity)) crystal.body.beamTarget = { ...target };
        }
    }

    /** Clears pillar-crystal protection and beams on both completion and abort. */
    private resetPillarCrystalOptions(): void {
        for (const crystal of this.world.dataEntities().runtime.all()) {
            if (crystal.identifier !== CRYSTAL_IDENTIFIER) continue;
            crystal.body.invulnerable = false;
            crystal.body.beamTarget = undefined;
        }
    }

    /** Restores the active portal and makes partially reset pillar crystals vulnerable. */
    private abortRespawn(): void {
        delete this.fight.respawnStage;
        this.fight.respawnTime = 0;
        this.fight.respawnCrystalIds = [];
        this.respawnChunksLoaded = false;
        this.resetPillarCrystalOptions();
        this.placeExitPortal(true);
    }

    /** Clears one pillar, emits its power-five blast, and rebuilds it with a protected crystal. */
    private async resetSpike(spike: EndSpike): Promise<void> {
        const minX = spike.centerX - 10;
        const maxX = spike.centerX + 10;
        const minZ = spike.centerZ - 10;
        const maxZ = spike.centerZ + 10;
        const minChunkX = minX >> 4;
        const maxChunkX = maxX >> 4;
        const minChunkZ = minZ >> 4;
        const maxChunkZ = maxZ >> 4;
        const chunks = [];
        for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
            for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ += 1) {
                chunks.push(this.world.getChunkAt(chunkX * 16, chunkZ * 16));
            }
        }
        await Promise.all(chunks);

        const runtime = this.world.dataEntities().runtime;
        for (const crystal of runtime.all()) {
            if (
                crystal.identifier === CRYSTAL_IDENTIFIER &&
                Math.abs(crystal.position.x - spike.centerX) <= 10 &&
                Math.abs(crystal.position.z - spike.centerZ) <= 10
            ) {
                runtime.remove(crystal.id, 'pillar reset');
            }
        }

        const features = fightFeatureWorld(this.world);
        const maxY = spike.height + 10;
        for (let x = minX; x <= maxX; x += 1) {
            for (let z = minZ; z <= maxZ; z += 1) {
                for (let y = this.world.getDimension().minY; y <= maxY; y += 1) {
                    if (this.world.loadedBlockAt(x, y, z)?.name === 'minecraft:air') continue;
                    features.setBlock({ x, y, z }, blockState('minecraft:air'));
                }
            }
        }

        await explode(this.world, new Vector3(spike.centerX + 0.5, spike.height + 1, spike.centerZ + 0.5), {
            power: 5
        });
        endSpike([spike], true, DRAGON_SPAWN).place(features, new LegacyRandomSource(this.world.getSeed()), {
            x: spike.centerX,
            y: 0,
            z: spike.centerZ
        });
    }

    /** Explodes the four driving crystals without block damage and spawns the next dragon. */
    private async finishRespawn(): Promise<void> {
        const ids = new Set(this.fight.respawnCrystalIds);
        const crystals = this.world
            .dataEntities()
            .runtime.all()
            .filter((entity) => ids.has(entity.persistentIdentity));
        const positions = crystals.map((crystal) => ({ ...crystal.position }));
        for (const crystal of crystals) this.world.dataEntities().runtime.remove(crystal.id, 'respawn complete');

        this.fight.respawnCrystalIds = [];
        delete this.fight.respawnStage;
        this.fight.respawnTime = 0;
        this.respawnChunksLoaded = false;
        this.resetPillarCrystalOptions();

        await Promise.all(
            positions.map(({ x, y, z }) => explode(this.world, new Vector3(x, y, z), { power: 6, breaksBlocks: false }))
        );

        const dragon = this.world.dataEntities().runtime.spawn(DRAGON_IDENTIFIER, { ...DRAGON_SPAWN });
        this.fight.dragonKilled = false;
        if (dragon === undefined) {
            if (!this.reportedMissingDragonType) {
                this.reportedMissingDragonType = true;
                this.report(`no loaded pack declares ${DRAGON_IDENTIFIER}, so the fight has no dragon`);
            }
            return;
        }
        await this.adopt(dragon);
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

    /**
     * Java's `spawnNewGateway`: pops the last index of the shuffled list and places the
     * `end_gateway` feature at that spot of the 20-position ring 96 blocks out, at y 75.
     *
     * The gateway carries no exit, so its block entity records no destination: the teleport is
     * a later slice, and the blocks are what this kill owes the world. The chunks the feature
     * spans are loaded first, because nothing else ever loads the ring.
     */
    private async spawnNewGateway(): Promise<void> {
        const index = this.fight.gateways.pop();
        if (index === undefined) return;

        const angle = 2 * (-Math.PI + GATEWAY_ANGLE_STEP * index);
        const origin = {
            x: Math.floor(GATEWAY_DISTANCE * Math.cos(angle)),
            y: GATEWAY_Y,
            z: Math.floor(GATEWAY_DISTANCE * Math.sin(angle))
        };
        for (const x of [origin.x - 1, origin.x + 1]) {
            for (const z of [origin.z - 1, origin.z + 1]) await this.world.getChunkAt(x, z);
        }
        endGateway(undefined, false).place(
            fightFeatureWorld(this.world),
            new LegacyRandomSource(this.world.getSeed()),
            origin
        );
    }

    /** Java's first-kill egg: the dragon egg at the MOTION_BLOCKING heightmap position above (0, 0). */
    private placeDragonEgg(): void {
        const features = fightFeatureWorld(this.world);
        features.setBlock(
            { x: 0, y: features.getHeight('MOTION_BLOCKING', 0, 0), z: 0 },
            blockState('minecraft:dragon_egg')
        );
    }

    /**
     * Java's death payout: 12000 points on a world's first kill and 500 after, split as ten
     * `floor(xp * 0.08)` awards plus one `floor(xp * 0.2)`. Java spreads the ten over the
     * death animation's ticks 155 through 200; this server pays the whole schedule when the
     * animation's end removes the dragon.
     *
     * Each award drops an `xp_orb` entity, the way block breaks do. Nothing picks orbs up
     * yet, so the player who dealt the killing blow is also paid the total directly; take the
     * direct payment out when orb pickup lands, or a kill will pay twice.
     */
    private awardExperience(dragon: DataEntity, firstKill: boolean): void {
        const xp = firstKill ? FIRST_KILL_EXPERIENCE : REPEAT_KILL_EXPERIENCE;
        const awards = [...Array.from({ length: 10 }, () => Math.floor(xp * 0.08)), Math.floor(xp * 0.2)];
        for (const value of awards) {
            this.world.dataEntities().runtime.spawn(XP_ORB_IDENTIFIER, { ...dragon.position }, { data: { value } });
        }

        const killerId = dragon.body.damage.last()?.sourceId;
        const killer = this.world.getPlayers().find((player) => Number(player.getRuntimeId()) === killerId);
        if (killer === undefined) return;

        addExperiencePoints(
            {
                getLevel: () => killer.attributes.getValue(AttributeIds.PlayerLevel),
                getProgress: () => killer.attributes.getValue(AttributeIds.PlayerExperience),
                setLevel: (level) => killer.attributes.setValue(AttributeIds.PlayerLevel, level),
                setProgress: (progress) => killer.attributes.setValue(AttributeIds.PlayerExperience, progress)
            },
            xp
        );
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
