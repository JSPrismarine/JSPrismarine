/**
 * The evoker's fangs, as an entity of the store, transcribed from Java 26.3's `EvokerFangs`.
 *
 * Bedrock has no entity file for `minecraft:evocation_fang`, so the evoker's
 * `minecraft:behavior.summon_entity` had nothing to spawn and its fang spell did nothing. The
 * entity overlay's built-in definition supplies the type and its numbers, in
 * `jsprismarine:evoker_fangs`. A set of fangs waits out its warm-up, bites once, and is gone: Java
 * counts `warmupDelay` down, bites every living thing in its box the tick the count reaches -8,
 * and discards itself once `lifeTicks`, 22, runs out past the warm-up.
 *
 * The ticks it has lived are component state, so every write is logged and an update that throws
 * is undone. The definition is transient, as a bite that lasts a second is not worth a record.
 */
import type { EntityPosition } from '@jsprismarine/entities';
import { isRecord } from '@jsprismarine/entities';
import { defineComponentState, stateField } from '@jsprismarine/entities/componentState';

import type { DataEntity } from './DataEntity';
import { PrismarineEntityErrors } from '@jsprismarine/errors/prismarine/entity';

/** The type of every set of evoker fangs. */
export const EVOKER_FANGS = 'minecraft:evocation_fang';

/** The host component that makes a data entity a set of evoker fangs, and holds its numbers. */
export const EVOKER_FANGS_COMPONENT = 'jsprismarine:evoker_fangs';

/** The family an evoker counts as allies: Java's `Evoker.isAlliedTo` spares the `illager` tag. */
const ALLIED_FAMILY = 'illager';

/** One set of fangs' state: how many ticks it has lived. */
export const fangsState = defineComponentState(EVOKER_FANGS_COMPONENT, { age: stateField.number });

/** The numbers of `jsprismarine:evoker_fangs`. */
export interface FangsTuning {
    /** Ticks before the fangs start, Java's `warmupDelay` when the spell names none. */
    readonly warmup: number;
    /** Ticks past the warm-up the bite lands on; Java bites when `warmupDelay` reaches -8. */
    readonly biteDelay: number;
    /** Ticks past the warm-up the fangs last, Java's `lifeTicks`. */
    readonly lifetime: number;
    /** What the bite takes from each living thing it reaches. */
    readonly damage: number;
    /** How far past the fangs' own box the bite reaches sideways; Java inflates it by 0.2. */
    readonly reach: number;
    /** The fangs' box, which the bite starts from. */
    readonly width: number;
    readonly height: number;
}

const tunings = new WeakMap<object, FangsTuning>();

/**
 * The numbers a set of fangs' definition declares.
 * @throws {TypeError} When the component leaves a number out, which fails the update that asked.
 */
export const fangsTuningOf = (entity: DataEntity): FangsTuning => {
    const params = entity.instance.componentParams(EVOKER_FANGS_COMPONENT);
    if (!isRecord(params))
        throw new PrismarineEntityErrors.MissingItemComponent({
            identifier: entity.identifier,
            itemComponent: EVOKER_FANGS_COMPONENT
        });
    const cached = tunings.get(params);
    if (cached !== undefined) return cached;

    const number = (key: string): number => {
        const value = params[key];
        if (typeof value !== 'number')
            throw new PrismarineEntityErrors.ItemComponentFieldNotNumber({
                itemComponent: EVOKER_FANGS_COMPONENT,
                key
            });
        return value;
    };
    const read: FangsTuning = {
        warmup: number('warmup'),
        biteDelay: number('bite_delay'),
        lifetime: number('lifetime'),
        damage: number('damage'),
        reach: number('reach'),
        width: entity.facts.box.width,
        height: entity.facts.box.height
    };
    tunings.set(params, read);
    return read;
};

/**
 * How long one set of fangs waits before it rises: the `warmup` its spell spawned it with, as
 * Java's `EvokerAttackSpellGoal` gives each fang of a line one tick more than the one before it,
 * or the component's when the spell named none.
 */
const warmupOf = (entity: DataEntity, tuning: FangsTuning): number => {
    const given = entity.spawnData?.['warmup'];
    return typeof given === 'number' && Number.isInteger(given) && given >= 0 ? given : tuning.warmup;
};

/** Whether a data entity is a set of evoker fangs this system runs. */
export const isEvokerFangs = (entity: DataEntity): boolean => entity.instance.hasComponent(EVOKER_FANGS_COMPONENT);

/** What the fangs need of the runtime. */
export interface EvokerFangsHost {
    /** The entities whose boxes cross an axis-aligned box. */
    withinBox(min: EntityPosition, max: EntityPosition): readonly DataEntity[];
    /** Hurts an entity, answerable to `sourceId` when there is one. */
    hurt(entity: DataEntity, sourceId: number | undefined, cause: string, amount: number): void;
    /** One entity by runtime id. */
    byId(id: number): DataEntity | undefined;
    remove(id: number, reason: string): void;
}

/** Runs every set of evoker fangs in the store. */
export class EvokerFangs {
    public constructor(private readonly host: EvokerFangsHost) {}

    /**
     * One tick of one set of fangs: a tick older, the bite on the tick Java's lands, and the
     * discard once the lifetime past the warm-up has run out.
     */
    public update(entity: DataEntity): void {
        const tuning = fangsTuningOf(entity);
        const age = (entity.instance.componentState.get(fangsState)?.age ?? 0) + 1;
        entity.instance.componentState.set(fangsState, { age });

        const past = age - warmupOf(entity, tuning);
        if (past === tuning.biteDelay) this.bite(entity, tuning);
        if (past > tuning.lifetime) this.host.remove(entity.id, 'discarded');
    }

    /** Hurts every living thing in the fangs' box but the evoker that cast them and its allies. */
    private bite(fangs: DataEntity, tuning: FangsTuning): void {
        const at = fangs.position;
        const half = tuning.width / 2 + tuning.reach;
        const caster = fangs.body.owner === undefined ? undefined : this.host.byId(fangs.body.owner);
        const reached = this.host.withinBox(
            { x: at.x - half, y: at.y, z: at.z - half },
            { x: at.x + half, y: at.y + tuning.height, z: at.z + half }
        );
        for (const target of reached) {
            if (target.id === fangs.id || target.instance.attributes.get('health') === undefined) continue;
            if (caster !== undefined && (target.id === caster.id || target.instance.families().includes(ALLIED_FAMILY)))
                continue;
            this.host.hurt(target, caster?.id, 'magic', tuning.damage);
        }
    }
}
