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
import type { PaintingVariant } from './paintings';
import { bedrockPaintingMotif, paintingState, variantArea } from './paintings';
import { blockPositionOf } from './position';
import { PrismarineEntityErrors } from '@jsprismarine/errors/prismarine/entity';

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

/** The logged field a hanging entity's state is written as, which holds its facing. */
export const HANGING_STATE_FIELD = `component:${hangingState.component}`;

/** What a client is shown of a painting, `AddPaintingPacket`'s fields. */
export interface PaintingSight {
    /** The center of the painting's face, where Java's painting stands. */
    readonly position: EntityPosition;
    /** The way it faces, Java's 2D data value: south 0, west 1, north 2, east 3. */
    readonly direction: number;
    /** The name the client draws the picture by. */
    readonly motif: string;
}

/**
 * A painting as a client is shown it, for a reader of the change log.
 *
 * Java's `Painting.calculateBoundingBox` centers a face of even width half a block along the
 * facing's counter-clockwise neighbor, and one of even height half a block up, from the block
 * the painting hangs in.
 * @param at - Where the painting stands, which {@link HangingEntities.place} put on its block.
 * @param picture - The logged painting state.
 * @param hanging - The logged hanging state.
 * @returns The sight, or undefined for a painting whose picture or facing is not logged.
 */
export const paintingSightOf = (at: EntityPosition, picture: unknown, hanging: unknown): PaintingSight | undefined => {
    if (!paintingState.is(picture) || !hangingState.is(hanging)) return undefined;
    const towards = FACINGS[hanging.facing];
    if (towards === undefined) return undefined;
    const step = STEP[towards];
    const across = picture.width % 2 === 0 ? 0.5 : 0;
    return {
        position: {
            x: at.x + step.z * across,
            y: at.y + (picture.height % 2 === 0 ? 0.5 : 0),
            z: at.z - step.x * across
        },
        direction: hanging.facing,
        motif: bedrockPaintingMotif(picture.assetId)
    };
};

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
    if (!isRecord(params))
        throw new PrismarineEntityErrors.MissingItemComponent({
            identifier: entity.identifier,
            itemComponent: HANGING_COMPONENT
        });
    const support = params['support'];
    const checkInterval = params['check_interval'];
    if ((support !== 'wall' && support !== 'fence') || typeof checkInterval !== 'number')
        throw new PrismarineEntityErrors.InvalidHangingComponent({ hangingComponent: HANGING_COMPONENT });
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
    /** Whether nothing solid fills a block, so a painting's face can hang in it. */
    isOpen(at: EntityPosition): boolean;
    drop(at: EntityPosition, identifier: string): void;
    playSound(at: EntityPosition, sound: string): void;
    remove(id: number, reason: string): void;
    /** Java's `random.nextInt(bound)`. */
    randomInt(bound: number): number;
}

/** How far a painting hangs out from the center of its block toward its wall, Java's 0.46875. */
const WALL_OFFSET = 0.46875;

/** The block a position stands in. */
const cellOf = (at: EntityPosition): EntityPosition => blockPositionOf(at);

/** The size a painting covers, in blocks: its picture's, else its spawn data's, else one by one. */
const sizeOf = (entity: DataEntity): { readonly width: number; readonly height: number } => {
    const picture = entity.instance.componentState.get(paintingState);
    if (picture !== undefined) return { width: picture.width, height: picture.height };
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
     * Hangs a painting freshly placed, Java's `Painting.create`: of the variants, the ones that
     * survive on this wall facing this way, then of those the ones with the largest area, then
     * one of those at random. The painting moves to where Java's hangs, against its wall.
     * @returns False when nothing hangs here, so the painting must not be placed; true for an
     *   entity that is no painting or already shows a picture.
     */
    public place(entity: DataEntity, variants: readonly PaintingVariant[]): boolean {
        if (hangingTuningOf(entity).support !== 'wall') return true;
        if (entity.instance.componentState.get(paintingState) !== undefined) return true;
        const facing = this.facingOf(entity);
        const towards = FACINGS[facing];
        if (towards === undefined) return false;
        const cell = cellOf(entity.position);
        const fitting = variants.filter((variant) => this.fits(cell, facing, variant));
        const largest = Math.max(0, ...fitting.map(variantArea));
        const candidates = fitting.filter((variant) => variantArea(variant) === largest);
        const chosen = candidates[this.host.randomInt(candidates.length)];
        if (chosen === undefined) return false;

        entity.instance.componentState.set(paintingState, {
            variant: chosen.id,
            assetId: chosen.assetId,
            width: chosen.width,
            height: chosen.height
        });
        entity.instance.componentState.set(hangingState, { age: 0, facing });
        const step = STEP[towards];
        entity.position = {
            x: cell.x + 0.5 - step.x * WALL_OFFSET,
            y: cell.y + 0.5,
            z: cell.z + 0.5 - step.z * WALL_OFFSET
        };
        return true;
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
        return this.wallHolds(cell, facing, sizeOf(entity));
    }

    /**
     * Whether a painting of a size could be placed here, Java's `survives` on a new painting:
     * its wall holds it and nothing solid fills the blocks its face covers.
     */
    private fits(
        cell: EntityPosition,
        facing: number,
        size: { readonly width: number; readonly height: number }
    ): boolean {
        return (
            this.wallHolds(cell, facing, size) &&
            this.cellsOf(cell, facing, size, 0).every((face) => this.host.isOpen(face))
        );
    }

    /** Whether a solid block stands behind each block of a painting's face. */
    private wallHolds(
        cell: EntityPosition,
        facing: number,
        size: { readonly width: number; readonly height: number }
    ): boolean {
        return this.cellsOf(cell, facing, size, 1).every((wall) => this.host.isSolid(wall));
    }

    /**
     * The blocks a painting's face covers, or with `behind` 1 the wall blocks behind them, the
     * face centered on its block as `Painting.calculateBoundingBox` centers it: Java's
     * counter-clockwise neighbor of the facing is the way its width runs.
     */
    private cellsOf(
        cell: EntityPosition,
        facing: number,
        size: { readonly width: number; readonly height: number },
        behind: 0 | 1
    ): EntityPosition[] {
        const towards = FACINGS[facing];
        if (towards === undefined) return [];
        const step = STEP[towards];
        const along = { x: step.z, z: -step.x };
        const left = Math.trunc((size.width - 1) / -2);
        const down = Math.trunc((size.height - 1) / -2);
        const cells: EntityPosition[] = [];
        for (let i = 0; i < size.width; i += 1)
            for (let j = 0; j < size.height; j += 1)
                cells.push({
                    x: cell.x - step.x * behind + along.x * (left + i),
                    y: cell.y + down + j,
                    z: cell.z - step.z * behind + along.z * (left + i)
                });
        return cells;
    }
}
