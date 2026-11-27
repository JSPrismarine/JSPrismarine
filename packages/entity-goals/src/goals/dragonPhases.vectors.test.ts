import type { EntityPosition } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import fightVectors from '../../vectors/26.3/dragon-fights.json' with { type: 'json' };
import nodeVectors from '../../vectors/26.3/dragon-nodes.json' with { type: 'json' };
import { GoalHarness, testMob } from '../harness';
import { wrapDegrees } from '../javaMth';
import { GoalSupport } from '../support';
import type { GoalMob, GoalWorld } from '../world';
import type { PathNode } from './dragonNodes';
import { closestDragonNode, dragonPathNodes, findDragonPath, firstDragonNode } from './dragonNodes';
import type { DragonPhaseName } from './dragonPhases';
import { DRAGON_PHASES, dragonPhasesOf, dragonPhaseState } from './dragonPhases';

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
 */
const fly = (fight: Fight): Divergence | undefined => {
    let tick = 0;
    let divergence: Divergence | undefined;
    const draws = fight.draws.filter(isDraw);
    let drawn = 0;
    const draw = (bound: number): number => {
        const next = draws[drawn];
        if (divergence === undefined && (next === undefined || next[0] !== tick || next[2] !== bound))
            divergence = { tick, what: 'random draw', java: next, port: { tick, bound } };
        drawn += 1;
        return next?.[3] ?? 0;
    };

    const players = fight.players.map(([x = 0, y = 0, z = 0], index) =>
        testMob(`player${index}`, { x, y, z }, { identifier: 'minecraft:player' })
    );
    // The tick and the type of each thing the dragon spawns, and where a breath cloud stands; the
    // port's `shoot` leaves where a fireball starts to the server.
    const spawned: (number | string)[][] = [];
    let harness: GoalHarness | undefined;
    const here = (): EntityPosition => harness?.actuator.at ?? { x: 0, y: 0, z: 0 };
    const away = (mob: GoalMob): number => {
        const [at, there] = [here(), mob.position()];
        return (there.x - at.x) ** 2 + (there.y - at.y) ** 2 + (there.z - at.z) ** 2;
    };
    let yaw: number | undefined;
    let attackTarget: GoalMob | undefined;
    const world: GoalWorld = {
        gameTime: () => tick,
        // Java's `getNearestPlayer`: within the range, nearest first, the earlier player on a tie.
        players: (radius) =>
            players.filter((player) => away(player) <= radius * radius).sort((a, b) => away(a) - away(b)),
        surfaceY: surface,
        fightOrigin: () => ({ x: 0, y: 0, z: 0 }),
        endCrystalsAlive: () => fight.crystals ?? undefined,
        target: () => attackTarget,
        setTarget: (mob) => {
            attackTarget = mob;
        },
        moveSelf: (position, facing) => {
            if (harness !== undefined) harness.actuator.at = position;
            yaw = facing;
        },
        shoot: (_target, projectile) => {
            spawned.push([tick, projectile ?? 'nothing']);
        },
        spawn: (identifier, position) => {
            spawned.push([tick, identifier, position.x, position.y, position.z]);
            return testMob(`${identifier}-${spawned.length}`, position, { identifier });
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
        world,
        random: () => draw(-1),
        randomInt: draw,
        at: { x, y, z }
    });
    const phases = dragonPhasesOf(new GoalSupport(harness.entity, world));
    const targets = new Map(fight.targets.map(([at, ...target]) => [at, target]));
    let target: readonly (number | null)[] = [];

    for (; tick < fight.ticks && divergence === undefined; tick += 1) {
        harness.tick();
        const phase: DragonPhaseName = harness.entity.componentState.get(dragonPhaseState)?.phase ?? 'holding_pattern';
        const at = here();
        target = targets.get(tick) ?? target;
        const javaTarget = target[0] === null || target[0] === undefined ? undefined : target;
        const portTarget = phases.flyTargetLocation;
        // The file writes Java's `float` yaw as its shortest decimal, which reads back as a `double`.
        const yRot = Math.fround(fight.yRot[tick] ?? Number.NaN);
        const checks: [string, unknown, unknown][] = [
            ['phase', DRAGON_PHASES[fight.phase[tick] ?? -1], phase],
            ['position', [fight.x[tick], fight.y[tick], fight.z[tick]], [at.x, at.y, at.z]],
            ['yRot', yRot, phases.javaYRot],
            ['yaw', wrapDegrees(yRot + 180), yaw],
            ['target', javaTarget, portTarget === undefined ? undefined : [portTarget.x, portTarget.y, portTarget.z]]
        ];
        for (const [what, java, port] of checks)
            if (divergence === undefined && JSON.stringify(java) !== JSON.stringify(port))
                divergence = { tick, what, java, port };
    }
    if (divergence !== undefined) return divergence;
    if (drawn !== draws.length) return { tick, what: 'draws left', java: draws.slice(drawn), port: [] };
    const java = fight.spawns.map((row) => (row[1] === 'minecraft:dragon_fireball' ? row.slice(0, 2) : row));
    return JSON.stringify(java) === JSON.stringify(spawned) ? undefined : { tick, what: 'spawns', java, port: spawned };
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

    it.each(fightVectors.fights.map((fight) => [fight.name, fight] as const))(
        'flies the fight with %s tick for tick',
        (_name, fight) => {
            expect(fly(fight)).toBeUndefined();
        }
    );
});
