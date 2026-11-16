/**
 * Paintings and leash knots, as entities of the store, after Java 26.3's `HangingEntity`.
 *
 * Bedrock's pack has no file for `minecraft:painting` or `minecraft:leash_knot`, both engine
 * entities, so neither could spawn: a painting item placed nothing and a lead used on a fence tied
 * no knot. The entity overlay's definitions supply `jsprismarine:hanging` with the numbers Java
 * runs them by. A hanging entity holds still, and every `check_interval` ticks it asks whether it
 * still survives, as `HangingEntity.tick` does on its `checkInterval`: a painting needs a solid
 * block behind every cell of its face, a knot needs a fence in its own block. One that no longer
 * survives breaks, drops its item and plays its break sound.
 *
 * The ticks it has hung and the way it faces are component state, so every write is logged and an
 * update that throws is undone.
 */
import type { EntityPosition } from '@jsprismarine/entities';
import { isRecord } from '@jsprismarine/entities';
import { defineComponentState, stateField } from '@jsprismarine/entities/componentState';

import type { DataEntity } from './DataEntity';
import { blockPositionOf } from './position';

/** The host component that makes a data entity hang, and holds its numbers. */
export const HANGING_COMPONENT = 'jsprismarine:hanging';

/** The four ways a hanging entity can face, Java's horizontal `Direction`s in 2D-data order. */
const FACINGS = ['south', 'west', 'north', 'east'] as const;

/** One of {@link FACINGS}. */
export type HangingFacing = (typeof FACINGS)[number];

/** The step one block along each facing. */
const STEP: Readonly<Record<HangingFacing, { readonly x: number; readonly z: number }>> = {
    south: { x: 0, z: 1 },
    west: { x: -1, z: 0 },
    north: { x: 0, z: -1 },
    east: { x: 1, z: 0 }
};

/** One hanging entity's state: the ticks it has hung, and the index of its facing in {@link FACINGS}, or -1. */
export const hangingState = defineComponentState(HANGING_COMPONENT, {
    age: stateField.number,
    facing: stateField.number
});

/** The numbers of `jsprismarine:hanging`. */
export interface HangingTuning {
    /** What holds it up: a solid wall behind it, or a fence in its own block. */
    readonly support: 'wall' | 'fence';
    /** How many ticks pass between survival checks; Java's `checkInterval` checks on the tick after 100. */
    readonly checkInterval: number;
    /** The item it drops when it breaks, if any. */
    readonly drop: string | undefined;
    /** The sound it makes when it breaks, if any. */
    readonly breakSound: string | undefined;
}

/**
 * The numbers a hanging entity's definition declares.
 * @throws {TypeError} When the component leaves its support or interval out, which fails the update that asked.
 */
export const hangingTuningOf = (entity: DataEntity): HangingTuning => {
    const params = entity.instance.componentParams(HANGING_COMPONENT);
    if (!isRecord(params)) throw new TypeError(`${entity.identifier} has no ${HANGING_COMPONENT} component`);
    const support = params['support'];
    const checkInterval = params['check_interval'];
    if ((support !== 'wall' && support !== 'fence') || typeof checkInterval !== 'number')
        throw new TypeError(`${HANGING_COMPONENT} needs a support of wall or fence and a check_interval`);
    const drop = params['drop'];
    const breakSound = params['break_sound'];
    return {
        support,
        checkInterval,
        drop: typeof drop === 'string' ? drop : undefined,
        breakSound: typeof breakSound === 'string' ? breakSound : undefined
    };
};

/** Whether a data entity hangs, by this system's rules. */
export const isHangingEntity = (entity: DataEntity): boolean => entity.instance.hasComponent(HANGING_COMPONENT);

/** What a hanging entity needs of the runtime. */
export interface HangingHost {
    /** Whether a block is solid, Java's `BlockState.isSolid`. */
    isSolid(at: EntityPosition): boolean;
    /** Whether a block is one of Java's `minecraft:fences`. */
    isFence(at: EntityPosition): boolean;
    drop(at: EntityPosition, identifier: string): void;
    playSound(at: EntityPosition, sound: string): void;
    remove(id: number, reason: string): void;
}

/** The block a position stands in. */
const cellOf = (at: EntityPosition): EntityPosition => blockPositionOf(at);

/** The size a painting covers, in blocks, from its spawn data; one by one when it names none. */
const sizeOf = (entity: DataEntity): { readonly width: number; readonly height: number } => {
    const width = entity.spawnData?.['width'];
    const height = entity.spawnData?.['height'];
    return {
        width: typeof width === 'number' && width >= 1 ? Math.floor(width) : 1,
        height: typeof height === 'number' && height >= 1 ? Math.floor(height) : 1
    };
};

/** Runs every painting and leash knot in the store. */
export class HangingEntities {
    public constructor(private readonly host: HangingHost) {}

    /** One tick of one hanging entity: a tick older, and on its check, the break when nothing holds it. */
    public update(entity: DataEntity): void {
        const tuning = hangingTuningOf(entity);
        const state = entity.instance.componentState.get(hangingState);
        const facing = state === undefined ? this.facingOf(entity) : state.facing;
        const age = (state?.age ?? 0) + 1;
        entity.instance.componentState.set(hangingState, { age, facing });

        if (age % (tuning.checkInterval + 1) !== 0 || this.survives(entity, tuning, facing)) return;
        this.host.remove(entity.id, 'broken');
        if (tuning.drop !== undefined) this.host.drop(entity.position, tuning.drop);
        if (tuning.breakSound !== undefined) this.host.playSound(entity.position, tuning.breakSound);
    }

    /**
     * The facing a hanging entity was placed with: the `facing` its spawn data names, or else the
     * side of its block that a solid wall is on, nearest the entity first, facing away from it.
     */
    private facingOf(entity: DataEntity): number {
        const named = entity.spawnData?.['facing'];
        const index = FACINGS.findIndex((facing) => facing === named);
        if (index >= 0) return index;
        const cell = cellOf(entity.position);
        const within = { x: entity.position.x - cell.x, z: entity.position.z - cell.z };
        const sides = FACINGS.map((facing, at) => {
            const step = STEP[facing];
            // How far the entity sits from the side of its block the wall would be on.
            const gap = step.x !== 0 ? (step.x > 0 ? within.x : 1 - within.x) : step.z > 0 ? within.z : 1 - within.z;
            return { at, facing, gap };
        }).sort((a, b) => a.gap - b.gap || a.at - b.at);
        const walled = sides.find(({ facing }) => {
            const step = STEP[facing];
            return this.host.isSolid({ x: cell.x - step.x, y: cell.y, z: cell.z - step.z });
        });
        return walled?.at ?? -1;
    }

    /**
     * Java's `survives`: a knot needs a fence in its block; a painting needs a solid block behind
     * each cell of its face, the face centered on its block as `Painting.calculateBoundingBox`
     * centers it.
     */
    private survives(entity: DataEntity, tuning: HangingTuning, facing: number): boolean {
        const cell = cellOf(entity.position);
        if (tuning.support === 'fence') return this.host.isFence(cell);
        const towards = FACINGS[facing];
        if (towards === undefined) return false;
        const step = STEP[towards];
        // Java's counter-clockwise neighbor of the facing, which a painting's width runs along.
        const along = { x: step.z, z: -step.x };
        const { width, height } = sizeOf(entity);
        const left = Math.trunc((width - 1) / -2);
        const down = Math.trunc((height - 1) / -2);
        for (let i = 0; i < width; i += 1)
            for (let j = 0; j < height; j += 1) {
                const wall = {
                    x: cell.x - step.x + along.x * (left + i),
                    y: cell.y + down + j,
                    z: cell.z - step.z + along.z * (left + i)
                };
                if (!this.host.isSolid(wall)) return false;
            }
        return true;
    }
}
