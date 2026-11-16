/**
 * Area effect clouds, as an entity of the store, transcribed from Java 26.3's `AreaEffectCloud`.
 *
 * Bedrock's `minecraft:area_effect_cloud` file declares no behavior, so a cloud that the dragon
 * breathed or a lingering potion left did nothing. A cloud's numbers come with its spawn data,
 * the way Java's constructor callers set them: `radius`, `duration`, `wait_time`,
 * `reapplication_delay`, `radius_per_tick`, `potion_duration_scale` and its `effects`.
 *
 * A cloud waits out its `wait_time`, then every fifth tick reaches each living thing whose box
 * crosses its own, half a block tall, and stands within its radius across: an instant effect
 * lands at half strength, a lasting one at its duration scaled down, and the entity is spared
 * until its `reapplication_delay` has passed. The cloud is gone `wait_time` plus `duration`
 * ticks after it appeared, or as soon as a shrinking radius falls under half a block.
 *
 * The age and the list of who was reached are component state, unsaved, because the list holds
 * runtime ids that the next session draws again.
 */
import { isRecord } from '@jsprismarine/entities';
import type { EntityPosition, EntityStatusEffect } from '@jsprismarine/entities';
import { defineComponentState, stateField } from '@jsprismarine/entities/componentState';

import type { DataEntity } from './DataEntity';

/** The type of every area effect cloud. */
export const AREA_EFFECT_CLOUD = 'minecraft:area_effect_cloud';

/** Java's defaults, for a cloud whose spawn named none. */
const DEFAULT_WAIT_TIME = 20;
const DEFAULT_REAPPLICATION_DELAY = 20;
/** How often a cloud reaches for the entities in it, Java's `tickCount % 5`. */
const REACH_INTERVAL = 5;
/** The cloud's height, Java's `EntityDimensions.scalable(radius * 2, 0.5F)`. */
const CLOUD_HEIGHT = 0.5;
/** The smallest radius a cloud keeps; one that shrinks under it is gone. */
const MIN_RADIUS = 0.5;
/** The strength an instant effect lands with from a cloud, Java's `applyInstantenousEffect(..., 0.5)`. */
const INSTANT_STRENGTH = 0.5;
/** The family whose healing and harming Java swaps, `EntityType.isInvertedHealAndHarm`'s undead tag. */
const UNDEAD_FAMILY = 'undead';

const INSTANT_DAMAGE = 'minecraft:instant_damage';
const INSTANT_HEALTH = 'minecraft:instant_health';

/** One cloud's state: its age and who it reached, with the tick each may be reached again. */
const cloudState = defineComponentState(
    'jsprismarine:area_effect_cloud',
    {
        age: stateField.number,
        radius: stateField.number,
        victims: stateField.list(stateField.list(stateField.number))
    },
    { saved: false }
);

/** One effect a cloud carries. */
interface CloudEffect {
    readonly id: string;
    readonly amplifier: number;
    /** Ticks the effect lasts on whoever it reaches; an instant effect has none. */
    readonly duration: number;
}

/** What a cloud was spawned with. */
interface CloudTuning {
    readonly radius: number;
    readonly duration: number;
    readonly waitTime: number;
    readonly reapplicationDelay: number;
    readonly radiusPerTick: number;
    readonly durationScale: number;
    readonly effects: readonly CloudEffect[];
}

const numberOr = (data: Readonly<Record<string, unknown>>, key: string, fallback: number): number => {
    const value = data[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

/** Reads a cloud's numbers from its spawn data. */
const tuningOf = (entity: DataEntity): CloudTuning => {
    const data = entity.spawnData ?? {};
    const effects = Array.isArray(data['effects']) ? data['effects'] : [];
    return {
        radius: numberOr(data, 'radius', 3),
        duration: numberOr(data, 'duration', 600),
        waitTime: numberOr(data, 'wait_time', DEFAULT_WAIT_TIME),
        reapplicationDelay: numberOr(data, 'reapplication_delay', DEFAULT_REAPPLICATION_DELAY),
        radiusPerTick: numberOr(data, 'radius_per_tick', 0),
        durationScale: numberOr(data, 'potion_duration_scale', 1),
        effects: effects.flatMap((effect): CloudEffect[] => {
            if (!isRecord(effect) || typeof effect['id'] !== 'string') return [];
            return [
                {
                    id: effect['id'],
                    amplifier: numberOr(effect, 'amplifier', 0),
                    duration: numberOr(effect, 'duration', 0)
                }
            ];
        })
    };
};

/** Whether a data entity is an area effect cloud this system runs. */
export const isAreaEffectCloud = (entity: DataEntity): boolean => entity.identifier === AREA_EFFECT_CLOUD;

/** What the clouds need of the runtime. */
export interface AreaEffectCloudHost {
    /** The entities whose boxes cross an axis-aligned box. */
    withinBox(min: EntityPosition, max: EntityPosition): readonly DataEntity[];
    /** Hurts an entity, answerable to `sourceId` when there is one. */
    hurt(entity: DataEntity, sourceId: number | undefined, cause: string, amount: number): void;
    /** Heals an entity by its runtime id. */
    heal(id: number, amount: number): void;
    /** Gives an entity a lasting status effect. */
    applyStatusEffect(source: DataEntity, targetId: number, effect: EntityStatusEffect): void;
    remove(id: number, reason: string): void;
}

/** Runs every area effect cloud in the store. */
export class AreaEffectClouds {
    public constructor(private readonly host: AreaEffectCloudHost) {}

    /** One tick of one cloud, Java's `AreaEffectCloud.serverTick`. */
    public update(cloud: DataEntity): void {
        const tuning = tuningOf(cloud);
        const state = cloud.instance.componentState.get(cloudState);
        // Java's `tickCount`, which is 1 on a cloud's first tick.
        const age = (state?.age ?? 0) + 1;
        let radius = state?.radius ?? tuning.radius;
        let victims = state?.victims ?? [];

        if (age >= tuning.waitTime + tuning.duration) {
            this.host.remove(cloud.id, 'discarded');
            return;
        }
        if (age >= tuning.waitTime) {
            radius += tuning.radiusPerTick;
            if (radius < MIN_RADIUS) {
                this.host.remove(cloud.id, 'discarded');
                return;
            }
            if (age % REACH_INTERVAL === 0) victims = this.reach(cloud, tuning, radius, age, victims);
        }
        cloud.instance.componentState.set(cloudState, { age, radius, victims });
    }

    /** Applies the cloud's effects to whoever stands in it and was not reached too recently. */
    private reach(
        cloud: DataEntity,
        tuning: CloudTuning,
        radius: number,
        age: number,
        victims: readonly (readonly number[])[]
    ): readonly (readonly number[])[] {
        const kept = victims.filter(([, until]) => until !== undefined && age < until);
        if (tuning.effects.length === 0) return [];
        const at = cloud.position;
        const reached = this.host.withinBox(
            { x: at.x - radius, y: at.y, z: at.z - radius },
            { x: at.x + radius, y: at.y + CLOUD_HEIGHT, z: at.z + radius }
        );
        const next = [...kept];
        for (const target of reached) {
            if (target.id === cloud.id || target.id === cloud.body.owner) continue;
            if (target.instance.attributes.get('health') === undefined) continue;
            if (next.some(([id]) => id === target.id)) continue;
            if ((target.position.x - at.x) ** 2 + (target.position.z - at.z) ** 2 > radius * radius) continue;
            next.push([target.id, age + tuning.reapplicationDelay]);
            for (const effect of tuning.effects) this.apply(cloud, target, effect, tuning.durationScale);
        }
        return next;
    }

    /**
     * One effect on one entity: Java's `HealOrHarmMobEffect.applyInstantenousEffect` for the
     * instant two, which swaps for the undead, and the scaled duration for the rest.
     */
    private apply(cloud: DataEntity, target: DataEntity, effect: CloudEffect, scale: number): void {
        const instant = effect.id === INSTANT_DAMAGE || effect.id === INSTANT_HEALTH;
        if (!instant) {
            this.host.applyStatusEffect(cloud, target.id, {
                id: effect.id,
                durationTicks: Math.floor(effect.duration * scale),
                amplifier: effect.amplifier
            });
            return;
        }
        const undead = target.instance.families().includes(UNDEAD_FAMILY);
        if ((effect.id === INSTANT_DAMAGE) === undead) {
            this.host.heal(target.id, Math.floor(INSTANT_STRENGTH * (4 << effect.amplifier) + 0.5));
        } else {
            this.host.hurt(
                target,
                cloud.body.owner ?? cloud.id,
                'magic',
                Math.floor(INSTANT_STRENGTH * (6 << effect.amplifier) + 0.5)
            );
        }
    }
}
