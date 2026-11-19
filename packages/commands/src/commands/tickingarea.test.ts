import { describe, expect, it } from 'vitest';

import type { CommandSource, CommandTickingArea, TickingAreaCommandHost, Vector3 } from '../host';
import { createCommandSource } from '../host';
import { testCommandHost } from '../testing';
import { registerVanillaCommands } from './vanilla';

/** A ticking area host in memory that keeps at most two areas. */
const memoryAreas = () => {
    const areas: CommandTickingArea[] = [];
    const matches = (area: CommandTickingArea, target: { readonly name: string } | { readonly position: Vector3 }) =>
        'name' in target
            ? area.name === target.name
            : target.position.x >= area.from.x &&
              target.position.x <= area.to.x &&
              target.position.z >= area.from.z &&
              target.position.z <= area.to.z;
    const host: TickingAreaCommandHost = {
        add: (dimension, from, to, name, preload) => {
            if (areas.length >= 2) return 'limit';
            const chosen = name ?? `Area${areas.length}`;
            if (areas.some((area) => area.name === chosen)) return 'in-use';
            areas.push({ name: chosen, dimension, from, to, preload });
            return chosen;
        },
        remove: (_dimension, target) => {
            const gone = areas.filter((area) => matches(area, target));
            for (const area of gone) areas.splice(areas.indexOf(area), 1);
            return gone.map((area) => area.name);
        },
        removeAll: () => areas.splice(0).map((area) => area.name),
        list: () => areas,
        setPreload: (_dimension, target) => areas.filter((area) => matches(area, target)).map((area) => area.name)
    };
    return { areas, host };
};

/** Runs one line against a host with the given ticking areas, and returns what it produced and said. */
const run = (line: string, tickingAreas: TickingAreaCommandHost | undefined) => {
    const base = testCommandHost();
    const host = { ...base, world: { ...base.world, ...(tickingAreas === undefined ? {} : { tickingAreas }) } };
    const said: string[] = [];
    const source: CommandSource = createCommandSource({
        host,
        permissionLevel: 4,
        onFeedback: (message) => said.push(message),
        onError: (message) => said.push(`error ${message}`)
    });
    return { results: registerVanillaCommands().getDispatcher().execute(line, source), said };
};

describe('/tickingarea', () => {
    it('adds areas by corners and as a circle, names one left unnamed, and stops at the limit', () => {
        const { areas, host } = memoryAreas();
        expect(run('tickingarea add 0 0 0 10 0 10 home true', host).results).toEqual([1]);
        expect(run('tickingarea add circle 64 0 64 2', host).results).toEqual([1]);
        expect(run('tickingarea add 0 0 0 1 0 1 third', host).said).toEqual([
            'error The maximum number of ticking areas has been reached'
        ]);
        expect(areas).toEqual([
            {
                name: 'home',
                dimension: 'minecraft:overworld',
                from: { x: 0, y: 0, z: 0 },
                to: { x: 10, y: 0, z: 10 },
                preload: true
            },
            {
                name: 'Area1',
                dimension: 'minecraft:overworld',
                from: { x: 32, y: 0, z: 32 },
                to: { x: 96, y: 0, z: 96 },
                preload: false
            }
        ]);
    });

    it('refuses a name in use, and removes by name, by position and all at once', () => {
        const { areas, host } = memoryAreas();
        run('tickingarea add 0 0 0 10 0 10 home', host);
        expect(run('tickingarea add 0 0 0 10 0 10 home', host).said).toEqual([
            'error A ticking area named home already exists'
        ]);
        expect(run('tickingarea remove nowhere', host).results).toEqual([0]);
        expect(run('tickingarea remove 5 0 5', host).results).toEqual([1]);
        run('tickingarea add 0 0 0 10 0 10 again', host);
        expect(run('tickingarea preload again false', host).results).toEqual([1]);
        expect(run('tickingarea list', host).results).toEqual([1]);
        expect(run('tickingarea remove_all', host).results).toEqual([1]);
        expect(areas).toEqual([]);
    });

    it('fails on a host that keeps no ticking areas', () => {
        expect(run('tickingarea list', undefined)).toEqual({
            results: [0],
            said: ['error This server keeps no ticking areas']
        });
    });
});
