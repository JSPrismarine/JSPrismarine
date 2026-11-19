/**
 * The `world-settings` scenario: the world's time of day, day and moon phase, its default spawn,
 * difficulty, cheats and hardcore flags, music, every game rule, and `system`'s script events,
 * `waitTicks`, editor flag and memory tier. Everything runs once the chunk at the origin has
 * loaded, with the daylight cycle stopped so the time reads the same on every host.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { Difficulty, MemoryTier, PlayerWaypointsMode, TimeOfDay, system, world } from '@minecraft/server';

const PACK = 'settings';
let seq = 0;
let start = 0;

/** Logs one observation, stamped with the pack's sequence number and the tick since the chunks loaded. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(
        `DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick - start, event, ...observed })}`
    );
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        const value = call();
        record(event, { value: value === undefined ? 'undefined' : value });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** Runs `run` once the chunk at the origin is loaded, adding a ticking area for BDS. */
const whenLoaded = (run) => {
    world.afterEvents.worldLoad.subscribe(() => {
        const overworld = world.getDimension('overworld');
        try {
            overworld.runCommand('tickingarea add -16 0 -16 15 0 15 jsp_scenario');
        } catch {
            // A world that loads its spawn chunks without one may refuse it.
        }
        const waiting = system.runInterval(() => {
            let loaded = false;
            try {
                loaded = overworld.getBlock({ x: 0, y: -61, z: 0 }) !== undefined;
            } catch {
                // Not loaded yet.
            }
            if (!loaded) return;
            system.clearRun(waiting);
            start = system.currentTick;
            run();
        }, 1);
    });
};

/**
 * The game rules a script reads, in the order the API lists them. `randomTickSpeed` and
 * `showCoordinates` are read on their own: JSPrismarine starts them at Java's 3 and on, on purpose.
 */
const RULES = [
    'commandBlockOutput',
    'commandBlocksEnabled',
    'doDayLightCycle',
    'doEntityDrops',
    'doFireTick',
    'doImmediateRespawn',
    'doInsomnia',
    'doLimitedCrafting',
    'doMobLoot',
    'doMobSpawning',
    'doTileDrops',
    'doWeatherCycle',
    'drowningDamage',
    'fallDamage',
    'fireDamage',
    'freezeDamage',
    'functionCommandLimit',
    'keepInventory',
    'maxCommandChainLength',
    'mobGriefing',
    'naturalRegeneration',
    'playerWaypoints',
    'playersSleepingPercentage',
    'projectilesCanBreakBlocks',
    'pvp',
    'recipesUnlock',
    'respawnBlocksExplode',
    'sendCommandFeedback',
    'showBorderEffect',
    'showDaysPlayed',
    'showDeathMessages',
    'showRecipeMessages',
    'showTags',
    'spawnRadius',
    'tntExplodes',
    'tntExplosionDropDecay'
];

/** The time, day and moon phase as one reading. */
const clock = () => ({
    timeOfDay: world.getTimeOfDay(),
    absolute: world.getAbsoluteTime(),
    day: world.getDay(),
    moon: world.getMoonPhase()
});

system.afterEvents.scriptEventReceive.subscribe((event) => {
    record('scriptEventReceive', {
        value: { id: event.id, message: event.message, sourceType: event.sourceType }
    });
});

whenLoaded(() => {
    const rules = world.gameRules;
    attempt('game rule defaults', () => Object.fromEntries(RULES.map((rule) => [rule, rules[rule]])));
    attempt('gameRules is the same object', () => world.gameRules === rules);
    attempt('server defaults', () => ({
        randomTickSpeed: rules.randomTickSpeed,
        showCoordinates: rules.showCoordinates
    }));
    rules.randomTickSpeed = 4;
    rules.showCoordinates = false;
    rules.doDayLightCycle = false;
    attempt('setAbsoluteTime 0', () => {
        world.setAbsoluteTime(0);
        return clock();
    });
    attempt('setTimeOfDay Noon', () => {
        world.setTimeOfDay(TimeOfDay.Noon);
        return clock();
    });
    attempt('setAbsoluteTime 3 days and 100', () => {
        world.setAbsoluteTime(24000 * 3 + 100);
        return clock();
    });
    attempt('setTimeOfDay Night keeps the day', () => {
        world.setTimeOfDay(TimeOfDay.Night);
        return clock();
    });
    attempt('setTimeOfDay past a day', () => {
        world.setTimeOfDay(30000);
        return clock();
    });
    attempt('setAbsoluteTime 9 days', () => {
        world.setAbsoluteTime(24000 * 9 + 5);
        return clock();
    });
    attempt('setAbsoluteTime negative', () => {
        world.setAbsoluteTime(-100);
        return clock();
    });
    attempt('setTimeOfDay negative', () => {
        world.setTimeOfDay(-50);
        return clock();
    });
    attempt('moon phases', () => {
        const phases = [];
        for (let day = 0; day < 9; day++) {
            world.setAbsoluteTime(24000 * day + 18000);
            phases.push(world.getMoonPhase());
        }
        return phases;
    });
    world.setAbsoluteTime(1000);

    attempt('getDefaultSpawnLocation', () => typeof world.getDefaultSpawnLocation().y);
    attempt('setDefaultSpawnLocation', () => {
        world.setDefaultSpawnLocation({ x: 10.7, y: -60, z: -5.2 });
        return world.getDefaultSpawnLocation();
    });
    attempt('setDefaultSpawnLocation above the world', () => {
        world.setDefaultSpawnLocation({ x: 0, y: 1000, z: 0 });
        return world.getDefaultSpawnLocation();
    });
    attempt('setDefaultSpawnLocation below the world', () => {
        world.setDefaultSpawnLocation({ x: 0, y: -1000, z: 0 });
        return world.getDefaultSpawnLocation();
    });

    attempt('setDifficulty Hard', () => {
        world.setDifficulty(Difficulty.Hard);
        return world.getDifficulty();
    });
    attempt('setDifficulty Peaceful', () => {
        world.setDifficulty(Difficulty.Peaceful);
        return world.getDifficulty();
    });
    attempt('setDifficulty of an unknown name', () => world.setDifficulty('Insane'));
    world.setDifficulty(Difficulty.Normal);

    attempt('isHardcore', () => world.isHardcore);
    attempt('seed is a string of digits', () => /^-?\d+$/.test(world.seed));
    attempt('allowCheats', () => world.allowCheats);
    attempt('allowCheats set', () => {
        world.allowCheats = true;
        return world.allowCheats;
    });
    attempt('getPackSettings', () => world.getPackSettings());
    attempt('broadcastClientMessage', () => world.broadcastClientMessage('jsp:message', 'value'));

    attempt('playMusic', () => world.playMusic('record.cat', { volume: 0.5, fade: 1, loop: true }));
    attempt('queueMusic', () => world.queueMusic('record.13'));
    attempt('playMusic too loud', () => world.playMusic('record.cat', { volume: 2 }));
    attempt('playMusic with a negative fade', () => world.playMusic('record.cat', { fade: -1 }));
    attempt('stopMusic', () => world.stopMusic());

    attempt('set every game rule', () => {
        const changed = {};
        for (const rule of RULES) {
            const before = rules[rule];
            if (typeof before === 'boolean') rules[rule] = !before;
            else if (typeof before === 'number') rules[rule] = before + 3;
            else
                rules[rule] =
                    before === PlayerWaypointsMode.Off ? PlayerWaypointsMode.Everyone : PlayerWaypointsMode.Off;
            changed[rule] = rules[rule];
        }
        return changed;
    });
    attempt('randomTickSpeed negative', () => {
        rules.randomTickSpeed = -1;
        return rules.randomTickSpeed;
    });
    attempt('playersSleepingPercentage 200', () => {
        rules.playersSleepingPercentage = 200;
        return rules.playersSleepingPercentage;
    });
    attempt('spawnRadius fractional', () => {
        rules.spawnRadius = 2.7;
        return rules.spawnRadius;
    });
    attempt('playerWaypoints of an unknown mode', () => {
        rules.playerWaypoints = 'Nobody';
        return rules.playerWaypoints;
    });
    attempt('showCoordinates a number', () => {
        rules.showCoordinates = 1;
        return rules.showCoordinates;
    });
    attempt('the gamerule command sees a script write', () => {
        rules.keepInventory = true;
        return world.getDimension('overworld').runCommand('gamerule keepinventory').successCount;
    });
    attempt('a script sees the gamerule command', () => {
        world.getDimension('overworld').runCommand('gamerule mobgriefing false');
        return rules.mobGriefing;
    });
    for (const rule of [...RULES, 'randomTickSpeed', 'showCoordinates']) {
        if (rule === 'playerWaypoints') continue;
        try {
            world.getDimension('overworld').runCommand(`gamerule ${rule.toLowerCase()} ${JSON.stringify(rules[rule])}`);
        } catch {
            // The value is the one the rule holds, so a refused command changes nothing.
        }
    }
    attempt('game rules after the commands', () =>
        Object.fromEntries([...RULES, 'randomTickSpeed', 'showCoordinates'].map((rule) => [rule, rules[rule]]))
    );

    attempt('isEditorWorld', () => system.isEditorWorld);
    attempt('serverSystemInfo is the same object', () => system.serverSystemInfo === system.serverSystemInfo);
    attempt('memoryTier is a tier', () => Object.values(MemoryTier).includes(system.serverSystemInfo.memoryTier));
    attempt('sendScriptEvent', () => system.sendScriptEvent('jsp:sent', 'hello there'));
    attempt('sendScriptEvent in the minecraft namespace', () => system.sendScriptEvent('minecraft:sent', 'refused'));
    attempt('sendScriptEvent without a namespace', () => system.sendScriptEvent('sent', 'refused'));
    attempt('sendScriptEvent with an empty message', () => system.sendScriptEvent('jsp:empty', ''));
    record('after sendScriptEvent');
    attempt('waitTicks 0', () => {
        system.waitTicks(0).then(
            () => record('waitTicks 0 resolved'),
            (error) => record('waitTicks 0 rejected', { error: String(error) })
        );
        return 'queued';
    });
    attempt('waitTicks 3', () => {
        system.waitTicks(3).then(() => record('waitTicks 3 resolved'));
        system.runTimeout(() => record('runTimeout 3 ran'), 3);
        return 'queued';
    });

    const overworld = world.getDimension('overworld');
    attempt('heightRange', () => ['overworld', 'nether', 'the_end'].map((id) => world.getDimension(id).heightRange));
    attempt('localizationKey', () =>
        ['overworld', 'nether', 'the_end'].map((id) => world.getDimension(id).localizationKey)
    );
    attempt('getWeather', () => overworld.getWeather());
    attempt('isChunkLoaded at the origin', () => overworld.isChunkLoaded({ x: 0, y: 0, z: 0 }));
    attempt('isChunkLoaded far away', () => overworld.isChunkLoaded({ x: 100000, y: 0, z: 0 }));
    attempt('isChunkLoaded in the nether', () => world.getDimension('nether').isChunkLoaded({ x: 0, y: 0, z: 0 }));

    system.runTimeout(() => {
        record('game rules a tick later', { value: { mobGriefing: rules.mobGriefing } });
        world.gameRules.doDayLightCycle = true;
        console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`);
    }, 5);
});
