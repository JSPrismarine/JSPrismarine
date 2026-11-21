import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptHostLibrary } from '../../ScriptEngine';
import { loadLibrary, scriptHostAvailable, TEST_SERVER } from '../../testing/library.test-utils';
import { readScriptConfig, readScriptPack } from '../pack';
import { WorldScripts } from '../WorldScripts';
import { EntityMemoryWorld } from './entities.test-utils';
import { addLevels, addPoints, pointsAtLevel, pointsToReach } from './playerMembers';
import { rayBoxDistance, walkRay } from './entityMembers';

const directories: string[] = [];
afterAll(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** Writes a pack declaring `@minecraft/server` 2.12.0-beta whose entry is `source`. */
const writePack = (source: string) => {
    const directory = mkdtempSync(join(tmpdir(), 'jsp-world-entities-'));
    directories.push(directory);
    mkdirSync(join(directory, 'scripts'));
    writeFileSync(
        join(directory, 'manifest.json'),
        JSON.stringify({
            header: { name: 'entities', uuid: '6f1e9c3a-1b2d-4e5f-8a9b-0c1d2e3f4a51', version: [1, 0, 0] },
            modules: [{ type: 'script', uuid: '6f1e9c3a-1b2d-4e5f-8a9b-0c1d2e3f4a52', entry: 'scripts/main.js' }],
            dependencies: [{ module_name: '@minecraft/server', version: '2.12.0-beta' }]
        })
    );
    writeFileSync(join(directory, 'scripts', 'main.js'), source);
    const pack = readScriptPack(directory);
    if (pack === undefined) throw new Error('the pack has a script module');
    return pack;
};

/** A prelude: `log` prints what a call returned or threw, one line each. */
const PRELUDE = `
import { AimAssistCategorySettings, CatmullRomSpline, EntityTypes, InputPermissionCategory, ItemStack, LinearSpline, system, world } from '@minecraft/server';
const show = (value) => value === undefined ? 'undefined' : JSON.stringify(value);
const log = (label, call) => {
    try { console.warn(label + ' ' + show(call())); } catch (error) { console.warn(label + ' ! ' + String(error)); }
};
`;

describe.skipIf(!scriptHostAvailable())("WorldScripts's entity and player members", () => {
    let library: ScriptHostLibrary;
    beforeAll(() => {
        library = loadLibrary();
    });
    const running: WorldScripts[] = [];
    afterEach(() => {
        for (const scripts of running.splice(0)) scripts.shutdown();
    });

    /** Loads `source` at the pack's top level in a world with a pig and a player, and runs `ticks` flushes. */
    const start = (source: string, ticks = 1) => {
        const world = new EntityMemoryWorld();
        const player = world.join('Steve');
        world.spawnEntity('minecraft:overworld', 'minecraft:pig', { x: 2.5, y: -60, z: 2.5 });
        const lines: string[] = [];
        const scripts = new WorldScripts({
            server: TEST_SERVER,
            library,
            world,
            packs: [writePack(`${PRELUDE}\nworld.afterEvents.worldLoad.subscribe(() => {\n${source}\n});`)],
            config: readScriptConfig(undefined),
            betaApis: true,
            log: {
                info: () => {},
                warn: (line: string) => lines.push(line.replace(/^\[Scripting\] /, '')),
                error: (line: string) => lines.push(`error ${line}`)
            },
            seed: 1n
        });
        running.push(scripts);
        scripts.startEarly();
        scripts.startWorld();
        for (let tick = 0; tick < ticks; tick++) scripts.flush();
        return { world, player, lines };
    };
    const PIG = `const pig = world.getDimension('overworld').getEntities({ type: 'minecraft:pig' })[0];`;
    const PLAYER = `const player = world.getAllPlayers()[0];`;

    it("reads a pig's components from its definition with BDS's defaults", () => {
        const { lines } = start(`${PIG}
log('components', () => pig.getComponents().map((each) => each.typeId).sort());
const leash = pig.getComponent('leashable');
log('leash', () => [leash.hardDistance, leash.softDistance, leash.maxDistance, leash.canBeStolen, leash.isLeashed]);
const seats = pig.getComponent('rideable').getSeats();
log('seats', () => seats.map((seat) => [seat.position, seat.maxRiderCount, seat.lockRiderRotation]));
const navigation = pig.getComponent('navigation.walk');
log('navigation', () => [navigation.canFloat, navigation.avoidWater, navigation.canPathOverWater, navigation.canSink]);
log('feed', () => pig.getComponent('healable').getFeedItems().map((item) => [item.item, item.healAmount]));
log('tame items', () => pig.getComponent('tameable').getTameItems.map((item) => item.typeId));
log('families', () => [pig.getComponent('type_family').getTypeFamilies(), pig.getComponent('type_family').hasTypeFamily('mob')]);
log('air', () => [pig.getComponent('breathable').airSupply, pig.getComponent('breathable').suffocateTime]);
log('air too high', () => { pig.getComponent('breathable').airSupply = 40; });
log('component entity', () => pig.getComponent('leashable').entity === pig);`);
        expect(lines).toEqual([
            'components ["minecraft:breathable","minecraft:healable","minecraft:health","minecraft:leashable","minecraft:movement","minecraft:navigation.walk","minecraft:rideable","minecraft:tameable","minecraft:type_family"]',
            'leash [7,4,12,true,false]',
            'seats [[{"x":0,"y":0.7,"z":0},1,181]]',
            'navigation [true,true,false,true]',
            'feed [["minecraft:carrot",2]]',
            'tame items ["minecraft:cod"]',
            'families [["pig","mob"],true]',
            'air [15,0]',
            'air too high ! PropertyOutOfBoundsError: Unsupported or out of bounds value set on Property: airSupply, Value: 40, Property bounds: [0, 15]',
            'component entity true'
        ]);
    });

    it('rides, leashes, tames and sets fire through the systems', () => {
        const { lines } = start(`${PIG}${PLAYER}
const rideable = pig.getComponent('rideable');
log('addRider', () => [rideable.addRider(player), rideable.getRiders().length, player.getComponent('riding')?.entityRidingOn === pig]);
log('ejectRiders', () => { rideable.ejectRiders(); return rideable.getRiders().length; });
const leash = pig.getComponent('leashable');
log('leashTo', () => { leash.leashTo(player); return [leash.isLeashed, leash.leashHolder === player]; });
log('unleash', () => { leash.unleash(); return leash.isLeashed; });
const tameable = pig.getComponent('tameable');
log('tame', () => [tameable.tame(player), tameable.isTamed, tameable.tamedToPlayer === player, tameable.tame(player)]);
log('setOnFire', () => [pig.setOnFire(5, true), pig.getComponent('onfire')?.onFireTicksRemaining]);
log('extinguishFire', () => [pig.extinguishFire(true), pig.getComponent('onfire') === undefined]);`);
        expect(lines).toEqual([
            'addRider [true,1,true]',
            'ejectRiders 0',
            'leashTo [true,true]',
            'unleash false',
            'tame [true,true,true,false]',
            'setOnFire [true,100]',
            'extinguishFire [true,true]'
        ]);
    });

    it('checks property writes and events against the definition, with the errors BDS gives', () => {
        const { lines, world } = start(`${PIG}
log('get', () => [pig.getProperty('minecraft:climate_variant'), pig.getProperty('jsp:nothing')]);
log('set warm', () => { pig.setProperty('minecraft:climate_variant', 'warm'); return pig.getProperty('minecraft:climate_variant'); });
log('set purple', () => pig.setProperty('minecraft:climate_variant', 'purple'));
log('set a number', () => pig.setProperty('minecraft:climate_variant', 3));
log('set unknown', () => pig.setProperty('jsp:nothing', 1));
log('set out of range', () => pig.setProperty('jsp:size', 9));
log('reset', () => pig.resetProperty('minecraft:climate_variant'));
log('reset unknown', () => pig.resetProperty('jsp:nothing'));
log('trigger', () => pig.triggerEvent('minecraft:entity_born'));
log('trigger unknown', () => pig.triggerEvent('jsp:nothing'));`);
        expect(lines).toEqual([
            'get ["temperate",null]',
            'set warm "warm"',
            'set purple ! InvalidArgumentError: Invalid type passed to argument [1]. Expected type: enum property',
            'set a number ! InvalidArgumentError: Invalid type passed to argument [0]. Expected type: string property',
            'set unknown ! InvalidArgumentError: Invalid value passed to argument [0]. Property "jsp:nothing" does not exist on Entity of type "minecraft:pig".',
            'set out of range ! ArgumentOutOfBoundsError: Unsupported or out of bounds value passed to function argument [1]: value, Value: 9, Argument bounds: [1, 5]',
            'reset "temperate"',
            'reset unknown ! Error: Property "jsp:nothing" does not exist on Entity of type "minecraft:pig".',
            'trigger undefined',
            'trigger unknown ! InvalidArgumentError: Invalid value passed to argument [0]. The event jsp:nothing does not exist on minecraft:pig'
        ]);
        expect(world.entitySystems.triggered.map(({ event }) => event)).toEqual(['minecraft:entity_born']);
    });

    it("keeps a player's experience on Bedrock's curve", () => {
        const { lines } = start(`${PLAYER}
log('add 10', () => [player.addExperience(10), player.level, player.xpEarnedAtCurrentLevel, player.totalXpNeededForNextLevel]);
log('add 3 levels', () => [player.addLevels(3), player.getTotalXp()]);
log('take 10 levels', () => [player.addLevels(-10), player.getTotalXp()]);
log('add 31 levels', () => [player.addLevels(31), player.getTotalXp(), player.totalXpNeededForNextLevel]);
log('reset', () => { player.resetLevel(); return [player.level, player.getTotalXp()]; });`);
        expect(lines).toEqual([
            'add 10 [10,1,3,9]',
            'add 3 levels [4,45]',
            'take 10 levels [0,0]',
            'add 31 levels [31,1507,121]',
            'reset [0,0]'
        ]);
    });

    it("sends a player's client the camera, HUD, input, cooldown and aim assist calls", () => {
        const { lines, world, player } = start(
            `${PLAYER}
log('setCamera', () => player.camera.setCamera('minecraft:free', { location: { x: 1, y: 2, z: 3 } }));
log('unknown preset', () => player.camera.setCamera('jsp:nothing'));
log('shake too hard', () => player.camera.addShake({ intensity: 9, duration: 1, type: 'Positional' }));
log('control scheme on a free camera', () => { player.setControlScheme('CameraRelative'); return player.getControlScheme(); });
player.camera.clear();
log('control scheme on first person', () => player.setControlScheme('PlayerRelative'));
const display = player.onScreenDisplay;
log('hud', () => { display.setHudVisibility(0, [1, 3]); return [display.getHiddenHudElements(), display.isForcedHidden(3)]; });
log('hideAllExcept', () => { display.hideAllExcept([2]); return display.getHiddenHudElements().length; });
log('movement off', () => { player.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, false); return player.inputPermissions.isPermissionCategoryEnabled(InputPermissionCategory.Movement); });
log('cooldown', () => { player.startItemCooldown('jsp:wand', 40); return player.getItemCooldown('jsp:wand'); });
log('aim assist', () => { player.getAimAssist().set({ presetId: 'minecraft:aim_assist_default' }); return player.getAimAssist().settings; });
log('unknown aim assist', () => player.getAimAssist().set({ presetId: 'jsp:nothing' }));
log('chat name', () => { player.chatNamePrefix = '[a] '; return player.chatDisplayName; });
log('input', () => [player.inputInfo.getMovementVector(), player.inputInfo.getButtonState('Jump'), player.inputInfo.lastInputModeUsed]);
log('client', () => [player.clientSystemInfo.locale, player.clientSystemInfo.platformType, player.graphicsMode]);
system.runTimeout(() => log('cooldown later', () => player.getItemCooldown('jsp:wand')), 10);`,
            12
        );
        expect(lines).toEqual([
            'setCamera undefined',
            'unknown preset ! Error: Invalid camera preset.',
            'shake too hard ! ArgumentOutOfBoundsError: Unsupported or out of bounds value passed to function argument [0]: shakeCameraOptions.intensity, Value: 9, Argument max: 4',
            'control scheme on a free camera "CameraRelative"',
            "control scheme on first person ! InvalidArgumentError: Invalid value passed to argument [0]. Control Scheme 'PlayerRelative' is not allowed for current camera: [minecraft:first_person]",
            'hud [[1,3],true]',
            'hideAllExcept 12',
            'movement off false',
            'cooldown 40',
            'aim assist {"distance":8,"presetId":"minecraft:aim_assist_default","targetMode":"Angle","viewAngle":{"x":50,"y":50}}',
            "unknown aim assist ! InvalidArgumentError: Invalid value passed to argument [0]. Invalid provided value to argument 'jsp:nothing'.",
            'chat name "[a] Steve"',
            'input [{"x":0,"y":1},"Pressed","KeyboardAndMouse"]',
            'client ["en_US","Desktop","Fancy"]',
            'cooldown later 30'
        ]);
        const kinds = world.entitySystems.sent
            .filter((each) => each.player === player)
            .map(({ message }) => message.kind);
        expect(kinds).toEqual([
            'camera',
            'controlScheme',
            'camera',
            'hud',
            'hud',
            'inputLocks',
            'cooldown',
            'aimAssist'
        ]);
    });

    it("sends a player's client music, property overrides, script messages and camera splines", () => {
        const { lines, world, player } = start(
            `${PLAYER}
${PIG}
player.playMusic('music.game', { fade: 1, loop: true, volume: 0.5 });
log('negative fade', () => player.playMusic('music.game', { fade: -1 }));
player.stopMusic();
player.setPropertyOverrideForEntity(pig, 'minecraft:climate_variant', 'cold');
player.removePropertyOverrideForEntity(pig, 'minecraft:climate_variant');
player.clearPropertyOverridesForEntity(pig);
player.postClientMessage('jsp:hello', 'world');
const linear = new LinearSpline();
log('one point', () => { linear.controlPoints = [{ x: 1, y: 2, z: 3 }]; player.camera.playAnimation(linear, { totalTimeSeconds: 2, animation: { progressKeyFrames: [], rotationKeyFrames: [] } }); });
const catmull = new CatmullRomSpline();
log('two points', () => { catmull.controlPoints = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]; player.camera.playAnimation(catmull, { totalTimeSeconds: 1, animation: { progressKeyFrames: [], rotationKeyFrames: [] } }); });
catmull.controlPoints = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }];
log('late progress', () => player.camera.playAnimation(catmull, { totalTimeSeconds: 1, animation: { progressKeyFrames: [{ alpha: 0.5, timeSeconds: 1 }], rotationKeyFrames: [] } }));
log('late rotation', () => player.camera.playAnimation(catmull, { totalTimeSeconds: 1, animation: { progressKeyFrames: [], rotationKeyFrames: [{ rotation: { x: 1, y: 2, z: 3 }, timeSeconds: 1 }] } }));
player.camera.playAnimation(catmull, {
    totalTimeSeconds: 4,
    animation: {
        progressKeyFrames: [{ alpha: 0, timeSeconds: 0 }, { alpha: 1, timeSeconds: 4, easingFunc: 'InOutSine' }],
        rotationKeyFrames: [{ rotation: { x: 10, y: 20, z: 30 }, timeSeconds: 0 }]
    }
});`
        );
        expect(lines).toEqual([
            'negative fade ! PropertyOutOfBoundsError: Unsupported or out of bounds value set on Property: fade, Value: -1, Property min: 0',
            'one point ! Error: Linear needs at least 2 control points',
            'two points ! Error: CatmullRom needs at least 3 control points',
            'late progress ! Error: First progress key frame must be at time 0.0',
            'late rotation ! Error: First rotation key frame must be at time 0.0'
        ]);
        const pig = world.entitySystems.sent.find(({ message }) => message.kind === 'propertyOverride');
        const sent = world.entitySystems.sent.filter((each) => each.player === player).map(({ message }) => message);
        expect(sent).toEqual([
            { kind: 'music', action: 'play', track: 'music.game', volume: 0.5, fade: 1, loop: true },
            { kind: 'music', action: 'stop' },
            {
                kind: 'propertyOverride',
                entity: pig?.message.kind === 'propertyOverride' ? pig.message.entity : '',
                property: 'minecraft:climate_variant',
                value: 'cold'
            },
            expect.objectContaining({ kind: 'propertyOverride', property: 'minecraft:climate_variant' }),
            expect.objectContaining({ kind: 'propertyOverride', property: '' }),
            { kind: 'scriptMessage', id: 'jsp:hello', value: 'world' },
            {
                kind: 'camera',
                instruction: {
                    kind: 'spline',
                    type: 'catmullRom',
                    controlPoints: [
                        { x: 0, y: 0, z: 0 },
                        { x: 1, y: 0, z: 0 },
                        { x: 2, y: 0, z: 0 }
                    ],
                    totalTime: 4,
                    progressKeyFrames: [
                        { value: 0, time: 0 },
                        { value: 1, time: 4, easing: 'InOutSine' }
                    ],
                    rotationKeyFrames: [{ value: { x: 10, y: 20, z: 30 }, time: 0 }]
                }
            }
        ]);
    });

    it('reads and adds to the aim assist registry, and lists entity types', () => {
        const { lines, world } = start(`
const registry = world.getAimAssist();
log('presets', () => registry.getPresets().map((preset) => preset.identifier));
log('default', () => registry.getPreset('minecraft:aim_assist_default').getExcludedBlockTargets());
const settings = new AimAssistCategorySettings('jsp:category');
settings.setBlockPriorities({ 'minecraft:stone': 5 });
log('add', () => registry.addCategory(settings).getBlockPriorities());
log('add again', () => registry.addCategory(settings));
log('without a namespace', () => registry.addCategory(new AimAssistCategorySettings('plain')));
log('categories', () => registry.getCategories().map((category) => category.identifier));
log('types', () => [EntityTypes.get('pig')?.id, EntityTypes.get('pig')?.localizationKey, EntityTypes.get('jsp:nothing'), EntityTypes.getAll().length]);`);
        expect(lines).toEqual([
            'presets ["minecraft:aim_assist_default"]',
            'default ["minecraft:bedrock"]',
            'add {"minecraft:stone":5}',
            "add again ! Error: Aim assist category 'jsp:category' is already registered.",
            'without a namespace ! NamespaceNameError: string must be prefixed with a namespace (eg. namespace:value).',
            'categories ["minecraft:default","jsp:category"]',
            'types ["minecraft:pig","entity.pig.name",null,3]'
        ]);
        expect(world.entitySystems.added).toHaveLength(1);
    });

    it("refuses a spawn point outside the world and moves a player's own", () => {
        const { lines } = start(`${PLAYER}
log('none', () => player.getSpawnPoint());
log('set', () => { player.setSpawnPoint({ dimension: player.dimension, x: 3, y: -60, z: 4 }); const point = player.getSpawnPoint(); return [point.x, point.y, point.z, point.dimension.id]; });
log('too high', () => player.setSpawnPoint({ dimension: player.dimension, x: 3, y: 1000, z: 4 }));
log('clear', () => { player.setSpawnPoint(); return player.getSpawnPoint(); });`);
        expect(lines).toEqual([
            'none undefined',
            'set [3,-60,4,"minecraft:overworld"]',
            'too high ! LocationOutOfWorldBoundariesError: Failed to set the player spawn location. Trying to access location (3.0, 1000.0, 4.0) which is outside of the world boundaries.',
            'clear undefined'
        ]);
    });
});

describe('the experience curve', () => {
    it('carries points into and out of levels and never goes below 0', () => {
        expect(addPoints({ level: 0, progress: 0 }, 10)).toEqual({ level: 1, progress: 3 / 9 });
        expect(addPoints({ level: 1, progress: 3 / 9 }, -5)).toEqual({ level: 0, progress: 5 / 7 });
        expect(addPoints({ level: 0, progress: 0 }, -5)).toEqual({ level: 0, progress: 0 });
        expect(pointsToReach(31)).toBe(1507);
        expect(pointsAtLevel(addLevels({ level: 1, progress: 1 / 3 }, 3))).toBe(5);
        expect(addLevels({ level: 4, progress: 0.5 }, -10)).toEqual({ level: 0, progress: 0 });
    });
});

describe('the view rays', () => {
    it('walks the blocks a ray passes, entering each through a face', () => {
        const visited: string[] = [];
        walkRay({ x: 0.5, y: 2.5, z: 0.5 }, { x: 0, y: -1, z: 0 }, 3, (hit) => {
            visited.push(`${hit.block.y} ${hit.face} ${hit.faceLocation.y}`);
            return false;
        });
        expect(visited).toEqual(['1 Up 1', '0 Up 1', '-1 Up 1']);
    });

    it('measures where a ray meets a box, and misses one beside it', () => {
        const box = { min: { x: 2, y: 0, z: 0 }, max: { x: 3, y: 1, z: 1 } };
        expect(rayBoxDistance({ x: 0, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, box)).toBe(2);
        expect(rayBoxDistance({ x: 0, y: 0.5, z: 5 }, { x: 1, y: 0, z: 0 }, box)).toBeUndefined();
    });
});
