import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { defaultBdsCacheFolder } from '@jsprismarine/bedrock-data/sources';
import { packJson } from '@jsprismarine/loot';
import { hangingState, paintingSightOf } from '@jsprismarine/prismarine/entity/data/hangingEntities';
import { bedrockPaintingMotif, paintingState } from '@jsprismarine/prismarine/entity/data/paintings';
import { FLOOR_Y } from '@jsprismarine/prismarine/entity/data/testing';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { loadVanillaDatapack } from '../javaDatapack.ts';
import { FETCH_CACHE, REFERENCES } from '../references.ts';
import { stage, tickStage } from './stage.ts';
import type { StagedEntity } from './stage.ts';
import type { EntitySubject } from './subjects.ts';
import { mappedEntity } from './subjects.ts';

/**
 * The engine entities: the ones Bedrock runs from engine code rather than from a definition,
 * which the server either carries a built-in definition for or does not run at all.
 */

/** One blow the stage saw land on an entity. */
interface StageBlow {
    readonly tick: number;
    readonly target: number;
    readonly cause: string;
    readonly amount: number;
    readonly attacker: number | undefined;
}

/**
 * Ticks the stage `ticks` times and reports every blow and the first tick `watched` was gone.
 *
 * @param hold - Runs before each tick, to keep a target where the scenario put it.
 */
const run = (
    ticks: number,
    watched: number,
    hold: () => void = () => undefined
): { readonly blows: readonly StageBlow[]; readonly goneAt: number | undefined } => {
    const { runtime, world } = stage();
    const blows: StageBlow[] = [];
    let goneAt: number | undefined;
    let read = world.commits.length;
    for (let tick = 1; tick <= ticks; tick += 1) {
        hold();
        tickStage();
        for (const commit of world.commits.slice(read))
            blows.push({
                tick,
                target: commit.target.id,
                cause: commit.intent.cause,
                amount: commit.intent.amount,
                attacker: commit.intent.attacker
            });
        read = world.commits.length;
        if (goneAt === undefined && runtime.byId(watched) === undefined) goneAt = tick;
    }
    return { blows, goneAt };
};

/** Removes whatever a scenario spawned and is still standing. */
const clear = (...entities: readonly (StagedEntity | undefined)[]): void => {
    const { runtime } = stage();
    for (const entity of entities)
        if (entity !== undefined && runtime.byId(entity.id) !== undefined)
            runtime.remove(entity.id, 'parity scenario complete');
};

/** Java's `FallingBlockEntity` numbers: gravity before the move, drag after it. */
const FALLING = { gravity: 0.04, drag: 0.98 } as const;

/**
 * Where Java's falling block stands after each tick of a drop from rest at `startY` onto a floor
 * whose top is `floorTop`, until the tick it lands, which is the last entry.
 */
const javaFall = (startY: number, floorTop: number): readonly number[] => {
    const heights: number[] = [];
    let y = startY;
    let velocity = 0;
    for (let tick = 0; tick < 600; tick += 1) {
        velocity -= FALLING.gravity;
        if (y + velocity <= floorTop) {
            heights.push(floorTop);
            return heights;
        }
        y += velocity;
        heights.push(y);
        velocity *= FALLING.drag;
    }
    return heights;
};

/** A column on the stage's floor no other scenario uses, by its x. */
const column = (x: number): { readonly x: number; readonly z: number } => ({ x: 3200 + x, z: 0 });

/** The falling block scenario's checks, each a sentence when the server differs. */
const fallingBlockDifferences = (bedrock: string): readonly string[] => {
    const { runtime, world } = stage();
    const differences: string[] = [];
    const floorTop = FLOOR_Y + 1;

    // A drop of sand onto the stone floor: Java's trajectory, tick for tick, and the block it becomes.
    {
        const { x, z } = column(0);
        const startY = floorTop + 10;
        const sand = runtime.spawn(
            bedrock,
            { x: x + 0.5, y: startY, z: z + 0.5 },
            { data: { block: 'minecraft:sand' } }
        );
        if (sand === undefined) return [`the server would not spawn ${bedrock} with a block of sand`];
        const java = javaFall(startY, floorTop);
        const server: number[] = [];
        for (let tick = 0; tick < java.length + 5 && runtime.byId(sand.id) !== undefined; tick += 1) {
            tickStage();
            if (runtime.byId(sand.id) !== undefined) server.push(sand.position.y);
        }
        clear(sand);
        const flight = java.slice(0, -1);
        const drift = flight.findIndex((height, tick) => Math.abs((server[tick] ?? Number.NaN) - height) > 1e-9);
        if (drift >= 0)
            differences.push(
                `after ${drift + 1} ticks of falling it stands at ${String(server[drift])}, where Java's stands at ${flight[drift]}`
            );
        else if (server.length !== flight.length)
            differences.push(`it lands after ${server.length + 1} ticks, where Java's lands after ${java.length}`);
        const placed = world.world.blocks.get({ x, y: floorTop, z })?.identifier;
        if (placed !== 'minecraft:sand') differences.push(`it lands as ${String(placed)}, where Java's lands as sand`);
    }

    // Onto a torch, which Java's `minecraft:replaceable` tag does not hold: the sand breaks into
    // its item and the torch stays.
    {
        const { x, z } = column(2);
        world.setBlock({ x, y: floorTop, z }, 'minecraft:torch');
        const drops = world.drops.length;
        const sand = runtime.spawn(
            bedrock,
            { x: x + 0.5, y: floorTop + 3, z: z + 0.5 },
            { data: { block: 'minecraft:sand' } }
        );
        run(40, sand?.id ?? -1);
        clear(sand);
        const left = world.world.blocks.get({ x, y: floorTop, z })?.identifier;
        const dropped = world.drops.slice(drops).map((drop) => drop.item.identifier);
        if (left !== 'minecraft:torch' || !dropped.includes('minecraft:sand'))
            differences.push(
                `sand landing on a torch leaves ${String(left)} and drops ${dropped.join(', ') || 'nothing'}, where Java's leaves the torch and drops the sand`
            );
    }

    // An anvil dropped five blocks onto a pig: `AnvilBlock.falling` sets 2 per block fallen past
    // the first, at most 40, so the pig takes 8.
    {
        const { x, z } = column(4);
        const at = { x: x + 0.5, y: floorTop, z: z + 0.5 };
        const pig = runtime.spawn('minecraft:pig', at);
        const anvil = runtime.spawn(bedrock, { ...at, y: floorTop + 5 }, { data: { block: 'minecraft:anvil' } });
        const { blows } = run(40, anvil?.id ?? -1, () => {
            if (pig !== undefined) pig.body.position = at;
        });
        clear(pig, anvil);
        const onPig = blows.filter((blow) => blow.target === pig?.id);
        if (onPig.length !== 1 || onPig[0]?.amount !== 8 || onPig[0]?.cause !== 'anvil')
            differences.push(
                `an anvil falling five blocks onto a pig deals ${onPig.map((blow) => `${blow.amount} ${blow.cause}`).join(', ') || 'nothing'}, where Java's deals 8 anvil damage`
            );
    }

    return differences;
};

/** What Java's fangs do to a pig standing on them, cast by an evoker standing there too. */
const fangsDifferences = (bedrock: string): readonly string[] => {
    const { runtime } = stage();
    const { x, z } = column(8);
    const at = { x: x + 0.5, y: FLOOR_Y + 1, z: z + 0.5 };
    const evoker = runtime.spawn('minecraft:evocation_illager', at);
    const pig = runtime.spawn('minecraft:pig', at);
    const fangs = runtime.spawn(bedrock, at, evoker === undefined ? {} : { ownerId: evoker.id });
    if (fangs === undefined || pig === undefined || evoker === undefined) {
        clear(evoker, pig, fangs);
        return [`the server would not spawn ${bedrock}`];
    }
    const { blows, goneAt } = run(30, fangs.id, () => {
        pig.body.position = at;
        evoker.body.position = at;
    });
    clear(evoker, pig, fangs);

    const differences: string[] = [];
    const bites = blows.filter((blow) => blow.target === pig.id);
    const [bite] = bites;
    if (
        bites.length !== 1 ||
        bite?.tick !== 8 ||
        bite.amount !== 6 ||
        bite.cause !== 'magic' ||
        bite.attacker !== evoker.id
    )
        differences.push(
            `the pig takes ${bites.map((blow) => `${blow.amount} ${blow.cause} at tick ${blow.tick}`).join(', ') || 'nothing'}, where Java's fangs bite it once, for 6 magic damage from the evoker, at tick 8`
        );
    if (blows.some((blow) => blow.target === evoker.id)) differences.push('the fangs bite the evoker that cast them');
    if (goneAt !== 23) differences.push(`the fangs leave at tick ${String(goneAt)}, where Java's leave at tick 23`);
    return differences;
};

/**
 * How long a hanging entity may stand without its support before Java checks: `HangingEntity.tick`
 * runs `survives` every 100 ticks.
 */
const HANGING_CHECK_TICKS = 100;

/** A painting or leash knot whose support goes: Java's breaks within one check, and a painting drops its item. */
const hangingDifferences = (javaId: string, bedrock: string): readonly string[] => {
    const { runtime, world } = stage();
    const { x, z } = column(javaId === 'minecraft:painting' ? 12 : 14);
    const support = { x, y: FLOOR_Y + 2, z };
    world.setBlock(support, javaId === 'minecraft:painting' ? 'minecraft:stone' : 'minecraft:oak_fence');
    const at = { x: x + 0.5, y: FLOOR_Y + 2, z: javaId === 'minecraft:painting' ? z + 1.03 : z + 0.5 };
    const hanging = runtime.spawn(bedrock, at);
    if (hanging === undefined) return [`the server would not spawn ${bedrock}, so nothing hangs`];

    const drops = world.drops.length;
    world.setBlock(support, 'minecraft:air');
    const { goneAt } = run(HANGING_CHECK_TICKS + 1, hanging.id);
    clear(hanging);
    const dropped = world.drops.slice(drops).map((drop) => drop.item.identifier);
    const differences: string[] = [];
    if (goneAt === undefined)
        differences.push(
            `it hangs on for ${HANGING_CHECK_TICKS + 1} ticks with nothing to hang from, where Java's breaks`
        );
    if (javaId === 'minecraft:painting' && !dropped.includes('minecraft:painting'))
        differences.push(`it drops ${dropped.join(', ') || 'nothing'}, where Java's drops a painting`);
    return differences;
};

/** One Java painting variant: its id, texture and size, from the vanilla datapack. */
interface JavaPainting {
    readonly id: string;
    readonly assetId: string;
    readonly width: number;
    readonly height: number;
}

let javaPaintings: readonly JavaPainting[] | undefined;

/** The variants Java's `minecraft:placeable` tag holds, read from the vanilla datapack's files. */
const placeableJavaPaintings = (): readonly JavaPainting[] => {
    if (javaPaintings !== undefined) return javaPaintings;
    const { definitions } = loadVanillaDatapack();
    const tag = packJson(definitions.tags.get('painting_variant/minecraft:placeable'));
    const ids =
        typeof tag === 'object' && tag !== null && 'values' in tag && Array.isArray(tag.values) ? tag.values : [];
    javaPaintings = ids.flatMap((id): JavaPainting[] => {
        if (typeof id !== 'string') return [];
        const file = packJson(definitions.paintingVariants.get(id));
        if (typeof file !== 'object' || file === null) return [];
        const {
            asset_id: assetId,
            width,
            height
        } = { asset_id: undefined, width: undefined, height: undefined, ...file };
        return typeof assetId === 'string' && typeof width === 'number' && typeof height === 'number'
            ? [{ id, assetId, width, height }]
            : [];
    });
    return javaPaintings;
};

/**
 * The blocks a Java painting of one size covers along one axis, counted from the block it hangs
 * in: `Painting.calculateBoundingBox` centers the face on that block, half a block further along
 * for an even size.
 */
const javaCovered = (size: number): readonly number[] => {
    const center = 0.5 + (size % 2 === 0 ? 0.5 : 0);
    const covered: number[] = [];
    for (let block = Math.floor(center - size / 2); block < Math.ceil(center + size / 2); block += 1)
        covered.push(block);
    return covered;
};

/**
 * Walls a painting is placed on facing south, from the block in front of one: its width and
 * height in blocks, and where in it the painting's block is, counted from its lower west corner.
 */
const PAINTING_WALLS: readonly (readonly [width: number, height: number, across: number, up: number])[] = [
    [0, 0, 0, 0],
    [1, 1, 0, 0],
    [2, 1, 0, 0],
    [2, 1, 1, 0],
    [3, 3, 1, 1],
    [4, 2, 1, 0],
    [4, 3, 1, 1],
    [4, 4, 1, 1],
    [4, 4, 2, 2]
];

/** Placing a painting from the item against each wall: Java's `Painting.create` against the server's. */
const paintingPlacementDifferences = (bedrock: string): readonly string[] => {
    const { runtime, world } = stage();
    const javaVariants = placeableJavaPaintings();
    if (javaVariants.length === 0) return ["Java's placeable painting variants could not be read"];
    const differences: string[] = [];
    for (const [index, [width, height, across, up]] of PAINTING_WALLS.entries()) {
        const { x } = column(20 + index * 6);
        const bottom = FLOOR_Y + 3;
        const wall = (block: string): void => {
            for (let dx = 0; dx < width; dx += 1)
                for (let dy = 0; dy < height; dy += 1) world.setBlock({ x: x + dx, y: bottom + dy, z: 0 }, block);
        };
        wall('minecraft:stone');
        const fits = javaVariants.filter(
            (variant) =>
                javaCovered(variant.width).every((dx) => across + dx >= 0 && across + dx < width) &&
                javaCovered(variant.height).every((dy) => up + dy >= 0 && up + dy < height)
        );
        const largest = Math.max(0, ...fits.map((variant) => variant.width * variant.height));
        const expected = fits.filter((variant) => variant.width * variant.height === largest);
        const cell = { x: x + across, y: bottom + up, z: 1 };
        const painting = runtime.spawn(
            bedrock,
            { x: cell.x + 0.5, y: cell.y, z: cell.z + 0.5 },
            { data: { facing: 'south' } }
        );
        const picture = painting?.instance.componentState.get(paintingState);
        const sight =
            painting === undefined
                ? undefined
                : paintingSightOf(painting.position, picture, painting.instance.componentState.get(hangingState));
        clear(painting);
        wall('minecraft:air');

        const on = `on a ${width} by ${height} wall`;
        if (expected.length === 0) {
            if (painting !== undefined)
                differences.push(`it hangs ${picture?.variant ?? 'a painting'} ${on}, where Java's places none`);
            continue;
        }
        const chosen = expected.find((variant) => variant.id === picture?.variant);
        if (chosen === undefined) {
            differences.push(
                `it hangs ${picture?.variant ?? 'nothing'} ${on}, where Java's hangs one of ${expected.map((variant) => variant.id).join(', ')}`
            );
            continue;
        }
        // Java's painting stands at the center of its face: half a block in front of the wall,
        // shifted east and up by half a block for an even width or height.
        const center = {
            x: cell.x + 0.5 + (chosen.width % 2 === 0 ? 0.5 : 0),
            y: cell.y + 0.5 + (chosen.height % 2 === 0 ? 0.5 : 0),
            z: cell.z + 0.5 - 0.46875
        };
        const off =
            sight === undefined
                ? Number.POSITIVE_INFINITY
                : Math.hypot(sight.position.x - center.x, sight.position.y - center.y, sight.position.z - center.z);
        if (sight?.direction !== 0 || off > 1e-9)
            differences.push(
                `a client is shown ${chosen.id} ${on} at ${JSON.stringify(sight?.position)} facing ${String(sight?.direction)}, where Java's stands at ${JSON.stringify(center)} facing south (0)`
            );
    }
    return differences;
};

/** Whether a byte is an ASCII letter or digit. */
const isWordByte = (byte: number | undefined): boolean =>
    byte !== undefined &&
    ((byte >= 0x30 && byte <= 0x39) || (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a));

/** Whether a byte is a lower-case ASCII letter or a digit, which would carry a name on. */
const continuesName = (byte: number | undefined): boolean =>
    byte !== undefined && ((byte >= 0x30 && byte <= 0x39) || (byte >= 0x61 && byte <= 0x7a));

/**
 * The names a Bedrock client knows a painting by: the files of its resource pack's
 * `textures/painting/`, and the tile names the pinned dedicated server carries for the paintings
 * drawn from the `kz` atlas, which it holds as strings or, at eight letters or fewer, inlined in
 * its instructions.
 */
const bedrockPaintingNames = (): {
    readonly textures: ReadonlySet<string>;
    readonly inServer: (name: string) => boolean;
} => {
    const checkout = REFERENCES.bedrockBehaviorPack.locate();
    if (checkout === undefined) throw new Error('the vanilla Bedrock packs are not in the fetch cache');
    const folder = join(checkout, 'resource_pack', 'textures', 'painting');
    const textures = new Set(
        readdirSync(folder)
            .filter((name) => name.endsWith('.png'))
            .map((name) => name.slice(0, -'.png'.length))
    );
    let bytes: Buffer | undefined;
    return {
        textures,
        // The dedicated server binary, read once and only when a motif is not a texture file: the
        // name standing on its own, not inside a longer word.
        inServer: (name) => {
            if (bytes === undefined) {
                // The default server's binary: the cache keeps every version it fetched.
                const binary = join(FETCH_CACHE, 'bds', defaultBdsCacheFolder, 'unpacked', 'bedrock_server');
                if (!existsSync(binary))
                    throw new Error('the pinned Bedrock Dedicated Server is not in the fetch cache');
                bytes = readFileSync(binary);
            }
            const needle = Buffer.from(name, 'latin1');
            for (let at = bytes.indexOf(needle); at >= 0; at = bytes.indexOf(needle, at + 1))
                if (!isWordByte(bytes[at - 1]) && !continuesName(bytes[at + needle.length])) return true;
            return false;
        }
    };
};

/** Every placeable painting's motif, against the names a Bedrock client draws. */
const paintingMotifDifferences = (): readonly string[] => {
    const names = bedrockPaintingNames();
    const unknown = placeableJavaPaintings()
        .map((variant) => ({ variant, motif: bedrockPaintingMotif(variant.assetId) }))
        .filter(({ motif }) => !names.textures.has(motif) && !names.inServer(motif));
    const ownTextures = placeableJavaPaintings().filter((variant) =>
        names.textures.has(variant.assetId.replace('minecraft:', ''))
    );
    const misnamed = ownTextures.filter(
        (variant) => bedrockPaintingMotif(variant.assetId) !== variant.assetId.replace('minecraft:', '')
    );
    return [
        ...unknown.map(({ variant, motif }) => `${variant.id} is sent as ${motif}, which no Bedrock painting is named`),
        ...misnamed.map(
            (variant) =>
                `${variant.id} is sent as ${bedrockPaintingMotif(variant.assetId)}, where Bedrock names its own texture ${variant.assetId.replace('minecraft:', '')}`
        )
    ];
};

/** Java's `OminousItemSpawner` lets its item go within 120 ticks and is gone. */
const OMINOUS_SPAWN_TICKS = 120;

/** An ominous item spawner holding an arrow: Java's releases the arrow and leaves. */
const ominousDifferences = (bedrock: string): readonly string[] => {
    const { runtime } = stage();
    const { x, z } = column(16);
    const spawner = runtime.spawn(
        bedrock,
        { x: x + 0.5, y: FLOOR_Y + 4, z: z + 0.5 },
        { data: { item: { name: 'minecraft:arrow', count: 1 } } }
    );
    if (spawner === undefined) return [`the server would not spawn ${bedrock}`];
    const before = new Set([...runtime.entities()].map((entity) => entity.id));
    const { goneAt } = run(OMINOUS_SPAWN_TICKS + 1, spawner.id);
    const released = [...runtime.entities()].filter((entity) => !before.has(entity.id));
    clear(spawner, ...released);
    if (goneAt === undefined || released.length === 0)
        return [
            `it holds its arrow for ${OMINOUS_SPAWN_TICKS + 1} ticks and stays, where Java's lets the item go within ${OMINOUS_SPAWN_TICKS} and leaves`
        ];
    return [];
};

/** The engine entities, each against the Java class that runs it. */
export const engineScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'falling-block',
        java: "A falling block falls by Java's gravity and drag, takes the place of a replaceable block it lands in or breaks into its item, and an anvil hurts what it lands on.",
        reference:
            'Java FallingBlockEntity.tick (gravity 0.04 before the move, drag 0.98 after), FallingBlockEntity.causeFallDamage, BlockState.canBeReplaced (the minecraft:replaceable tag) and AnvilBlock.falling (setHurtsEntities 2, 40)',
        subjects: () => ['minecraft:falling_block'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['jsprismarine:falling_block'],
        run: (subject) => {
            const differences = fallingBlockDifferences(subject.bedrock);
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'evoker-fangs',
        java: 'Evoker fangs bite every living thing on them but their evoker once, for 6, eight ticks after they rise, and are gone at tick 23.',
        reference:
            'Java EvokerFangs.tick (warmupDelay, the bite at -8, lifeTicks 22) and EvokerFangs.dealDamageTo (6 indirect magic damage, sparing the owner and its allies)',
        subjects: () => ['minecraft:evoker_fangs'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['jsprismarine:evoker_fangs'],
        run: (subject) => {
            const differences = fangsDifferences(subject.bedrock);
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'hanging-entity-support',
        java: 'A painting or a leash knot breaks once what it hangs from is gone, and a painting drops its item.',
        reference:
            'Java HangingEntity.tick (survives checked every 100 ticks), Painting.dropItem and LeashFenceKnotEntity.survives; issue #3136',
        subjects: () => ['minecraft:painting', 'minecraft:leash_knot'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['jsprismarine:hanging'],
        run: (subject) => {
            const differences = hangingDifferences(subject.javaId, subject.bedrock);
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'painting-placement',
        java: 'A painting placed on a wall shows one of the placeable variants that fit there with the largest area, or is not placed when none fits, and a client is shown it at the center of its face.',
        reference:
            'Java Painting.create (the minecraft:placeable painting_variant tag, survives, variantArea, Util.getRandomSafe) and Painting.calculateBoundingBox (0.46875 off the wall, half a block further for an even size); issue #3136',
        subjects: () => ['minecraft:painting'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['jsprismarine:hanging'],
        run: (subject) => {
            const differences = paintingPlacementDifferences(subject.bedrock);
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'painting-motif',
        java: 'A client draws each placeable painting by the name its Bedrock resource pack gives that picture.',
        reference:
            "Bedrock's resource pack textures/painting/ and the kz atlas tile names in the pinned Bedrock Dedicated Server, against each Java variant's asset_id",
        subjects: () => ['minecraft:painting'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['jsprismarine:hanging'],
        run: () => {
            const differences = paintingMotifDifferences();
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'ominous-item-spawner',
        java: 'An ominous item spawner lets its item go within 120 ticks and leaves.',
        reference:
            'Java OminousItemSpawner.tick (spawnItemAfterTicks drawn from 60 to 120) and OminousItemSpawner.spawnItem; issue #3137',
        subjects: () => ['minecraft:ominous_item_spawner'].flatMap((javaId) => mappedEntity(javaId) ?? []),
        idOf: (subject) => subject.javaId,
        aspects: () => ['jsprismarine:ominous_item_spawner'],
        run: (subject) => {
            const differences = ominousDifferences(subject.bedrock);
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    }
];
