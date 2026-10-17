import type { EntitySpawn } from '../../EntitySpawn';
import type ChunkRandom from '../decoration/ChunkRandom';
import type { BoundingBox, StructureCanvas, TerrainSampler } from './Structure';
import { Facing, blockId, facingStep, opposite, stairsId, torchId } from './StructureBlocks';

/**
 * The buildings a village is made of.
 *
 * Each piece knows its own footprint and how to draw itself, and nothing else - in particular it
 * does not know which chunk is being generated, and must not: see {@link StructureCanvas} for why.
 * A piece is planned once, at a fixed position and height, and then drawn identically into each
 * chunk it overlaps, which is what lets a house straddle a chunk border.
 *
 * Every building levels the ground it stands on. Terrain here is rolling rather than flat, so a
 * house dropped onto it unaltered would have one corner buried and another on stilts. Levelling
 * means both halves of the job: fill from the platform down to wherever the terrain actually is,
 * and clear the air above it.
 */

/** How far below the platform a foundation reaches before giving up on a cliff edge. */
const MAX_FOUNDATION_DEPTH = 12;

/** Headroom cleared above a platform, so a hillside does not bury the building in it. */
const CLEARANCE = 10;

export interface PieceContext {
    canvas: StructureCanvas;
    terrain: TerrainSampler;
}

/** One building, planned. */
export interface VillagePiece {
    readonly bounds: BoundingBox;
    readonly spawns: readonly EntitySpawn[];
    draw(context: PieceContext): void;
}

/**
 * The villager to put in a village.
 *
 * `minecraft:villager_v2`, not `minecraft:villager` - the plain name still resolves, to the legacy
 * villager the server keeps for reading old worlds, which has no behaviour attached to it. A
 * village built out of those would be a village of statues.
 */
const VILLAGER = 'minecraft:villager_v2';

/**
 * Which way a door faces, by name.
 *
 * Doors used to carry a numeric `direction` with its own pre-flattening numbering - east,
 * south, west, north - where beds and the other `direction` blocks counted from south. At
 * 1.26.40 that became `minecraft:cardinal_direction`, a string, and the numbering question
 * went away with it: a door that names the wrong side is now a compile-time typo rather than
 * a door hinged in the wrong plane.
 */
const DOOR_DIRECTION: Readonly<Record<Facing, string>> = {
    [Facing.East]: 'east',
    [Facing.South]: 'south',
    [Facing.West]: 'west',
    [Facing.North]: 'north'
};

/** The materials a village is built from, resolved once per village. */
export interface VillageMaterials {
    planks: number | null;
    log: number | null;
    cobblestone: number | null;
    stairs: (facing: Facing, upsideDown?: boolean) => number | null;
    slab: number | null;
    fence: number | null;
    door: (facing: Facing, upper: boolean) => number | null;
    glass: number | null;
    torch: (side?: Facing) => number | null;
    path: number | null;
    farmland: number | null;
    crop: number | null;
    water: number | null;
    craftingTable: number | null;
    bed: (facing: Facing, head: boolean) => number | null;
    air: number | null;
    dirt: number | null;
}

/** Resolves everything a village builds with. A block this server lacks comes back null. */
export const villageMaterials = (): VillageMaterials => ({
    planks: blockId('minecraft:oak_planks'),
    log: blockId('minecraft:oak_log', { pillar_axis: 'y' }),
    cobblestone: blockId('minecraft:cobblestone'),
    stairs: (facing, upsideDown) => stairsId('minecraft:oak_stairs', facing, upsideDown),
    slab: blockId('minecraft:oak_slab', { 'minecraft:vertical_half': 'bottom' }),
    fence: blockId('minecraft:oak_fence'),
    // Bedrock keeps every wooden door under one name and tells the species apart by the item that
    // placed it, so there is no `minecraft:oak_door` to ask for.
    door: (facing, upper) =>
        blockId('minecraft:wooden_door', {
            'minecraft:cardinal_direction': DOOR_DIRECTION[facing],
            upper_block_bit: upper ? 1 : 0,
            open_bit: 0,
            door_hinge_bit: 0
        }),
    glass: blockId('minecraft:glass_pane'),
    torch: (side) => torchId('minecraft:torch', side),
    path: blockId('minecraft:grass_path'),
    farmland: blockId('minecraft:farmland', { moisturized_amount: 7 }),
    crop: blockId('minecraft:wheat', { growth: 7 }),
    water: blockId('minecraft:water'),
    craftingTable: blockId('minecraft:crafting_table'),
    bed: (facing, head) =>
        blockId('minecraft:bed', { direction: facing, head_piece_bit: head ? 1 : 0, occupied_bit: 0 }),
    air: blockId('minecraft:air'),
    dirt: blockId('minecraft:dirt')
});

/**
 * Levels one column: solid ground up to the platform, open air above it.
 *
 * Both halves matter. Without the fill, a building on a downslope stands on nothing; without the
 * clearing, a building on an upslope is inside the hill.
 */
const levelColumn = (
    { canvas, terrain }: PieceContext,
    x: number,
    z: number,
    platformY: number,
    surface: number | null,
    foundation: number | null,
    air: number | null
): void => {
    const ground = terrain.heightAt(x, z);

    // Down to the terrain, but never sinking an endless shaft off the side of a cliff.
    if (ground < platformY) {
        const deepest = Math.max(platformY - MAX_FOUNDATION_DEPTH, terrain.floor + 1);
        canvas.fill(x, Math.max(ground, deepest), z, x, platformY - 1, z, foundation);
    }

    canvas.set(x, platformY, z, surface);
    canvas.fill(x, platformY + 1, z, x, platformY + CLEARANCE, z, air);
};

/** Levels a whole footprint. */
const levelArea = (
    context: PieceContext,
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    platformY: number,
    surface: number | null,
    foundation: number | null,
    air: number | null
): void => {
    for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
            levelColumn(context, x, z, platformY, surface, foundation, air);
        }
    }
};

/**
 * The village well, which every village is laid out around.
 *
 * Cobblestone basin, four corner posts and a slab roof - the vanilla shape, and usefully tall
 * enough to be seen over the houses when you are looking for the middle of the place.
 */
export class WellPiece implements VillagePiece {
    public readonly bounds: BoundingBox;
    public readonly spawns: readonly EntitySpawn[];

    public constructor(
        private readonly centerX: number,
        private readonly centerZ: number,
        private readonly platformY: number,
        private readonly materials: VillageMaterials
    ) {
        this.bounds = {
            minX: centerX - 2,
            maxX: centerX + 2,
            minZ: centerZ - 2,
            maxZ: centerZ + 2,
            minY: platformY,
            maxY: platformY + 5
        };

        // A couple of villagers stand by the well rather than in a house, so that a village is
        // visibly inhabited the moment you walk into it, and an iron golem guards them.
        this.spawns = [
            { type: VILLAGER, x: centerX + 2.5, y: platformY + 1, z: centerZ + 0.5, yaw: 180 },
            { type: VILLAGER, x: centerX - 1.5, y: platformY + 1, z: centerZ + 0.5, yaw: 0 },
            { type: 'minecraft:iron_golem', x: centerX + 0.5, y: platformY + 1, z: centerZ - 2.5, yaw: 90 }
        ];
    }

    public draw(context: PieceContext): void {
        const { canvas } = context;
        const { cobblestone, planks, slab, water, air } = this.materials;
        const { centerX: cx, centerZ: cz, platformY: y } = this;

        levelArea(context, cx - 2, cz - 2, cx + 2, cz + 2, y, cobblestone, cobblestone, air);

        // A ring of cobblestone one block proud, water inside it.
        canvas.fill(cx - 1, y, cz - 1, cx + 1, y + 1, cz + 1, cobblestone);
        canvas.fill(cx, y, cz, cx, y + 1, cz, water);

        for (const [dx, dz] of [
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1]
        ] as const) {
            canvas.fill(cx + dx, y + 2, cz + dz, cx + dx, y + 3, cz + dz, planks);
        }

        canvas.fill(cx - 1, y + 4, cz - 1, cx + 1, y + 4, cz + 1, slab ?? planks);
    }
}

/**
 * A house.
 *
 * One shape parameterised by its footprint rather than three hand-built variants: the walls, the
 * gabled roof, the windows and the door all follow from the width and the depth, so a village gets
 * variety without three times the code to be wrong in three different ways.
 */
export class HousePiece implements VillagePiece {
    public readonly bounds: BoundingBox;
    public readonly spawns: readonly EntitySpawn[];

    private readonly minX: number;
    private readonly minZ: number;
    private readonly maxX: number;
    private readonly maxZ: number;
    private readonly width: number;
    private readonly depth: number;
    private readonly wallHeight: number;

    public constructor(
        origin: { x: number; z: number },
        width: number,
        depth: number,
        private readonly platformY: number,
        /** The wall the door is in - by construction, the one facing the road. */
        private readonly facing: Facing,
        private readonly materials: VillageMaterials,
        random: ChunkRandom
    ) {
        this.width = width;
        this.depth = depth;
        this.minX = origin.x;
        this.minZ = origin.z;
        this.maxX = origin.x + width - 1;
        this.maxZ = origin.z + depth - 1;
        this.wallHeight = random.chance(0.3) ? 5 : 4;

        // The roof rises half the shorter span above the walls, plus the overhang.
        const roofRise = Math.floor((Math.min(width, depth) + 1) / 2) + 1;
        this.bounds = {
            minX: this.minX - 1,
            maxX: this.maxX + 1,
            minZ: this.minZ - 1,
            maxZ: this.maxZ + 1,
            minY: platformY,
            maxY: platformY + this.wallHeight + roofRise + 1
        };

        this.spawns = [
            {
                type: VILLAGER,
                x: this.minX + width / 2,
                y: platformY + 1,
                z: this.minZ + depth / 2,
                yaw: facing * 90
            }
        ];
    }

    public draw(context: PieceContext): void {
        const { canvas } = context;
        const { planks, log, cobblestone, air, craftingTable, torch } = this.materials;
        const { minX, minZ, maxX, maxZ, platformY: y, wallHeight } = this;

        // A block of apron all round, so a house never appears to stand on a knife edge.
        levelArea(context, minX - 1, minZ - 1, maxX + 1, maxZ + 1, y, cobblestone, cobblestone, air);

        // Floor, then a solid box of walls, then hollow it back out. Building solid and carving is
        // far fewer cases to get wrong than drawing four walls and four corners separately. The
        // top row is left solid, so the room has a ceiling and the roof an attic above it.
        canvas.fill(minX, y, minZ, maxX, y, maxZ, planks);
        canvas.fill(minX, y + 1, minZ, maxX, y + wallHeight, maxZ, planks);
        canvas.fill(minX + 1, y + 1, minZ + 1, maxX - 1, y + wallHeight - 1, maxZ - 1, air);

        // Corner posts, which is what stops a plank box from reading as a plank box.
        for (const [x, z] of [
            [minX, minZ],
            [minX, maxZ],
            [maxX, minZ],
            [maxX, maxZ]
        ] as const) {
            canvas.fill(x, y + 1, z, x, y + wallHeight, z, log);
        }

        this.drawRoof(canvas);
        this.drawWindows(canvas);
        this.drawDoor(canvas);
        this.drawBed(canvas);

        canvas.set(maxX - 1, y + 1, maxZ - 1, craftingTable);
        canvas.set(minX + 1, y + wallHeight - 1, minZ + 1, torch(Facing.South));
    }

    /**
     * A gabled roof of stairs, with the ridge along the building's longer side.
     *
     * Each layer steps one block in from both eaves and one block up, until the two sides meet at
     * the ridge - so the pitch is fixed and the height follows from the span, which is what keeps a
     * 7x5 house and a 5x5 house looking like the same kind of building.
     *
     * The two triangular ends are walled as the roof rises. A gabled roof is two sloping planes and
     * nothing at the ends, so drawing only the slopes leaves a triangular hole at each end that you
     * can see straight through the house from - the attic is hollow, and from the side the building
     * has no top to it. Each layer therefore fills the span between the slopes with air *except* at
     * the end columns, which get walled instead.
     */
    private drawRoof(canvas: StructureCanvas): void {
        const { minX, minZ, maxX, maxZ, platformY: y, wallHeight } = this;
        const { stairs, log, air, planks } = this.materials;

        // The eaves overhang the walls by one block on every side.
        const eaveMinX = minX - 1;
        const eaveMaxX = maxX + 1;
        const eaveMinZ = minZ - 1;
        const eaveMaxZ = maxZ + 1;
        const baseY = y + wallHeight + 1;

        const alongX = this.width >= this.depth;
        const span = alongX ? eaveMaxZ - eaveMinZ : eaveMaxX - eaveMinX;
        const layers = Math.floor(span / 2);

        for (let layer = 0; layer <= layers; layer++) {
            const level = baseY + layer;

            if (alongX) {
                const near = eaveMinZ + layer;
                const far = eaveMaxZ - layer;

                if (near >= far) {
                    canvas.fill(eaveMinX, level, near, eaveMaxX, level, far, log);
                    continue;
                }

                canvas.fill(eaveMinX, level, near, eaveMaxX, level, near, stairs(Facing.South));
                canvas.fill(eaveMinX, level, far, eaveMaxX, level, far, stairs(Facing.North));

                if (near + 1 <= far - 1) {
                    // Hollow between the slopes - which also clears the hillside out of the attic
                    // when the house was levelled into one.
                    canvas.fill(eaveMinX + 1, level, near + 1, eaveMaxX - 1, level, far - 1, air);

                    // The gable ends, which close the triangle at each end of the ridge.
                    canvas.fill(eaveMinX, level, near + 1, eaveMinX, level, far - 1, planks);
                    canvas.fill(eaveMaxX, level, near + 1, eaveMaxX, level, far - 1, planks);
                }
            } else {
                const near = eaveMinX + layer;
                const far = eaveMaxX - layer;

                if (near >= far) {
                    canvas.fill(near, level, eaveMinZ, far, level, eaveMaxZ, log);
                    continue;
                }

                canvas.fill(near, level, eaveMinZ, near, level, eaveMaxZ, stairs(Facing.East));
                canvas.fill(far, level, eaveMinZ, far, level, eaveMaxZ, stairs(Facing.West));

                if (near + 1 <= far - 1) {
                    canvas.fill(near + 1, level, eaveMinZ + 1, far - 1, level, eaveMaxZ - 1, air);

                    canvas.fill(near + 1, level, eaveMinZ, far - 1, level, eaveMinZ, planks);
                    canvas.fill(near + 1, level, eaveMaxZ, far - 1, level, eaveMaxZ, planks);
                }
            }
        }
    }

    /** Where the door goes: the middle of the wall the house faces. */
    private doorPosition(): readonly [number, number] {
        const midX = Math.floor((this.minX + this.maxX) / 2);
        const midZ = Math.floor((this.minZ + this.maxZ) / 2);

        switch (this.facing) {
            case Facing.North:
                return [midX, this.minZ];
            case Facing.South:
                return [midX, this.maxZ];
            case Facing.West:
                return [this.minX, midZ];
            default:
                return [this.maxX, midZ];
        }
    }

    /** The door, with a step of path leading away from it. */
    private drawDoor(canvas: StructureCanvas): void {
        const { platformY: y } = this;
        const { door, air, path } = this.materials;
        const [doorX, doorZ] = this.doorPosition();

        canvas.fill(doorX, y + 1, doorZ, doorX, y + 2, doorZ, air);
        canvas.set(doorX, y + 1, doorZ, door(this.facing, false));
        canvas.set(doorX, y + 2, doorZ, door(this.facing, true));

        const [stepX, stepZ] = facingStep(this.facing);
        canvas.set(doorX + stepX, y, doorZ + stepZ, path);
        canvas.set(doorX + stepX * 2, y, doorZ + stepZ * 2, path);
    }

    /** Windows at eye height, skipping the corners and the doorway. */
    private drawWindows(canvas: StructureCanvas): void {
        const { minX, minZ, maxX, maxZ, platformY: y } = this;
        const { glass } = this.materials;
        const windowY = y + 2;
        const [doorX, doorZ] = this.doorPosition();
        const isDoorway = (x: number, z: number) => x === doorX && z === doorZ;

        for (let x = minX + 1; x <= maxX - 1; x += 2) {
            if (!isDoorway(x, minZ)) canvas.set(x, windowY, minZ, glass);
            if (!isDoorway(x, maxZ)) canvas.set(x, windowY, maxZ, glass);
        }

        for (let z = minZ + 1; z <= maxZ - 1; z += 2) {
            if (!isDoorway(minX, z)) canvas.set(minX, windowY, z, glass);
            if (!isDoorway(maxX, z)) canvas.set(maxX, windowY, z, glass);
        }
    }

    /**
     * A bed against the wall opposite the door.
     *
     * The two halves have to agree: `direction` points from the foot to the head, so the foot is
     * placed one step back along it. A bed whose halves disagree renders as two broken ends.
     */
    private drawBed(canvas: StructureCanvas): void {
        const { minX, minZ, maxX, maxZ, platformY: y } = this;
        const { bed } = this.materials;

        const back = opposite(this.facing);
        const [stepX, stepZ] = facingStep(back);

        const headX = stepX > 0 ? maxX - 1 : minX + 1;
        const headZ = stepZ > 0 ? maxZ - 1 : minZ + 1;

        canvas.set(headX, y + 1, headZ, bed(back, true));
        canvas.set(headX - stepX, y + 1, headZ - stepZ, bed(back, false));
    }
}

/**
 * A ploughed field with a water channel down the middle.
 *
 * Farmland dries out and reverts unless it stays next to water, so the channel is part of the
 * piece rather than decoration on it.
 */
export class FarmPiece implements VillagePiece {
    public readonly bounds: BoundingBox;
    public readonly spawns: readonly EntitySpawn[] = [];

    private readonly minX: number;
    private readonly minZ: number;
    private readonly maxX: number;
    private readonly maxZ: number;

    public constructor(
        origin: { x: number; z: number },
        width: number,
        depth: number,
        private readonly platformY: number,
        private readonly materials: VillageMaterials
    ) {
        this.minX = origin.x;
        this.minZ = origin.z;
        this.maxX = origin.x + width - 1;
        this.maxZ = origin.z + depth - 1;

        this.bounds = {
            minX: this.minX,
            maxX: this.maxX,
            minZ: this.minZ,
            maxZ: this.maxZ,
            minY: platformY,
            maxY: platformY + 2
        };
    }

    public draw(context: PieceContext): void {
        const { canvas } = context;
        const { farmland, crop, water, log, dirt, air } = this.materials;
        const { minX, minZ, maxX, maxZ, platformY: y } = this;

        levelArea(context, minX, minZ, maxX, maxZ, y, dirt, dirt, air);

        // A low kerb of logs, so the field reads as a field and not as a puddle.
        canvas.fill(minX, y, minZ, maxX, y, minZ, log);
        canvas.fill(minX, y, maxZ, maxX, y, maxZ, log);
        canvas.fill(minX, y, minZ, minX, y, maxZ, log);
        canvas.fill(maxX, y, minZ, maxX, y, maxZ, log);

        const midX = Math.floor((minX + maxX) / 2);
        canvas.fill(midX, y, minZ + 1, midX, y, maxZ - 1, water);

        for (let x = minX + 1; x <= maxX - 1; x++) {
            for (let z = minZ + 1; z <= maxZ - 1; z++) {
                if (x === midX) continue;

                canvas.set(x, y, z, farmland);
                canvas.set(x, y + 1, z, crop);
            }
        }
    }
}

/** A fence post with a torch on top, to light the roads. */
export class LampPiece implements VillagePiece {
    public readonly bounds: BoundingBox;
    public readonly spawns: readonly EntitySpawn[] = [];

    public constructor(
        private readonly x: number,
        private readonly z: number,
        private readonly platformY: number,
        private readonly materials: VillageMaterials
    ) {
        this.bounds = { minX: x, maxX: x, minZ: z, maxZ: z, minY: platformY, maxY: platformY + 4 };
    }

    public draw(context: PieceContext): void {
        const { canvas } = context;
        const { fence, torch, cobblestone, air } = this.materials;

        levelColumn(context, this.x, this.z, this.platformY, cobblestone, cobblestone, air);
        canvas.fill(this.x, this.platformY + 1, this.z, this.x, this.platformY + 3, this.z, fence);
        canvas.set(this.x, this.platformY + 4, this.z, torch());
    }
}

/**
 * A street.
 *
 * Unlike the buildings, a road follows the terrain rather than levelling it: a village on a slope
 * should have sloping streets, and flattening them would cut a trench through the place. It only
 * paves ground that is above water, so a village on a shoreline does not get a causeway out to sea.
 */
export class RoadPiece implements VillagePiece {
    public readonly bounds: BoundingBox;
    public readonly spawns: readonly EntitySpawn[] = [];

    public constructor(
        private readonly minX: number,
        private readonly minZ: number,
        private readonly maxX: number,
        private readonly maxZ: number,
        platformY: number,
        private readonly materials: VillageMaterials
    ) {
        this.bounds = {
            minX,
            maxX,
            minZ,
            maxZ,
            // Generous on y: the road tracks the ground, which over its length may be well above or
            // below the village's own platform. Only the horizontal extent is ever tested.
            minY: platformY - 24,
            maxY: platformY + 24
        };
    }

    public draw(context: PieceContext): void {
        const { canvas, terrain } = context;
        const { path, air } = this.materials;

        for (let x = this.minX; x <= this.maxX; x++) {
            for (let z = this.minZ; z <= this.maxZ; z++) {
                const ground = terrain.heightAt(x, z);
                if (ground <= terrain.seaLevel) continue;

                canvas.set(x, ground, z, path);
                canvas.fill(x, ground + 1, z, x, ground + 3, z, air);
            }
        }
    }
}
