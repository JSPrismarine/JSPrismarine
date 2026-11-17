/**
 * The persistence compatibility pack. Each run reads what the last server saved: the world's
 * dynamic properties, an armor stand's, and the `compat` objective's scores and sidebar. It logs
 * them as one `COMPAT read` line, then writes generation `gen + 1` of every value and logs
 * `COMPAT written`. The server that runs it next, BDS or JSPrismarine, reads that generation.
 *
 * `packages/parity/src/scripting/persistenceCompat.test.ts` runs it.
 */

import { DisplaySlotId, ObjectiveSortOrder, system, world } from '@minecraft/server';

/** The tag the pack finds its armor stand by. Both servers save an entity's tags. */
const STAND = 'jsp-compat';

const findStand = (overworld) => overworld.getEntities({ type: 'minecraft:armor_stand', tags: [STAND] })[0];

const vector = (value) => (typeof value === 'object' ? { x: value.x, y: value.y, z: value.z } : value);

/** Everything the last server saved, as plain data. */
const read = (overworld) => {
    const stand = findStand(overworld);
    const objective = world.scoreboard.getObjective('compat');
    const shown = world.scoreboard.getObjectiveAtDisplaySlot(DisplaySlotId.Sidebar);
    return {
        world: Object.fromEntries(
            world
                .getDynamicPropertyIds()
                .sort()
                .map((id) => [id, vector(world.getDynamicProperty(id))])
        ),
        stand:
            stand === undefined
                ? null
                : Object.fromEntries(
                      stand
                          .getDynamicPropertyIds()
                          .sort()
                          .map((id) => [id, vector(stand.getDynamicProperty(id))])
                  ),
        objective:
            objective === undefined
                ? null
                : {
                      displayName: objective.displayName,
                      scores: objective
                          .getScores()
                          .map(({ participant, score }) => ({
                              type: participant.type,
                              name: participant.type === 'Entity' ? 'the stand' : participant.displayName,
                              score,
                              isStand: stand !== undefined && participant.getEntity() === stand
                          }))
                          .sort((a, b) => (a.name < b.name ? -1 : 1))
                  },
        sidebar: shown === undefined ? null : { objective: shown.objective.id, sortOrder: shown.sortOrder }
    };
};

/** Writes generation `gen` of every value. */
const write = (overworld, gen) => {
    world.setDynamicProperty('jsp:gen', gen);
    world.setDynamicProperty('jsp:str', `generation ${gen} é😀`);
    world.setDynamicProperty('jsp:bool', gen % 2 === 1);
    world.setDynamicProperty('jsp:vec', { x: gen, y: 0.1, z: -gen });
    world.setDynamicProperty(`jsp:only${gen}`, gen);
    world.setDynamicProperty(`jsp:only${gen - 1}`, undefined);
    let stand = findStand(overworld);
    if (stand === undefined) {
        stand = overworld.spawnEntity('minecraft:armor_stand', { x: 0.5, y: -60, z: 0.5 });
        stand.addTag(STAND);
    }
    stand.setDynamicProperty('jsp:e', gen * 10);
    stand.setDynamicProperty('jsp:ev', { x: 1, y: gen, z: 3 });
    const objective = world.scoreboard.getObjective('compat') ?? world.scoreboard.addObjective('compat', 'Compat');
    objective.setScore('counter', gen * 100);
    objective.setScore(stand, gen);
    world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, {
        objective,
        sortOrder: gen % 2 === 1 ? ObjectiveSortOrder.Descending : ObjectiveSortOrder.Ascending
    });
};

world.afterEvents.worldLoad.subscribe(() => {
    const overworld = world.getDimension('overworld');
    try {
        overworld.runCommand('tickingarea add -16 0 -16 15 0 15 jsp_compat');
    } catch {
        // A world that loads its spawn chunks without one, as JSPrismarine's does, may refuse it.
    }
    let waited = 0;
    const waiting = system.runInterval(() => {
        waited += 1;
        let loaded = false;
        try {
            loaded = overworld.getBlock({ x: 0, y: -61, z: 0 }) !== undefined;
        } catch {
            // Not loaded yet.
        }
        const gen = world.getDynamicProperty('jsp:gen') ?? 0;
        // A saved stand loads with its chunk, which can be a few ticks after the block reads.
        const standLoaded = gen === 0 || findStand(overworld) !== undefined;
        if (!loaded || (!standLoaded && waited < 200)) return;
        system.clearRun(waiting);
        console.warn(`COMPAT read ${JSON.stringify({ gen, ...read(overworld) })}`);
        write(overworld, gen + 1);
        console.warn(`COMPAT written ${gen + 1}`);
    }, 1);
});
