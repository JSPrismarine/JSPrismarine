/**
 * Java 26.3's village raids, kept by the world that owns the village.
 *
 * A raid starts when a player carrying Bad Omen stands in a village: the omen is spent, a short
 * countdown runs, and waves of raiders spawn around the village center one after another, each
 * only once the last is dead. Killing the last wave wins the raid and gives the players near the
 * village Hero of the Village; a village that stops being one, or a raid that outlasts its time,
 * ends it. Everything the manager knows about the world comes through {@link RaidHost}, so it
 * can be driven and tested without one.
 *
 * The numbers are Java's `Raid`: three, five or seven waves by difficulty and one more when the
 * omen is stronger than level one, the per-wave raider table, the bonus raiders a harder
 * difficulty adds, 48000 ticks before a raid gives up, and a ten second celebration after a win.
 */

/** A position in the world, in blocks. */
export interface RaidPosition {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** What a raid is doing. */
export type RaidStatus = 'ongoing' | 'victory' | 'loss' | 'stopped';

/** One raid, as it is kept and saved. */
export interface RaidRecord {
    readonly id: number;
    readonly center: RaidPosition;
    status: RaidStatus;
    /** The Bad Omen level the players brought, at most five. */
    omenLevel: number;
    /** How many waves have spawned. */
    groupsSpawned: number;
    /** How many waves the difficulty calls for, before a bonus wave. */
    readonly numGroups: number;
    ticksActive: number;
    /** Ticks until the next wave spawns, counted only while no raider lives. */
    waveCountdown: number;
    /** Ticks of celebration left once the raid is won. */
    celebrationTicks: number;
    /** The persistent identities of the raiders still to be accounted for. */
    raiders: string[];
}

/** A player the manager may start a raid for. */
export interface RaidParticipant {
    readonly id: number;
    readonly position: RaidPosition;
    /** The Bad Omen level the player carries, or zero. */
    readonly badOmenLevel: number;
    /** Spends the player's Bad Omen. */
    clearBadOmen(): void;
    /** Gives the player Hero of the Village at an amplifier for a number of ticks. */
    grantHero(amplifier: number, ticks: number): void;
}

/** Everything the manager needs of the world around it. */
export interface RaidHost {
    /** The difficulty as the protocol numbers it: 0 peaceful, 1 easy, 2 normal, 3 hard. */
    difficulty(): number;
    /** A draw in `[0, 1)`. */
    random(): number;
    /** The players in the dimension who are not spectators. */
    players(): readonly RaidParticipant[];
    /** The center of the village a position stands in, or undefined when it is not in one. */
    villageCenterAt(at: RaidPosition): RaidPosition | undefined;
    /** Whether a position is still in a village. */
    isVillage(at: RaidPosition): boolean;
    /** The y a raider stands on at a column, or undefined when it is not loaded. */
    surfaceAt(x: number, z: number): number | undefined;
    /** Spawns a raider and returns its persistent identity, or undefined when it could not be. */
    spawnRaider(type: string, at: RaidPosition): string | undefined;
    /** Whether a spawned raider is still alive in the world. */
    raiderAlive(identity: string): boolean;
}

/** The raiders a wave holds, in Java's order, and how many of each by wave number. */
const RAIDER_TABLE: readonly (readonly [string, readonly number[]])[] = [
    ['minecraft:vindicator', [0, 0, 2, 0, 1, 4, 2, 5]],
    ['minecraft:evoker', [0, 0, 0, 0, 0, 1, 1, 2]],
    ['minecraft:pillager', [0, 4, 3, 3, 4, 4, 4, 2]],
    ['minecraft:witch', [0, 0, 0, 0, 3, 0, 0, 1]],
    ['minecraft:ravager', [0, 0, 0, 1, 0, 1, 0, 2]]
];

/** Java's `Raid.MAX_OMEN_LEVEL`. */
const MAX_OMEN_LEVEL = 5;
/** Ticks between a raid starting and its first wave, and between a cleared wave and the next. */
const WAVE_COUNTDOWN_TICKS = 300;
/** Java's `Raid.MAX_TICKS_ACTIVE`: a raid this old is given up on. */
const MAX_TICKS_ACTIVE = 48_000;
/** How long raiders stay on after a win, Java's `Raid.CELEBRATION_TICKS`. */
const CELEBRATION_TICKS = 200;
/** How far from a raid's center a player counts as taking part. */
const PARTICIPANT_RADIUS = 96;
/** How far out from the center the raiders appear. */
const SPAWN_DISTANCE = 40;
/** How long Hero of the Village lasts, Java's 48000 ticks. */
const HERO_TICKS = 48_000;
/** How many ticks pass between looks for a player who has brought an omen. */
const START_CHECK_INTERVAL = 20;

/** Java's `Raid.getNumGroups`: three waves on easy, five on normal, seven on hard. */
export const wavesFor = (difficulty: number): number => (difficulty <= 1 ? 3 : difficulty === 2 ? 5 : 7);

const distanceSquared = (a: RaidPosition, b: RaidPosition): number =>
    (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

/** Java's `Raid.getPotentialBonusSpawns`: the extra raiders a harder difficulty draws for a wave. */
const bonusSpawns = (
    type: string,
    wave: number,
    difficulty: number,
    bonusWave: boolean,
    random: () => number
): number => {
    const easy = difficulty <= 1;
    let top: number;
    switch (type) {
        case 'minecraft:witch':
            if (easy || wave <= 2 || wave === 4) return 0;
            top = 1;
            break;
        case 'minecraft:pillager':
        case 'minecraft:vindicator':
            top = difficulty >= 3 ? 2 : 1;
            break;
        case 'minecraft:ravager':
            top = !easy && bonusWave ? 1 : 0;
            break;
        default:
            return 0;
    }
    return top > 0 ? Math.floor(random() * (top + 1)) : 0;
};

/**
 * The raids of one dimension.
 *
 * Owned by the world, ticked with it, and saved with the level.
 */
export class RaidManager {
    private readonly raids = new Map<number, RaidRecord>();
    private nextId = 1;
    private ticks = 0;

    public constructor(
        private readonly host: RaidHost,
        saved: readonly RaidRecord[] = []
    ) {
        for (const raid of saved) {
            this.raids.set(raid.id, { ...raid, center: { ...raid.center }, raiders: [...raid.raiders] });
            this.nextId = Math.max(this.nextId, raid.id + 1);
        }
    }

    /** Every raid still running or celebrating, for the save. */
    public records(): RaidRecord[] {
        return [...this.raids.values()].map((raid) => ({
            ...raid,
            center: { ...raid.center },
            raiders: [...raid.raiders]
        }));
    }

    /** The raid whose village a position is in, if one is running. */
    public raidAt(at: RaidPosition): RaidRecord | undefined {
        let nearest: RaidRecord | undefined;
        let nearestDistance = PARTICIPANT_RADIUS * PARTICIPANT_RADIUS;
        for (const raid of this.raids.values()) {
            const distance = distanceSquared(raid.center, at);
            if (distance < nearestDistance) {
                nearest = raid;
                nearestDistance = distance;
            }
        }
        return nearest;
    }

    /** Advances every raid by a tick, and looks for a player who has brought an omen to a village. */
    public tick(): void {
        this.ticks += 1;
        if (this.ticks % START_CHECK_INTERVAL === 0) this.startRaids();

        for (const raid of this.raids.values()) {
            if (raid.status === 'ongoing') this.advance(raid);
            else if (raid.status === 'victory' && --raid.celebrationTicks <= 0) raid.status = 'stopped';
        }
        for (const [id, raid] of this.raids) {
            if (raid.status === 'stopped' || raid.status === 'loss') this.raids.delete(id);
        }
    }

    /**
     * Java's `RaidManager.createOrExtendRaid`: a player with Bad Omen in a village starts a raid
     * there, or makes the one already running there harder.
     */
    private startRaids(): void {
        if (this.host.difficulty() <= 0) return;

        for (const player of this.host.players()) {
            if (player.badOmenLevel <= 0) continue;
            const center = this.host.villageCenterAt(player.position);
            if (center === undefined) continue;

            let raid = this.raidAt(center);
            if (raid === undefined) {
                const difficulty = this.host.difficulty();
                raid = {
                    id: this.nextId++,
                    center,
                    status: 'ongoing',
                    omenLevel: 0,
                    groupsSpawned: 0,
                    numGroups: wavesFor(difficulty),
                    ticksActive: 0,
                    waveCountdown: WAVE_COUNTDOWN_TICKS,
                    celebrationTicks: 0,
                    raiders: []
                };
                this.raids.set(raid.id, raid);
            }
            if (raid.status !== 'ongoing') continue;
            // A raid that has begun cannot be made harder than Java allows.
            if (raid.groupsSpawned > 0 && raid.omenLevel >= MAX_OMEN_LEVEL) continue;

            raid.omenLevel = Math.min(MAX_OMEN_LEVEL, raid.omenLevel + player.badOmenLevel);
            player.clearBadOmen();
        }
    }

    private totalWaves(raid: RaidRecord): number {
        return raid.numGroups + (raid.omenLevel > 1 ? 1 : 0);
    }

    private advance(raid: RaidRecord): void {
        if (this.host.difficulty() <= 0) {
            raid.status = 'stopped';
            return;
        }
        if (!this.host.isVillage(raid.center)) {
            // A village that is gone with raiders already sent is a village that fell.
            raid.status = raid.groupsSpawned > 0 ? 'loss' : 'stopped';
            return;
        }
        raid.ticksActive += 1;
        if (raid.ticksActive >= MAX_TICKS_ACTIVE) {
            raid.status = 'stopped';
            return;
        }
        // Nobody is left to defend it, and nobody to watch it.
        if (!this.host.players().some((p) => distanceSquared(p.position, raid.center) < PARTICIPANT_RADIUS ** 2)) {
            raid.status = 'stopped';
            return;
        }

        raid.raiders = raid.raiders.filter((identity) => this.host.raiderAlive(identity));
        if (raid.raiders.length > 0) return;

        if (raid.groupsSpawned >= this.totalWaves(raid)) {
            this.win(raid);
            return;
        }
        if (raid.waveCountdown > 0) {
            raid.waveCountdown -= 1;
            return;
        }
        this.spawnWave(raid);
        raid.waveCountdown = WAVE_COUNTDOWN_TICKS;
    }

    private win(raid: RaidRecord): void {
        raid.status = 'victory';
        raid.celebrationTicks = CELEBRATION_TICKS;
        for (const player of this.host.players()) {
            if (distanceSquared(player.position, raid.center) >= PARTICIPANT_RADIUS ** 2) continue;
            player.grantHero(Math.max(0, raid.omenLevel - 1), HERO_TICKS);
        }
    }

    /** Java's `Raid.spawnGroup`: every kind of raider the wave's row of the table asks for. */
    private spawnWave(raid: RaidRecord): void {
        const wave = raid.groupsSpawned + 1;
        const difficulty = this.host.difficulty();
        const bonusWave = raid.omenLevel > 1 && wave === raid.numGroups + 1;

        for (const [type, perWave] of RAIDER_TABLE) {
            const base = (bonusWave ? perWave[raid.numGroups] : perWave[wave]) ?? 0;
            const count = base + bonusSpawns(type, wave, difficulty, bonusWave, () => this.host.random());
            for (let n = 0; n < count; n += 1) {
                const at = this.spawnPosition(raid);
                const identity = this.host.spawnRaider(type, at);
                if (identity !== undefined) raid.raiders.push(identity);
            }
        }
        raid.groupsSpawned = wave;
    }

    /** A spot on the ground a good way out from the village, which is where raiders arrive from. */
    private spawnPosition(raid: RaidRecord): RaidPosition {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const angle = this.host.random() * Math.PI * 2;
            const x = Math.floor(raid.center.x + Math.cos(angle) * SPAWN_DISTANCE);
            const z = Math.floor(raid.center.z + Math.sin(angle) * SPAWN_DISTANCE);
            const y = this.host.surfaceAt(x, z);
            if (y !== undefined) return { x: x + 0.5, y, z: z + 0.5 };
        }
        return raid.center;
    }
}
