import type { EntityPosition } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import fightVectors from '../../vectors/26.3/dragon-fights.json' with { type: 'json' };
import nodeVectors from '../../vectors/26.3/dragon-nodes.json' with { type: 'json' };
import wallVectors from '../../vectors/26.3/dragon-walls.json' with { type: 'json' };
import { GoalHarness, testMob } from '../harness';
import { wrapDegrees } from '../javaMth';
import { GoalSupport } from '../support';
import type { GoalMob, GoalWorld } from '../world';
import type { PathNode } from './dragonNodes';
import { closestDragonNode, dragonPathNodes, findDragonPath, firstDragonNode } from './dragonNodes';
import type { DragonPhaseName } from './dragonPhases';
import { checkDragonWalls, DRAGON_PHASES, dragonPhasesOf, dragonPhaseState } from './dragonPhases';

/**
 * The dragon's flight against what Java 26.3 computes, from the vectors
 * `utils/oracle/DumpDragonVectors.java` records by running Java's own `EnderDragon` on a level
 * with no server behind it: open air everywhere over the heightmap {@link surface}.
 */

/** The ground the oracle's level reports, `DumpDragonVectors.surface`. */
const surface = (x: number, z: number): number => 56 + ((((x * 7 + z * 13) % 23) + 23) % 23);

describe("the ender dragon's path nodes against Java's", () => {
    const nodes = dragonPathNodes(surface);

    it('stand where Java puts them', () => {
        expect(nodes.map((node) => [node.x, node.y, node.z])).toEqual(nodeVectors.nodes);
    });

    it('pick the closest node Java picks, with crystals standing and with none', () => {
        const differences = nodeVectors.closest.flatMap(([x = 0, y = 0, z = 0, withCrystals, without]) => {
            const at = { x, y, z };
            const port = [
                closestDragonNode(nodes, at, firstDragonNode(10)),
                closestDragonNode(nodes, at, firstDragonNode(0))
            ];
            return port[0] === withCrystals && port[1] === without ? [] : [{ at, java: [withCrystals, without], port }];
        });
        expect(differences).toEqual([]);
    });

    it('find the path Java finds between every pair of nodes', () => {
        const [endX = 0, endY = 0, endZ = 0] = nodeVectors.end;
        const differences = nodeVectors.paths.flatMap(([crystals, from, to, withEnd, java]) => {
            const last: PathNode | undefined = withEnd === 1 ? { x: endX, y: endY, z: endZ } : undefined;
            const path = findDragonPath(
                nodes,
                Number(from),
                Number(to),
                last,
                firstDragonNode(crystals === 1 ? 10 : 0)
            );
            const port = path?.nodes.map((node) => (node === last ? -1 : nodes.indexOf(node))) ?? null;
            return JSON.stringify(port) === JSON.stringify(java) ? [] : [{ crystals, from, to, withEnd, java, port }];
        });
        expect(differences).toEqual([]);
    });
});

/** One recorded fight, as the vector file holds it. */
type Fight = (typeof fightVectors.fights)[number];

/** A draw Java's dragon made: the tick, the method, the bound (-1 for `nextFloat`) and the value. */
type Draw = [number, string, number, number];

const isDraw = (row: (number | string)[]): row is Draw =>
    typeof row[0] === 'number' &&
    typeof row[1] === 'string' &&
    typeof row[2] === 'number' &&
    typeof row[3] === 'number';

/** A Java block state as the vector file writes it: the name, then the properties. */
type JavaState = [string, Record<string, string>];

const isJavaState = (value: unknown): value is JavaState =>
    Array.isArray(value) &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'object' &&
    value[1] !== null &&
    Object.values(value[1]).every((property) => typeof property === 'string');

/** One block of `pillars`'s palette: its state, then whether it is air, `dragon_immune` and `dragon_transparent`. */
const palette = fightVectors.palette.flatMap(([state, air, immune, transparent]) =>
    isJavaState(state) && typeof air === 'boolean' && typeof immune === 'boolean' && typeof transparent === 'boolean'
        ? [{ state, air, immune, transparent }]
        : []
);

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/**
 * The blocks of the `pillars` layout, `DumpDragonVectors.Layout`: a column from y 60 to 150 on
 * every sixth x and z between 24 and 110 blocks from the origin, but those within two blocks of a
 * path node, each block `palette[floorMod(3x + 5y + 11z, palette.length)]`.
 */
const pillars = (): Map<string, (typeof palette)[number]> => {
    const blocks = new Map<string, (typeof palette)[number]>();
    for (let x = -110; x <= 110; x += 6)
        for (let z = -110; z <= 110; z += 6) {
            const away = x * x + z * z;
            if (away < 24 * 24 || away > 110 * 110) continue;
            if (nodeVectors.nodes.some(([nx = 0, , nz = 0]) => Math.abs(nx - x) <= 2 && Math.abs(nz - z) <= 2))
                continue;
            for (let y = 60; y <= 150; y += 1) {
                const block = palette[(((3 * x + 5 * y + 11 * z) % palette.length) + palette.length) % palette.length];
                if (block !== undefined) blocks.set(key(x, y, z), block);
            }
        }
    return blocks;
};

/** What the port did on the first tick it stopped matching Java, or undefined when it never did. */
interface Divergence {
    readonly tick: number;
    readonly what: string;
    readonly java: unknown;
    readonly port: unknown;
}

/**
 * Flies one fight through the dragon's goals and compares each tick with Java's. The dragon's
 * random source hands back the values Java's drew, in order, and the run stops at the first draw
 * the port makes that Java did not, since every tick after that one would differ too.
 *
 * The world answers as Java's did: the blocks of the fight's layout with their tags, the players
 * and the zombies with their hitboxes, the blows Java dealt the dragon as the health it left and,
 * for one that knocked it back, as the velocity it left, which the server works out, each
 * line of sight as Java's `hasLineOfSight` answered it, and for each standing entity the blow its
 * `getLastHurtByMob` remembers, as Java's own `hurtServer` and `baseTick` left it after each blow
 * the port deals and each tick.
 */
const fly = (fight: Fight): Divergence | undefined => {
    let tick = 0;
    let divergence: Divergence | undefined;
    const differ = (what: string, java: unknown, port: unknown): void => {
        if (divergence === undefined && JSON.stringify(java) !== JSON.stringify(port))
            divergence = { tick, what, java, port };
    };
    const draws = fight.draws.filter(isDraw);
    let drawn = 0;
    const draw = (bound: number): number => {
        const next = draws[drawn];
        if (divergence === undefined && (next === undefined || next[0] !== tick || next[2] !== bound))
            divergence = { tick, what: 'random draw', java: next, port: { tick, bound } };
        drawn += 1;
        return next?.[3] ?? 0;
    };

    // The players, then the zombies, in the order Java's level lists them; `marks` is the blow each
    // one's `getLastHurtByMob` remembers, as a game tick, or null.
    const dragonMob = testMob('dragon', { x: 0, y: 0, z: 0 }, { identifier: 'minecraft:ender_dragon' });
    const marks: (number | null)[] = [];
    const standingMob = (identifier: string, [x = 0, y = 0, z = 0]: number[], index: number): GoalMob => {
        const [width = 0, height = 0] =
            Object.entries(fightVectors.sizes).find(([type]) => type === identifier)?.[1] ?? [];
        marks.push(null);
        return {
            ...testMob(`${identifier}${index}`, { x, y, z }, { identifier, health: fightVectors.standingHealth }),
            size: () => ({ width, height }),
            lastHurtBy: () => {
                const mark = marks[index];
                return mark === null || mark === undefined ? undefined : { mob: dragonMob, tick: mark };
            }
        };
    };
    const players = fight.players.map((at, index) => standingMob('minecraft:player', at, index));
    const standing = [
        ...players,
        ...fight.zombies.map((at, index) => standingMob('minecraft:zombie', at, players.length + index))
    ];
    const indexOf = (mob: GoalMob): number => standing.indexOf(mob);

    const blocks = fight.layout === 'pillars' ? pillars() : new Map<string, (typeof palette)[number]>();
    const blockChanges: unknown[] = [];
    const pushes: unknown[] = [];
    const javaBlows = fight.blows.filter((row) => row[2] === 'minecraft:mob_attack');
    const blows: unknown[] = [];
    let forgotten = 0;
    let sighted = 0;

    // The tick and the type of each thing the dragon spawns, and where a breath cloud stands; the
    // port's `shoot` leaves where a fireball starts to the server.
    const spawned: (number | string)[][] = [];
    let harness: GoalHarness | undefined;
    const here = (): EntityPosition => harness?.actuator.at ?? { x: 0, y: 0, z: 0 };
    const away = (mob: GoalMob): number => {
        const [at, there] = [here(), mob.position()];
        return (there.x - at.x) ** 2 + (there.y - at.y) ** 2 + (there.z - at.z) ** 2;
    };
    const [originX = 0, originY = 0, originZ = 0] = fight.origin;
    let yaw: number | undefined;
    // The dragon's velocity as the last move left it, which Java's dragon starts at zero.
    let velocity: EntityPosition = { x: 0, y: 0, z: 0 };
    const knocks = new Map(fight.knocks.map(([at = 0, ...row]) => [at, row]));
    let attackTarget: GoalMob | undefined;
    const world: GoalWorld = {
        gameTime: () => tick,
        // Java's `getNearestPlayer`: within the range, nearest first, the earlier player on a tie.
        players: (radius) =>
            players.filter((player) => away(player) <= radius * radius).sort((a, b) => away(a) - away(b)),
        // Java's entity storage, in the order the oracle's level keeps it.
        mobs: (radius) => standing.filter((mob) => away(mob) <= radius * radius),
        // Each line of sight the port checks is the next one Java's dragon checked, answered as Java's was.
        hasLineOfSight: (mob) => {
            const java = fight.sights[sighted];
            sighted += 1;
            differ('line of sight', java?.slice(0, 2), [tick, indexOf(mob)]);
            return java?.[2] === true;
        },
        surfaceY: surface,
        fightOrigin: () => ({ x: originX, y: originY, z: originZ }),
        endCrystalsAlive: () => fight.crystals ?? undefined,
        gameRule: (name) => (name === 'mobGriefing' ? fight.mobGriefing : undefined),
        target: () => attackTarget,
        setTarget: (mob) => {
            attackTarget = mob;
        },
        moveSelf: (position, facing, _pitch, moved) => {
            if (harness !== undefined) harness.actuator.at = position;
            yaw = facing;
            if (moved !== undefined) velocity = moved;
        },
        velocity: () => velocity,
        shoot: (_target, projectile) => {
            spawned.push([tick, projectile ?? 'nothing']);
        },
        spawn: (identifier, position) => {
            spawned.push([tick, identifier, position.x, position.y, position.z]);
            return testMob(`${identifier}-${spawned.length}`, position, { identifier });
        },
        pushMob: (mob, velocity) => {
            const row = [tick, indexOf(mob), velocity.x, velocity.y, velocity.z];
            differ('push', fight.pushes[pushes.length], row);
            pushes.push(row);
        },
        // Each blow the port deals is the next one Java's dragon dealt, and leaves the mob
        // remembering what Java's `hurtServer` left it remembering.
        attack: (mob, damage) => {
            const java = javaBlows[blows.length];
            const row = [tick, indexOf(mob), 'minecraft:mob_attack', damage];
            differ('blow', java?.slice(0, 4), row);
            blows.push(row);
            const mark = java?.[5];
            const index = indexOf(mob);
            if (typeof mark === 'number' || mark === null) marks[index] = mark;
        },
        javaBlockAt: (at) => {
            const block = blocks.get(key(at.x, at.y, at.z));
            return block === undefined
                ? { name: 'minecraft:air', properties: {} }
                : { name: block.state[0], properties: block.state[1] };
        },
        setJavaBlock: (at, state) => {
            const row = [tick, at.x, at.y, at.z, [state.name, state.properties]];
            differ('block change', fight.blockChanges[blockChanges.length], row);
            blockChanges.push(row);
            const block = palette.find(({ state: [name] }) => name === state.name);
            if (state.name === 'minecraft:air') blocks.delete(key(at.x, at.y, at.z));
            else if (block !== undefined) blocks.set(key(at.x, at.y, at.z), block);
        },
        blockHasTag: (at, tag) => {
            const block = blocks.get(key(at.x, at.y, at.z));
            return tag === 'minecraft:dragon_immune'
                ? block?.immune === true
                : tag === 'minecraft:dragon_transparent' && block?.transparent === true;
        }
    };
    const [x = 0, y = 0, z = 0] = fight.start;
    harness = new GoalHarness({
        goals: {
            'minecraft:behavior.dragontakeoff': { priority: 0 },
            'minecraft:behavior.dragonchargeplayer': { priority: 1 },
            'minecraft:behavior.dragonstrafeplayer': { priority: 2 },
            'minecraft:behavior.dragonholdingpattern': { priority: 3 },
            'minecraft:behavior.dragonlanding': { priority: 0 },
            'minecraft:behavior.dragonflaming': { priority: 1 },
            'minecraft:behavior.dragonscanning': { priority: 2 }
        },
        components: { 'minecraft:health': { value: 200, max: 200 } },
        world,
        random: () => draw(-1),
        randomInt: draw,
        at: { x, y, z }
    });
    const phases = dragonPhasesOf(new GoalSupport(harness.entity, world));
    const targets = new Map(fight.targets.map(([at, ...target]) => [at, target]));
    let target: readonly (number | null)[] = [];
    const healthAfter = new Map(fight.hits.map((hit) => [hit[0], hit[5]]));
    const walls = new Set<number>();
    for (const wall of fight.inWall) walls.add(wall);

    for (; tick < fight.ticks && divergence === undefined; tick += 1) {
        // What Java's standing entities forgot on their own tick, the tick before.
        for (; forgotten < fight.forgets.length; forgotten += 1) {
            const [at, index, mark] = fight.forgets[forgotten] ?? [];
            if (typeof at !== 'number' || typeof index !== 'number' || at >= tick) break;
            marks[index] = mark ?? null;
        }
        const health = healthAfter.get(tick);
        if (typeof health === 'number') harness.entity.attributes.set('health', health);
        // A blow that knocked Java's dragon back found it flying as the port's last move left it.
        const knock = knocks.get(tick);
        if (knock !== undefined) {
            const [beforeX, beforeY, beforeZ, x = 0, y = 0, z = 0] = knock;
            differ('velocity before the blow', [beforeX, beforeY, beforeZ], [velocity.x, velocity.y, velocity.z]);
            velocity = { x, y, z };
        }
        harness.tick();
        const phase: DragonPhaseName = harness.entity.componentState.get(dragonPhaseState)?.phase ?? 'holding_pattern';
        const at = here();
        target = targets.get(tick) ?? target;
        const javaTarget = target[0] === null || target[0] === undefined ? undefined : target;
        const portTarget = phases.flyTargetLocation;
        // The file writes Java's `float` yaw as its shortest decimal, which reads back as a `double`.
        const yRot = Math.fround(fight.yRot[tick] ?? Number.NaN);
        differ('phase', DRAGON_PHASES[fight.phase[tick] ?? -1], phase);
        differ('position', [fight.x[tick], fight.y[tick], fight.z[tick]], [at.x, at.y, at.z]);
        differ('yRot', yRot, phases.javaYRot);
        differ('yaw', wrapDegrees(yRot + 180), yaw);
        differ('inWall', walls.has(tick), phases.inWall);
        differ('target', javaTarget, portTarget === undefined ? undefined : [portTarget.x, portTarget.y, portTarget.z]);
    }
    if (divergence !== undefined) return divergence;
    if (drawn !== draws.length) return { tick, what: 'draws left', java: draws.slice(drawn), port: [] };
    differ('lines of sight', fight.sights.length, sighted);
    differ('pushes', fight.pushes, pushes);
    differ(
        'blows',
        javaBlows.map((row) => row.slice(0, 4)),
        blows
    );
    differ('block changes', fight.blockChanges, blockChanges);
    const java = fight.spawns.map((row) => (row[1] === 'minecraft:dragon_fireball' ? row.slice(0, 2) : row));
    differ('spawns', java, spawned);
    return divergence;
};

describe("the ender dragon's flight against Java's", () => {
    it('records fights that run every phase the flight copies', () => {
        const ran = new Set(fightVectors.fights.flatMap((fight) => fight.phase.map((id) => DRAGON_PHASES[id])));
        expect([...ran].sort()).toEqual(
            [
                'holding_pattern',
                'strafe_player',
                'landing_approach',
                'landing',
                'takeoff',
                'sitting_flaming',
                'sitting_scanning',
                'sitting_attacking',
                'charging_player'
            ].sort()
        );
    });

    it('records fights that run the walls, the wings, the head, the blows and the fight origin', () => {
        const fights = fightVectors.fights;
        const phaseId = (name: DragonPhaseName): number => DRAGON_PHASES.indexOf(name);
        const sittingPhases: readonly DragonPhaseName[] = ['sitting_scanning', 'sitting_attacking', 'sitting_flaming'];
        const sitting = sittingPhases.map(phaseId);
        // `checkWalls` breaks blocks with mob griefing on, and meets the ones it may not break either way.
        expect(fights.some((fight) => fight.blockChanges.length > 0)).toBe(true);
        expect(fights.some((fight) => fight.mobGriefing && fight.inWall.length > 0)).toBe(true);
        expect(fights.some((fight) => !fight.mobGriefing && fight.inWall.length > 0)).toBe(true);
        // The wings push and strike, and the head and the neck strike, some blows landing and some not.
        const blows = fights.flatMap((fight) => fight.blows);
        expect(fights.some((fight) => fight.pushes.length > 0)).toBe(true);
        for (const damage of [5, 10])
            for (const landed of [true, false])
                expect(blows.some((row) => row[3] === damage && row[4] === landed)).toBe(true);
        expect(fights.some((fight) => fight.forgets.length > 0)).toBe(true);
        // Blows land on the head and on the body, while the dragon flies and while it sits, and the
        // ones it takes sitting make it take off.
        const hits = fights.flatMap((fight) => fight.hits.map((hit) => ({ fight, hit })));
        for (const part of ['head', 'body'])
            for (const sits of [true, false])
                expect(
                    hits.some(({ fight, hit: [tick, hitPart] }) => {
                        const before = typeof tick === 'number' ? fight.phase[tick - 1] : undefined;
                        return hitPart === part && sitting.includes(before ?? phaseId('holding_pattern')) === sits;
                    })
                ).toBe(true);
        expect(
            hits.some(
                ({ fight, hit: [tick] }) =>
                    typeof tick === 'number' &&
                    sitting.includes(fight.phase[tick - 1] ?? -1) &&
                    fight.phase[tick] === phaseId('takeoff')
            )
        ).toBe(true);
        // A player's blow and an arrow knock the flying dragon back, and nothing knocks back a
        // sitting one.
        for (const source of ['player', 'arrow'])
            expect(
                hits.some(
                    ({ fight, hit: [tick, , hitSource] }) =>
                        hitSource === source && fight.knocks.some(([at]) => at === tick)
                )
            ).toBe(true);
        expect(
            fights.some((fight) => fight.knocks.some(([tick = 0]) => sitting.includes(fight.phase[tick - 1] ?? -1)))
        ).toBe(false);
        // A dragon takes off after its fourth flame.
        expect(
            fights.some((fight) =>
                fight.phase.some(
                    (id, tick) => id === phaseId('takeoff') && fight.phase[tick - 1] === phaseId('sitting_flaming')
                )
            )
        ).toBe(true);
        // A fight centered away from the world's origin.
        expect(fights.some((fight) => fight.origin.some((coordinate) => coordinate !== 0))).toBe(true);
    });

    it.each(fightVectors.fights.map((fight) => [fight.name, fight] as const))(
        'flies the fight with %s tick for tick',
        (_name, fight) => {
            expect(fly(fight)).toBeUndefined();
        }
    );
});

/** The blocks the wall cases are built of, as the vector file lists them with their tags. */
const wallPalette = wallVectors.palette.flatMap(([state, air, immune, transparent]) =>
    isJavaState(state) && typeof air === 'boolean' && typeof immune === 'boolean' && typeof transparent === 'boolean'
        ? [{ state, air, immune, transparent }]
        : []
);

describe("the ender dragon's walls against Java's, over fluids", () => {
    it('records water, lava, waterlogged and always-wet blocks, and blocks with no fluid', () => {
        const names = new Set(wallPalette.map(({ state: [name] }) => name));
        for (const name of ['minecraft:water', 'minecraft:lava', 'minecraft:kelp', 'minecraft:stone'])
            expect(names.has(name)).toBe(true);
        expect(wallPalette.some(({ state: [, properties] }) => properties['waterlogged'] === 'true')).toBe(true);
        // Java's removeBlock left some blocks as they were and changed others.
        const removals = wallVectors.cases.flatMap((wall) => wall.removals);
        for (const changed of [true, false]) expect(removals.some((row) => row[3] === changed)).toBe(true);
    });

    /**
     * Runs the port's `checkWalls` over one case's box, in a world that answers as Java's level
     * did: the blocks with their tags, and each `removeBlock` with what Java's answered and the
     * block it left, which is the world's fluid rule rather than the dragon's.
     */
    const wallsOf = (wall: (typeof wallVectors.cases)[number]) => {
        const blocks = new Map<string, JavaState>();
        for (const [x = 0, y = 0, z = 0, index = -1] of wall.blocks) {
            const block = wallPalette[index];
            if (block !== undefined) blocks.set(key(x, y, z), block.state);
        }
        const tagged = (at: EntityPosition, tag: 'immune' | 'transparent'): boolean => {
            const state = blocks.get(key(at.x, at.y, at.z));
            return wallPalette.some((block) => block.state === state && block[tag]);
        };
        const removals: unknown[] = [];
        const draws: unknown[] = [];
        const world: GoalWorld = {
            gameRule: (name) => (name === 'mobGriefing' ? wall.mobGriefing : undefined),
            javaBlockAt: (at) => {
                const [name, properties] = blocks.get(key(at.x, at.y, at.z)) ?? ['minecraft:air', {}];
                return { name, properties };
            },
            blockHasTag: (at, tag) =>
                tag === 'minecraft:dragon_immune'
                    ? tagged(at, 'immune')
                    : tag === 'minecraft:dragon_transparent' && tagged(at, 'transparent'),
            removeBlock: (at) => {
                const java = wall.removals.find(([x, y, z]) => x === at.x && y === at.y && z === at.z);
                removals.push([at.x, at.y, at.z, java?.[3]]);
                const left = wall.blockChanges.find(([, x, y, z]) => x === at.x && y === at.y && z === at.z)?.[4];
                if (isJavaState(left)) blocks.set(key(at.x, at.y, at.z), left);
                return java?.[3] === true;
            }
        };
        const [minX = 0, minY = 0, minZ = 0, maxX = 0, maxY = 0, maxZ = 0] = wall.box;
        const javaDraws = wall.draws.filter(isDraw);
        const inWall = checkDragonWalls(
            world,
            { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } },
            (bound) => {
                draws.push(bound);
                return javaDraws[draws.length - 1]?.[3] ?? 0;
            }
        );
        return { inWall, removals, draws };
    };

    it.each(wallVectors.cases.map((wall, index) => [index, wall] as const))(
        'breaks and meets the blocks of case %i as Java does',
        (_index, wall) => {
            const port = wallsOf(wall);
            expect(port).toEqual({
                inWall: wall.inWall,
                removals: wall.removals,
                draws: wall.draws.filter(isDraw).map(([, , bound]) => bound)
            });
        }
    );
});
