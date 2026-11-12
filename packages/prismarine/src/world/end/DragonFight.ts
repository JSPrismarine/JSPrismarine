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
import type { EntityPosition } from '@jsprismarine/entities';
import { blockState, endGateway, endPodium, endSpike, endSpikesForSeed, shuffledCopy } from '@jsprismarine/features';
import type { EndSpike } from '@jsprismarine/features';
import { Vector3 } from '@jsprismarine/math';
import { LegacyRandomSource } from '@jsprismarine/worldgen';

import type { DataEntity } from '../../entity/data/DataEntity';
import { explode } from '../../entity/Explosion';
import { addExperiencePoints } from '../../entity/Experience';
import { BossBar } from '../../network/BossBar';
import { chunksOfBlockBox } from '../ChunkTickets';
import type { ChunkCoordinate } from '../ChunkTickets';
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

/** The chunks a pillar reset clears and rebuilds, ten blocks around the pillar's center. */
const spikeChunks = (spike: EndSpike): ChunkCoordinate[] =>
    chunksOfBlockBox(spike.centerX - 10, spike.centerZ - 10, spike.centerX + 10, spike.centerZ + 10);

/** The four chunks the podium search and placement span, around (0, 0). */
const ARENA_CHUNKS: readonly ChunkCoordinate[] = chunksOfBlockBox(-8, -8, 8, 8);

/** The ticket the fight takes on {@link ARENA_CHUNKS} while it waits to scan or resume a respawn. */
const ARENA_TICKET = 'dragon-fight:arena';
/** The ticket on the chunks a dead dragon's consequences write: the podium, the egg and the gateway. */
const DEATH_TICKET = 'dragon-fight:death';
/** The ticket on the chunks of the pillar the respawn sequence resets next. */
const PILLAR_TICKET = 'dragon-fight:pillar';

/** A fight no save has seen yet: everything at Java's codec defaults, waiting for the scan. */
const freshState = (): DragonFightState => ({
    dragonKilled: false,
    previouslyKilled: false,
    needsStateScanning: true,
    gateways: [],
    respawnTime: 0,
    respawnCrystalIds: []
});

/** What a dragon's death leaves the fight to act on once its chunks are loaded. */
interface DragonDeath {
    readonly persistentIdentity: string;
    readonly position: EntityPosition;
    /** The runtime id of whoever dealt the killing blow, when anybody did in this run. */
    readonly killerId: number | undefined;
}

const deathOf = (dragon: DataEntity): DragonDeath => ({
    persistentIdentity: dragon.persistentIdentity,
    position: { ...dragon.position },
    killerId: dragon.body.damage.last()?.sourceId
});

/**
 * The persistent dragon fight of one End world.
 *
 * The whole fight runs only while a player is within {@link ARENA_RADIUS} of the dragon's spawn
 * point, which also keeps the arena's chunks loaded through that player. An empty arena freezes
 * the fight where it stands.
 *
 * The fight never waits for a chunk inside a tick. Work that needs chunks it lacks takes a chunk
 * ticket on them and goes into a waiting state, and a later tick, once an input step has admitted
 * them, does the work: the scan and a saved respawn wait for the arena, a dead dragon's
 * consequences wait for the podium's and the gateway's chunks, and a pillar reset waits for the
 * pillar's.
 */
export class DragonFight {
    private readonly world: World;
    /** Replaced whole when a death's consequences are taken back; see {@link DragonFight.takeDeath}. */
    private fight: DragonFightState;
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
    /** A saved respawn first waits for its portal chunks before checking the crystal identities. */
    private respawnChunksLoaded: boolean;
    /**
     * A dragon that died, whose world consequences the first fight tick with their chunks loaded
     * runs. The fight does nothing else until then.
     *
     * The removal listener can fire between ticks, from a console `/kill`, so the consequences
     * always run from a tick. The fight state carries where it died until then, so a save
     * taken meanwhile keeps the death; the killer is a runtime id and does not outlive the run.
     */
    private died: DragonDeath | undefined;
    /** The failure of a waiting death's consequences that was last reported, so it is reported once. */
    private deathFailure: string | undefined;

    /**
     * Restores a fight from its saved state, or starts a fresh one that scans the world on its
     * first ticks. An empty gateway list fills with the indices 0 through 19 shuffled by the
     * Java LCG over the world seed, as Java's `init` fills it.
     */
    public constructor(world: World, state: DragonFightState | undefined, seed: bigint) {
        this.world = world;
        this.fight = state ?? freshState();
        this.respawnChunksLoaded = this.fight.respawnStage === undefined;
        const { dragonDeathPosition, dragonUniqueId } = this.fight;
        if (dragonDeathPosition !== undefined && dragonUniqueId !== undefined)
            this.died = { persistentIdentity: dragonUniqueId, position: dragonDeathPosition, killerId: undefined };
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
     *
     * A tick that lacks a chunk it needs asks for it with a ticket and returns, and the fight
     * stays where it is until a later tick finds the chunk loaded.
     */
    public tick(): void {
        const died = this.died;
        // A unit that removed the dragon as dead and then threw adds it back when it is undone,
        // and no listener hears that. A dragon back in the world did not die.
        const back = died === undefined ? undefined : this.liveDragonWith(died.persistentIdentity);
        if (back !== undefined) {
            this.died = undefined;
            delete this.fight.dragonDeathPosition;
            this.adopt(back);
        } else if (died !== undefined) {
            const tickets = this.world.chunkTickets();
            if (!tickets.request(DEATH_TICKET, this.deathChunks())) return;

            tickets.release(DEATH_TICKET);
            if (!this.takeDeath(died)) return;
        }

        this.ticks += 1;
        if ((this.ticks - 1) % PLAYER_SCAN_INTERVAL === 0) this.updatePlayers();
        if (!this.playerNear) return;

        if (this.fight.needsStateScanning) {
            if (!this.arenaLoaded()) return;
            this.scanState();
        }
        if (this.fight.respawnStage !== undefined) {
            this.tickRespawn();
            return;
        }
        if (this.fight.dragonKilled) return;

        this.resolveDragon();
        if (this.dragon === undefined) return;

        if (this.ticks % CRYSTAL_HEAL_INTERVAL === 0) this.healFromCrystals(this.dragon);
        this.updateBar(this.dragon);
    }

    /**
     * Takes the dragon's death, in Java's `setDragonKilled` order: the bar empties and hides,
     * the podium is re-placed active with end portal blocks filling its ring, one gateway
     * index is spent on a new gateway, the egg lands on a world's first kill, the experience
     * is paid, and the flags flip so no new dragon spawns until a respawn sequence runs.
     *
     * The fight tick after the 200-tick death hold ends calls this, which is the tick after
     * Java's `tickDeath` calls its counterpart.
     */
    public setDragonKilled(dragon: DataEntity): void {
        this.killDragon(deathOf(dragon));
    }

    /**
     * Runs a waiting death's consequences as one unit of the change log, and lets go of the death
     * only once they are done.
     *
     * A consequence that throws takes its writes back with it, the portal blocks and the orbs
     * among them, and the fight's own record is put back as it was before the attempt. The death
     * then still waits, here and in a save, and the next tick takes it again from the start, so
     * a gateway index is not spent twice. Letting go of the death first left a fight with no
     * dragon and no kill, which spawned a second dragon over a portal that was half placed.
     *
     * @returns Whether the death was taken. The fight does nothing else in a tick it was not.
     */
    private takeDeath(died: DragonDeath): boolean {
        const before = structuredClone(this.fight);
        let failure: { readonly error: unknown } | undefined;
        try {
            const outcome = this.world.getEntityStore().unit(() => {
                delete this.fight.dragonDeathPosition;
                this.killDragon(died);
            });
            if (outcome.failed) failure = { error: outcome.error };
        } catch (error: unknown) {
            // With no log tick open the unit runs its work as it is, and a throw arrives here.
            failure = { error };
        }
        if (failure === undefined) {
            this.died = undefined;
            this.deathFailure = undefined;
            return true;
        }

        this.fight = before;
        // Once per failure, not once per tick: the death is tried again every tick until it is taken.
        const message = String(failure.error);
        if (message !== this.deathFailure) this.report(`the dragon's death was not taken and waits: ${message}`);
        this.deathFailure = message;
        return false;
    }

    private killDragon(dragon: DragonDeath): void {
        if (this.fight.dragonUniqueId !== undefined && dragon.persistentIdentity !== this.fight.dragonUniqueId) return;

        const firstKill = !this.fight.previouslyKilled;
        this.dragon = undefined;
        this.fight.dragonUniqueId = undefined;
        this.lastBarPercent = 0;
        this.sent(this.bar.setPercent(0));
        for (const session of this.bar.players()) this.sent(this.bar.removePlayer(session));

        this.placeExitPortal(true);
        this.spawnNewGateway();
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
            this.died = deathOf(entity);
            this.fight.dragonDeathPosition = { ...this.died.position };
        } else if (reason !== 'chunk unload') {
            // Gone without dying or being saved - forget it, so the 1200-tick check spawns anew.
            this.fight.dragonUniqueId = undefined;
        }
    }

    /** Advances the saved 1 + 100 + 10×40 + 100 tick respawn sequence. */
    private tickRespawn(): void {
        const stage = this.fight.respawnStage;
        if (stage === undefined) return;

        if (!this.respawnChunksLoaded) {
            if (!this.arenaLoaded()) return;
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

                // The pillar's chunks are asked for as its beam starts, so they are in by the time
                // it resets. A reset whose chunks are still missing waits, and the clock with it.
                const tickets = this.world.chunkTickets();
                const pillarLoaded = tickets.request(PILLAR_TICKET, spikeChunks(spike));
                if (time % RESPAWN_PILLAR_TICKS === 0) {
                    this.setRespawnCrystalBeam({ x: spike.centerX, y: spike.height + 1, z: spike.centerZ });
                }
                if (time % RESPAWN_PILLAR_TICKS === RESPAWN_PILLAR_TICKS - 1) {
                    if (!pillarLoaded) return;
                    tickets.release(PILLAR_TICKET);
                    this.resetSpike(spike);
                }

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
                if (this.fight.respawnTime >= RESPAWN_SUMMON_TICKS) this.finishRespawn();
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
        for (const entity of this.world.dataEntities().runtime.entities())
            if (
                entity.identifier === CRYSTAL_IDENTIFIER &&
                Math.floor(entity.position.x) === at.x &&
                entity.position.y === at.y &&
                Math.floor(entity.position.z) === at.z
            )
                return entity;
        return undefined;
    }

    /** Whether every saved crystal is present in the loaded entity runtime. */
    private respawnCrystalIdsAreLive(): boolean {
        const liveIds = new Set<string>();
        for (const entity of this.world.dataEntities().runtime.entities())
            if (entity.identifier === CRYSTAL_IDENTIFIER) liveIds.add(entity.persistentIdentity);
        return (
            this.fight.respawnCrystalIds.length === RESPAWN_CRYSTAL_OFFSETS.length &&
            this.fight.respawnCrystalIds.every((id) => liveIds.has(id))
        );
    }

    /** Points the four driving crystals at one position. */
    private setRespawnCrystalBeam(target: { x: number; y: number; z: number }): void {
        const ids = new Set(this.fight.respawnCrystalIds);
        for (const crystal of this.world.dataEntities().runtime.entities()) {
            if (ids.has(crystal.persistentIdentity)) crystal.body.beamTarget = { ...target };
        }
    }

    /** Clears pillar-crystal protection and beams on both completion and abort. */
    private resetPillarCrystalOptions(): void {
        for (const crystal of this.world.dataEntities().runtime.entities()) {
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
        this.world.chunkTickets().release(PILLAR_TICKET);
        this.resetPillarCrystalOptions();
        this.placeExitPortal(true);
    }

    /**
     * Clears one pillar, emits its power-five blast, and rebuilds it with a protected crystal.
     * The caller has checked that the pillar's chunks are loaded.
     */
    private resetSpike(spike: EndSpike): void {
        const minX = spike.centerX - 10;
        const maxX = spike.centerX + 10;
        const minZ = spike.centerZ - 10;
        const maxZ = spike.centerZ + 10;

        const runtime = this.world.dataEntities().runtime;
        // Removed as the walk goes, which the walk allows: a removed entity is not visited again.
        for (const crystal of runtime.entities()) {
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

        explode(this.world, new Vector3(spike.centerX + 0.5, spike.height + 1, spike.centerZ + 0.5), {
            power: 5
        });
        endSpike([spike], true, DRAGON_SPAWN).place(features, new LegacyRandomSource(this.world.getSeed()), {
            x: spike.centerX,
            y: 0,
            z: spike.centerZ
        });
    }

    /** Explodes the four driving crystals without block damage and spawns the next dragon. */
    private finishRespawn(): void {
        const ids = new Set(this.fight.respawnCrystalIds);
        const crystals: DataEntity[] = [];
        for (const entity of this.world.dataEntities().runtime.entities())
            if (ids.has(entity.persistentIdentity)) crystals.push(entity);
        const positions = crystals.map((crystal) => ({ ...crystal.position }));
        for (const crystal of crystals) this.world.dataEntities().runtime.remove(crystal.id, 'respawn complete');

        this.fight.respawnCrystalIds = [];
        delete this.fight.respawnStage;
        this.fight.respawnTime = 0;
        this.respawnChunksLoaded = false;
        this.resetPillarCrystalOptions();

        for (const { x, y, z } of positions)
            explode(this.world, new Vector3(x, y, z), { power: 6, breaksBlocks: false });

        const dragon = this.world.dataEntities().runtime.spawn(DRAGON_IDENTIFIER, { ...DRAGON_SPAWN });
        this.fight.dragonKilled = false;
        if (dragon === undefined) {
            if (!this.reportedMissingDragonType) {
                this.reportedMissingDragonType = true;
                this.report(
                    `no loaded pack declares ${DRAGON_IDENTIFIER}, so the fight has no dragon; the Bedrock vanilla behavior pack is usually missing, which \`pnpm --filter @jsprismarine/bedrock-data run ensure:bedrock-pack\` downloads`
                );
            }
            return;
        }
        this.adopt(dragon);
    }

    /** Puts the bar on the players in the arena and takes it off everyone else. */
    private updatePlayers(): void {
        const near = this.world.getViewers().filter((session) => this.inArena(session.getViewPosition()));
        this.playerNear = near.length > 0;

        if (!this.fight.dragonKilled) for (const session of near) this.sent(this.bar.addPlayer(session));
        for (const session of this.bar.players()) {
            if (this.fight.dragonKilled || !near.includes(session)) this.sent(this.bar.removePlayer(session));
        }
    }

    private inArena(position: Vector3): boolean {
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
    private scanState(): void {
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
            this.adopt(dragon);
            this.fight.dragonKilled = false;
        } else {
            this.fight.dragonKilled = true;
        }
        if (!this.fight.previouslyKilled && dragon === undefined) this.fight.dragonKilled = false;

        this.fight.needsStateScanning = false;
    }

    /**
     * Whether the four chunks the podium search and placement span are loaded. While they are
     * not, the fight holds a ticket on them; once they are, it lets the ticket go, because the
     * players in the arena keep them.
     */
    private arenaLoaded(): boolean {
        const tickets = this.world.chunkTickets();
        if (!tickets.request(ARENA_TICKET, ARENA_CHUNKS)) return false;
        tickets.release(ARENA_TICKET);
        return true;
    }

    /** The chunks a dragon's death writes into: the podium and the egg, and the next gateway. */
    private deathChunks(): ChunkCoordinate[] {
        const gateway = this.nextGatewayOrigin();
        if (gateway === undefined) return [...ARENA_CHUNKS];
        return [...ARENA_CHUNKS, ...chunksOfBlockBox(gateway.x - 1, gateway.z - 1, gateway.x + 1, gateway.z + 1)];
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
     * a later slice, and the blocks are what this kill owes the world. The death waits for the
     * chunks the feature spans ({@link deathChunks}), because nothing else ever loads the ring.
     */
    private spawnNewGateway(): void {
        const origin = this.nextGatewayOrigin();
        if (origin === undefined) return;

        this.fight.gateways.pop();
        endGateway(undefined, false).place(
            fightFeatureWorld(this.world),
            new LegacyRandomSource(this.world.getSeed()),
            origin
        );
    }

    /** Where the next gateway stands: the last index of the shuffled list, on the ring. */
    private nextGatewayOrigin(): { x: number; y: number; z: number } | undefined {
        const index = this.fight.gateways.at(-1);
        if (index === undefined) return undefined;

        const angle = 2 * (-Math.PI + GATEWAY_ANGLE_STEP * index);
        return {
            x: Math.floor(GATEWAY_DISTANCE * Math.cos(angle)),
            y: GATEWAY_Y,
            z: Math.floor(GATEWAY_DISTANCE * Math.sin(angle))
        };
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
    private awardExperience(dragon: DragonDeath, firstKill: boolean): void {
        const xp = firstKill ? FIRST_KILL_EXPERIENCE : REPEAT_KILL_EXPERIENCE;
        const awards = [...Array.from({ length: 10 }, () => Math.floor(xp * 0.08)), Math.floor(xp * 0.2)];
        for (const value of awards) {
            this.world.dataEntities().runtime.spawn(XP_ORB_IDENTIFIER, { ...dragon.position }, { data: { value } });
        }

        const { killerId } = dragon;
        const killer = this.world.getViewers().find((session) => Number(session.runtimeId) === killerId);
        if (killerId === undefined || killer === undefined) return;

        addExperiencePoints(killer.getPlayer().getExperience(), xp);
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
    private resolveDragon(): void {
        if (this.dragon !== undefined) return;

        const live = this.findLiveDragon();
        if (live !== undefined) {
            this.adopt(live);
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
                this.report(
                    `no loaded pack declares ${DRAGON_IDENTIFIER}, so the fight has no dragon; the Bedrock vanilla behavior pack is usually missing, which \`pnpm --filter @jsprismarine/bedrock-data run ensure:bedrock-pack\` downloads`
                );
            }
            return;
        }
        this.adopt(spawned);
    }

    /** The loaded dragon this fight's reference names, or any loaded dragon, Java's `getDragons`. */
    private findLiveDragon(): DataEntity | undefined {
        let first: DataEntity | undefined;
        for (const entity of this.world.dataEntities().runtime.entities()) {
            if (entity.identifier !== DRAGON_IDENTIFIER) continue;
            if (entity.persistentIdentity === this.fight.dragonUniqueId) return entity;
            first ??= entity;
        }
        return first;
    }

    /** The loaded dragon with this persistent identity, if one is loaded. */
    private liveDragonWith(identity: string): DataEntity | undefined {
        for (const entity of this.world.dataEntities().runtime.entities()) {
            if (entity.identifier === DRAGON_IDENTIFIER && entity.persistentIdentity === identity) return entity;
        }
        return undefined;
    }

    private adopt(dragon: DataEntity): void {
        this.dragon = dragon;
        this.fight.dragonUniqueId = dragon.persistentIdentity;
        this.sent(this.bar.setActorUniqueId(this.actorIdOf(dragon)));
    }

    /** The actor id the client tracks the dragon by, which is its runtime id and what the bar binds to. */
    private actorIdOf(dragon: DataEntity): bigint {
        return BigInt(dragon.id);
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
        for (const entity of this.world.dataEntities().runtime.entities()) {
            if (entity.identifier !== CRYSTAL_IDENTIFIER) continue;
            const dx = entity.position.x - dragon.position.x;
            const dy = entity.position.y - dragon.position.y;
            const dz = entity.position.z - dragon.position.z;
            if (dx * dx + dy * dy + dz * dz <= radiusSquared) return true;
        }
        return false;
    }

    /** Follows the dragon's health onto the bar, sending only when the percent moved. */
    private updateBar(dragon: DataEntity): void {
        const health = dragon.instance.attributes.get('health');
        const percent = health === undefined || health.max <= 0 ? 0 : health.current / health.max;
        if (percent === this.lastBarPercent) return;

        this.lastBarPercent = percent;
        this.sent(this.bar.setPercent(percent));
    }

    /** Lets the bar's sends go, which are queued already, and reports one that fails. */
    private sent(sends: Promise<void>): void {
        void sends.catch((error: unknown) => this.report(String(error)));
    }

    private report(message: string): void {
        this.world.getServer().getLogger().warn(`dragon fight: ${message}`, 'world/end/DragonFight');
    }
}
