import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { loadLibrary, scriptHostAvailable } from '../../testing/library.test-utils';
import { gameRuleWrite } from './gameRules';
import { SystemScripts, worldWithSystem } from './serverWorld.test-utils';

const harness = new SystemScripts(loadLibrary);
afterEach(() => harness.stopAll());
afterAll(() => harness.removeAll());
const start = harness.start.bind(harness);

describe('gameRuleWrite', () => {
    it('keeps a number whole and within its maximum, and ignores a negative one', () => {
        expect(gameRuleWrite('spawnRadius', 2.7)).toBe(2);
        expect(gameRuleWrite('functionCommandLimit', 10_003)).toBe(10_000);
        expect(gameRuleWrite('playersSleepingPercentage', 200)).toBe(200);
        expect(gameRuleWrite('randomTickSpeed', -1)).toBeUndefined();
        expect(gameRuleWrite('pvp', false)).toBe(false);
    });
});

describe.skipIf(!scriptHostAvailable())("WorldScripts's world settings", () => {
    it('reads the time of day, the day and the moon phase from the absolute time', () => {
        const world = worldWithSystem();
        const { lines } = start(
            `
            world.afterEvents.worldLoad.subscribe(() => {
                const read = () => [world.getTimeOfDay(), world.getAbsoluteTime(), world.getDay(), world.getMoonPhase()];
                log('absolute', () => { world.setAbsoluteTime(24000 * 3 + 100); return read(); });
                log('night', () => { world.setTimeOfDay(TimeOfDay.Night); return read(); });
                log('too late', () => world.setTimeOfDay(24000));
                log('negative', () => { world.setAbsoluteTime(-100); return read(); });
            });`,
            world
        );
        expect(lines).toEqual([
            'absolute [100,72100,3,3]',
            'night [13000,85000,3,3]',
            'too late ! Error: timeOfDay must be between 0 and 23999 (inclusive).',
            'negative [23900,-100,-1,7]'
        ]);
        expect(world.worldSystem.absoluteTime()).toBe(-100);
    });

    it('sets the spawn in whole blocks inside the world, the difficulty, music and game rules', () => {
        const world = worldWithSystem();
        const { lines } = start(
            `
            world.afterEvents.worldLoad.subscribe(() => {
                log('spawn', () => { world.setDefaultSpawnLocation({ x: 10.7, y: -60, z: -5.2 }); return world.getDefaultSpawnLocation(); });
                log('spawn above', () => world.setDefaultSpawnLocation({ x: 0, y: 1000, z: 0 }));
                log('difficulty', () => { world.setDifficulty(Difficulty.Hard); return world.getDifficulty(); });
                log('seed', () => world.seed);
                log('music', () => world.playMusic('record.cat', { volume: 0.5, loop: true }));
                log('negative fade', () => world.queueMusic('record.13', { fade: -1 }));
                log('rules', () => {
                    world.gameRules.spawnRadius = 2.7;
                    world.gameRules.randomTickSpeed = -1;
                    world.gameRules.pvp = false;
                    return [world.gameRules.spawnRadius, world.gameRules.randomTickSpeed, world.gameRules.pvp, world.gameRules.playerWaypoints];
                });
            });`,
            world
        );
        expect(lines).toEqual([
            'spawn {"x":10,"y":-60,"z":-6}',
            'spawn above ! LocationOutOfWorldBoundariesError: Failed to set the default spawn location. Trying to access location (0.0, 1000.0, 0.0) which is outside of the world boundaries.',
            'difficulty "Hard"',
            'seed "42"',
            'music undefined',
            'negative fade ! PropertyOutOfBoundsError: Unsupported or out of bounds value set on Property: fade, Value: -1, Property min: 0',
            'rules [2,1,false,"Everyone"]'
        ]);
        expect(world.worldSystem.music).toEqual([
            { track: 'record.cat', volume: 0.5, fade: 0, loop: true, queue: false }
        ]);
        expect(world.worldSystem.gameRule('pvp')).toBe(false);
    });

    it('raises a sent script event in the same tick and resolves waitTicks with the timeouts', () => {
        const { lines } = start(
            `
            system.afterEvents.scriptEventReceive.subscribe((event) => console.warn(system.currentTick + ' received ' + event.id + ' ' + event.sourceType));
            world.afterEvents.worldLoad.subscribe(() => {
                log('send', () => system.sendScriptEvent('jsp:sent', 'hello'));
                log('minecraft', () => system.sendScriptEvent('minecraft:sent', 'refused'));
                system.waitTicks(0).then(() => console.warn(system.currentTick + ' waited 0'));
                system.waitTicks(2).then(() => console.warn(system.currentTick + ' waited 2'));
                system.runTimeout(() => console.warn(system.currentTick + ' timeout 2'), 2);
            });`,
            worldWithSystem(),
            3
        );
        expect(lines).toEqual([
            'send undefined',
            "minecraft ! NamespaceNameError: There was an error with name 'minecraft:sent': string has invalid namespace (minecraft).",
            '0 waited 0',
            '0 received jsp:sent Server',
            '2 waited 2',
            '2 timeout 2'
        ]);
    });

    it('describes each dimension and stops its sounds', () => {
        const world = worldWithSystem();
        const { lines } = start(
            `
            world.afterEvents.worldLoad.subscribe(() => {
                const overworld = world.getDimension('overworld');
                log('range', () => overworld.heightRange);
                log('key', () => overworld.localizationKey);
                log('weather', () => overworld.getWeather());
                log('stop', () => { overworld.stopSound('random.pop'); overworld.stopAllSounds(); });
                log('memory tier', () => system.serverSystemInfo.memoryTier);
                log('editor', () => system.isEditorWorld);
            });`,
            world
        );
        expect(lines).toEqual([
            'range {"max":320,"min":-64}',
            'key "dimension.dimensionName0"',
            'weather "Clear"',
            'stop undefined',
            'memory tier 4',
            'editor false'
        ]);
        expect(world.worldSystem.stoppedSounds).toEqual(['minecraft:overworld random.pop', 'minecraft:overworld *']);
    });
});
