/**
 * The boss bars entities carry for themselves, Java's `WitherBoss.bossEvent`.
 *
 * Java gives the wither a `ServerBossEvent` and shows it to exactly the players whose clients
 * track the wither: `startSeenByPlayer` adds a player and `stopSeenByPlayer` takes one off, and
 * `customServerAiStep` sets the bar's progress to the wither's health over its maximum every tick.
 * Bedrock writes the bar as `minecraft:boss`. The ender dragon declares it too, but Java's dragon
 * has no bar of its own: `EnderDragonFight` shows its bar to the players in the arena, which
 * `world/end/DragonFight.ts` runs, so this leaves the dragon alone.
 *
 * @javaSee WitherBoss.bossEvent
 */
import type { DataEntity } from './DataEntity';

/** The component Bedrock writes a boss bar as. */
const BOSS = 'minecraft:boss';

/** The entity whose bar is its fight's, not its own. */
const ENDER_DRAGON = 'minecraft:ender_dragon';

/** What one entity's own bar shows. */
export interface OwnBossBar {
    /** How full the bar is, the entity's health over its maximum, 0 to 1. */
    readonly progress: number;
    /** The bar's title: the entity's name tag, or its type's name key. */
    readonly name: string;
}

/**
 * The bar an entity carries for itself, or undefined when it carries none: one that declares
 * `minecraft:boss` and is not the ender dragon.
 */
export const ownBossBarOf = (entity: DataEntity): OwnBossBar | undefined => {
    if (entity.identifier === ENDER_DRAGON || !entity.instance.hasComponent(BOSS)) return undefined;
    const health = entity.instance.attributes.get('health');
    const progress =
        health === undefined || health.max <= 0 ? 0 : Math.min(1, Math.max(0, health.current / health.max));
    const bare = entity.identifier.slice(entity.identifier.indexOf(':') + 1);
    return { progress, name: entity.body.nameTag ?? `entity.${bare}.name` };
};

/** A player who may see a bar, which they do while their client tracks its entity. */
export interface BossBarViewer {
    /**
     * Whether the player's client has the entity, Java's `ChunkMap.TrackedEntity.seenBy`.
     *
     * @javaSee ChunkMap$TrackedEntity.seenBy
     */
    tracks(runtimeId: bigint): boolean;
}

/** One bar on the players' screens. */
export interface ShownBossBar<Viewer> {
    show(viewer: Viewer): void;
    hide(viewer: Viewer): void;
    setProgress(progress: number): void;
    setName(name: string): void;
    /** Takes the bar off every screen it is on, for an entity that is gone. */
    close(): void;
}

/** What the bars keep of one entity's bar. */
interface Tracked<Viewer> {
    readonly bar: ShownBossBar<Viewer>;
    readonly viewers: Set<Viewer>;
    progress: number;
    name: string;
}

/** The own bars of one world's entities, kept in step with who tracks each entity. */
export class EntityBossBars<Viewer extends BossBarViewer> {
    private readonly bars = new Map<number, Tracked<Viewer>>();

    /** @param open - Puts up a new bar for an entity, on nobody's screen yet. */
    public constructor(private readonly open: (entity: DataEntity, shown: OwnBossBar) => ShownBossBar<Viewer>) {}

    /**
     * One tick of every bar: each entity with a bar of its own shows it to the viewers tracking
     * it and to nobody else, at its health, and the bar of an entity that is gone comes down.
     *
     * @param entities - Every entity in the world.
     * @param viewers - Every player in the world.
     */
    public sync(entities: Iterable<DataEntity>, viewers: readonly Viewer[]): void {
        const seen = new Set<number>();
        for (const entity of entities) {
            if (entity.removed !== undefined) continue;
            const shown = ownBossBarOf(entity);
            if (shown === undefined) continue;
            seen.add(entity.id);
            let tracked = this.bars.get(entity.id);
            if (tracked === undefined) {
                tracked = { bar: this.open(entity, shown), viewers: new Set(), ...shown };
                this.bars.set(entity.id, tracked);
            }
            if (tracked.progress !== shown.progress) {
                tracked.progress = shown.progress;
                tracked.bar.setProgress(shown.progress);
            }
            if (tracked.name !== shown.name) {
                tracked.name = shown.name;
                tracked.bar.setName(shown.name);
            }
            const runtimeId = BigInt(entity.id);
            for (const viewer of viewers) {
                const tracking = viewer.tracks(runtimeId);
                if (tracking && !tracked.viewers.has(viewer)) {
                    tracked.viewers.add(viewer);
                    tracked.bar.show(viewer);
                } else if (!tracking && tracked.viewers.has(viewer)) {
                    tracked.viewers.delete(viewer);
                    tracked.bar.hide(viewer);
                }
            }
            // A viewer who left the world entirely is no longer tracking anything.
            for (const viewer of tracked.viewers) {
                if (viewers.includes(viewer)) continue;
                tracked.viewers.delete(viewer);
                tracked.bar.hide(viewer);
            }
        }
        for (const [id, tracked] of this.bars) {
            if (seen.has(id)) continue;
            tracked.bar.close();
            this.bars.delete(id);
        }
    }
}
