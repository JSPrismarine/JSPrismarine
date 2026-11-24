import { describe, expect, it } from 'vitest';

import { SCRIPT_MODULE_HISTORIES } from '../generated/scriptModules';
import { shapeAt } from '../shape/history';
import { ScriptApiImplementations } from '../shape/implementations';
import { scanCoverage } from './coverage';

const history = SCRIPT_MODULE_HISTORIES['@minecraft/server'];
if (history === undefined) throw new Error('@minecraft/server has no generated shape');
const SHAPES = [shapeAt(history, '2.11.0')];

/** The member names a script uses of `@minecraft/server` 2.11.0. */
const used = (source: string): readonly string[] =>
    scanCoverage(new Map([['main.js', source]]), SHAPES, new ScriptApiImplementations()).used;

describe('scanCoverage', () => {
    it('skips a name that only a class the scripts cannot reach declares', () => {
        expect(
            used(`import { world } from '@minecraft/server';
                import('@jsprismarine/server').then((server) => server.levels.list());
                world.getAllPlayers();`)
        ).toEqual(['getAllPlayers']);
    });

    it('counts that name once a member the scripts name hands out its class', () => {
        expect(
            used(`import { world } from '@minecraft/server';
                world.getLootTableManager().getLootTable('chests/x').pools[0].entries[0].functions[0].levels;`)
        ).toEqual(['entries', 'functions', 'getLootTable', 'getLootTableManager', 'levels', 'pools']);
    });

    it('follows an event a callback destructures', () => {
        expect(
            used(`import { system } from '@minecraft/server';
                system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => customCommandRegistry.registerCommand());`)
        ).toEqual(['beforeEvents', 'registerCommand', 'startup', 'subscribe']);
    });

    it("reaches a component's class through getComponent's return type", () => {
        expect(
            used(`import { world } from '@minecraft/server';
                world.getAllPlayers()[0].getComponent('minecraft:health').currentValue;`)
        ).toEqual(['currentValue', 'getAllPlayers', 'getComponent']);
    });
});
