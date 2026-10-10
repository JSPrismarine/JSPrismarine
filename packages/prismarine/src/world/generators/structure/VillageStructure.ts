import type { EntitySpawn } from '../../EntitySpawn';
import type ChunkRandom from '../decoration/ChunkRandom';
import type {
    BoundingBox,
    Structure,
    StructureCanvas,
    StructureOrigin,
    StructurePlan,
    TerrainSampler
} from './Structure';
import { overlapsHorizontally } from './Structure';
import StructurePlacement from './StructurePlacement';
import { Facing, facingStep } from './StructureBlocks';
import type { PieceContext, VillageMaterials, VillagePiece } from './VillagePieces';
import { FarmPiece, HousePiece, LampPiece, RoadPiece, WellPiece, villageMaterials } from './VillagePieces';

/** How far the streets run from the well, in blocks. */
const ROAD_LENGTH = 32;

/** The streets are this many blocks wide, centred on the axis. */
const ROAD_HALF_WIDTH = 1;

/** How far a building sits back from the middle of the road it faces. */
const SETBACK = 4;

/**
 * Where along each arm a building may stand.
 *
 * The first ring is well clear of the crossroads: a building close to the middle of one arm sits
 * squarely in the way of one on the arm beside it, and the overlap test then throws away half of
 * them. Starting further out costs a little density near the well and gains far more of it overall.
 */
const BUILDING_DISTANCES = [11, 18, 25, 32] as const;

/**
 * How far each arm's slots are pushed along, so the four arms do not all put a building at the same
 * distance from the crossroads and clash at the diagonals.
 */
const ARM_STAGGER = 3;

/** Chance a slot gets a building at all, which is what keeps villages from looking stamped out. */
const OCCUPANCY = 0.8;

/** Of the slots that are built on, how many are fields rather than houses. */
const FARM_SHARE = 0.28;

/** A footprint, as the width and depth of a building's walls. */
type Footprint = readonly [number, number];

const HOUSE_SIZES: readonly Footprint[] = [
    [5, 5],
    [7, 5],
    [5, 7],
    [7, 7],
    [9, 7]
];

const FARM_SIZES: readonly Footprint[] = [
    [7, 7],
    [9, 7],
    [7, 9]
];

/** How far out the site is sampled when deciding whether it will take a village. */
const SITE_RADIUS = 18;

/**
 * How much height a village will tolerate across its footprint.
 *
 * Buildings level the ground they stand on, so some slope is expected - this is about refusing
 * sites where levelling would mean a village on a plinth quarried out of a mountainside. Measured
 * against the terrain rather than picked: the median relief over a village-sized patch of this
 * world is about 15 blocks, so a limit much below that rejects nearly every site and a limit far
 * above it accepts cliffs.
 */
const MAX_RELIEF = 16;

/**
 * How far a single building's platform may stray from the village's own level.
 *
 * Loose enough that a village drapes over a rise rather than being cut into it, tight enough that
 * it still reads as one place. Bounded on the other side by how deep a foundation and how much
 * headroom a building will dig for itself - see `VillagePieces`.
 */
const MAX_STEP = 6;

/**
 * Villages are spread on this grid; see {@link StructurePlacement}.
 *
 * Roughly a third of the sites offered pass the terrain test, so one village per eighteen chunks of
 * grid works out at a village every four hundred to five hundred blocks - about where vanilla puts
 * them, which is close enough to walk between and far enough that they stay worth finding.
 */
const PLACEMENT = new StructurePlacement({ spacing: 18, separation: 6, salt: 0x5e11a6e });

/**
 * A village: a well, streets running out from it, and houses and fields along them.
 *
 * The layout is worked out entirely from the village's origin and the world seed - never from the
 * chunk being generated - because the same plan has to be produced independently by each of the
 * dozen or so chunks the village covers. Anything that varied between them would show up as a
 * house with two different roofs, or half a road.
 *
 * Slots are offered in a fixed order and taken if the terrain and the neighbours allow it, so the
 * randomness decides what a village looks like without deciding whether the pieces fit.
 */
export class VillageStructure implements Structure {
    public readonly name = 'village';

    /** The streets, plus the deepest building that can stand at the end of one, plus slack. */
    public readonly reach = ROAD_LENGTH + SETBACK + 12;

    public readonly placement = PLACEMENT;

    public plan(origin: StructureOrigin, random: ChunkRandom, terrain: TerrainSampler): StructurePlan | null {
        const center = terrain.heightAt(origin.x, origin.z);

        // On land, and not on the beach: a village half in the sea is worse than no village.
        if (center <= terrain.seaLevel + 2) return null;
        if (!this.groundIsUsable(origin, terrain)) return null;

        const materials = villageMaterials();
        const pieces: VillagePiece[] = [];

        this.addRoads(pieces, origin, center, materials);
        pieces.push(new WellPiece(origin.x, origin.z, center, materials));

        this.addBuildings(pieces, origin, center, materials, random, terrain);
        this.addLamps(pieces, origin, center, materials, terrain);

        return new VillagePlan(pieces);
    }

    /** Rejects sites where levelling would mean quarrying the hillside away. */
    private groundIsUsable(origin: StructureOrigin, terrain: TerrainSampler): boolean {
        let lowest = Number.POSITIVE_INFINITY;
        let highest = Number.NEGATIVE_INFINITY;
        let underwater = 0;
        let sampled = 0;

        // A coarse grid over the built-up part - not the full length of the streets, which follow
        // the ground anyway and so have no opinion about how rugged it is.
        for (let dx = -SITE_RADIUS; dx <= SITE_RADIUS; dx += 6) {
            for (let dz = -SITE_RADIUS; dz <= SITE_RADIUS; dz += 6) {
                const height = terrain.heightAt(origin.x + dx, origin.z + dz);
                lowest = Math.min(lowest, height);
                highest = Math.max(highest, height);
                if (height <= terrain.seaLevel) underwater++;
                sampled++;
            }
        }

        // A little shoreline is picturesque; a village mostly in a lake is not.
        return highest - lowest <= MAX_RELIEF && underwater <= sampled * 0.2;
    }

    private addRoads(
        pieces: VillagePiece[],
        origin: StructureOrigin,
        platformY: number,
        materials: VillageMaterials
    ): void {
        pieces.push(
            new RoadPiece(
                origin.x - ROAD_LENGTH,
                origin.z - ROAD_HALF_WIDTH,
                origin.x + ROAD_LENGTH,
                origin.z + ROAD_HALF_WIDTH,
                platformY,
                materials
            ),
            new RoadPiece(
                origin.x - ROAD_HALF_WIDTH,
                origin.z - ROAD_LENGTH,
                origin.x + ROAD_HALF_WIDTH,
                origin.z + ROAD_LENGTH,
                platformY,
                materials
            )
        );
    }

    /**
     * Fills the slots along the four street arms.
     *
     * A slot is a position and a direction to face; what goes in it - house, field or nothing - and
     * how big it is come from the village's own random generator, so two villages on the same seed
     * differ while one village is the same from every chunk that draws it.
     */
    private addBuildings(
        pieces: VillagePiece[],
        origin: StructureOrigin,
        villageY: number,
        materials: VillageMaterials,
        random: ChunkRandom,
        terrain: TerrainSampler
    ): void {
        // Everything already placed, the well and roads included, so nothing is built on the street
        // or through the well.
        const taken: BoundingBox[] = pieces.map((piece) => piece.bounds);

        for (const arm of [Facing.North, Facing.East, Facing.South, Facing.West]) {
            const [alongX, alongZ] = facingStep(arm);

            // The side of the street a building stands on is the arm's perpendicular.
            const across: Facing = ((arm + 1) % 4) as Facing;
            const [acrossX, acrossZ] = facingStep(across);

            for (const spacing of BUILDING_DISTANCES) {
                const distance = spacing + (arm % 2) * ARM_STAGGER;

                for (const side of [-1, 1] as const) {
                    if (!random.chance(OCCUPANCY)) continue;

                    const farm = random.chance(FARM_SHARE);
                    const [width, depth] = random.pick(farm ? FARM_SIZES : HOUSE_SIZES);

                    // Along the arm by `distance`, then out to one side of it far enough to clear
                    // the road. How far out depends on the building's extent *across* the street,
                    // which is its width beside a north-south street and its depth beside an
                    // east-west one - they are not interchangeable.
                    const halfAcross = acrossX !== 0 ? Math.floor(width / 2) : Math.floor(depth / 2);
                    const offset = SETBACK + halfAcross;

                    const centerX = origin.x + alongX * distance + acrossX * side * offset;
                    const centerZ = origin.z + alongZ * distance + acrossZ * side * offset;

                    const corner = { x: centerX - Math.floor(width / 2), z: centerZ - Math.floor(depth / 2) };

                    // The building faces back across the street it was offset from.
                    const facing = side === 1 ? (((across + 2) % 4) as Facing) : across;
                    const platformY = this.platformFor(corner, width, depth, villageY, terrain);
                    if (platformY === null) continue;

                    const piece = farm
                        ? new FarmPiece(corner, width, depth, platformY, materials)
                        : new HousePiece(corner, width, depth, platformY, facing, materials, random);

                    if (taken.some((box) => overlapsHorizontally(box, piece.bounds, 1))) continue;

                    taken.push(piece.bounds);
                    pieces.push(piece);
                }
            }
        }
    }

    /**
     * The height a building stands at, or null if the site will not take one.
     *
     * The platform is the average of the footprint's corners, so a building on a gentle slope sits
     * halfway into it rather than perching on the high corner. It is then held within a few blocks
     * of the village's own level, which is what keeps a village on a hillside reading as one place
     * rather than as houses scattered down a slope.
     */
    private platformFor(
        corner: { x: number; z: number },
        width: number,
        depth: number,
        villageY: number,
        terrain: TerrainSampler
    ): number | null {
        const corners = [
            terrain.heightAt(corner.x, corner.z),
            terrain.heightAt(corner.x + width - 1, corner.z),
            terrain.heightAt(corner.x, corner.z + depth - 1),
            terrain.heightAt(corner.x + width - 1, corner.z + depth - 1)
        ];

        const lowest = Math.min(...corners);
        if (lowest <= terrain.seaLevel) return null;

        const average = Math.round(corners.reduce((sum, height) => sum + height, 0) / corners.length);
        return Math.min(Math.max(average, villageY - MAX_STEP), villageY + MAX_STEP);
    }

    /** Lamp posts down the streets, on the corners where the arms leave the well. */
    private addLamps(
        pieces: VillagePiece[],
        origin: StructureOrigin,
        villageY: number,
        materials: VillageMaterials,
        terrain: TerrainSampler
    ): void {
        for (const arm of [Facing.North, Facing.East, Facing.South, Facing.West]) {
            const [alongX, alongZ] = facingStep(arm);

            for (const distance of [12, 22]) {
                const x = origin.x + alongX * distance + alongZ * (ROAD_HALF_WIDTH + 1);
                const z = origin.z + alongZ * distance - alongX * (ROAD_HALF_WIDTH + 1);

                const ground = terrain.heightAt(x, z);
                if (ground <= terrain.seaLevel) continue;

                pieces.push(
                    new LampPiece(x, z, Math.min(Math.max(ground, villageY - MAX_STEP), villageY + MAX_STEP), materials)
                );
            }
        }
    }
}

/** A planned village: its pieces, their combined extent, and the mobs that live in it. */
class VillagePlan implements StructurePlan {
    public readonly bounds: BoundingBox;
    public readonly spawns: readonly EntitySpawn[];

    public constructor(private readonly pieces: readonly VillagePiece[]) {
        this.bounds = pieces.reduce<BoundingBox>(
            (box, piece) => ({
                minX: Math.min(box.minX, piece.bounds.minX),
                minY: Math.min(box.minY, piece.bounds.minY),
                minZ: Math.min(box.minZ, piece.bounds.minZ),
                maxX: Math.max(box.maxX, piece.bounds.maxX),
                maxY: Math.max(box.maxY, piece.bounds.maxY),
                maxZ: Math.max(box.maxZ, piece.bounds.maxZ)
            }),
            {
                minX: Number.POSITIVE_INFINITY,
                minY: Number.POSITIVE_INFINITY,
                minZ: Number.POSITIVE_INFINITY,
                maxX: Number.NEGATIVE_INFINITY,
                maxY: Number.NEGATIVE_INFINITY,
                maxZ: Number.NEGATIVE_INFINITY
            }
        );

        this.spawns = pieces.flatMap((piece) => [...piece.spawns]);
    }

    /** Drawn in plan order: roads, then the well, then the buildings that stand beside them. */
    public draw(canvas: StructureCanvas, terrain: TerrainSampler): void {
        const context: PieceContext = { canvas, terrain };
        for (const piece of this.pieces) piece.draw(context);
    }
}

export default VillageStructure;
