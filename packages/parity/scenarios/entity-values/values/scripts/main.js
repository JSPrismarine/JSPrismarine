/**
 * The `entity-values` scenario: what the entity components a mob's definition gives it read
 * back, the members of `Entity` that read and move an entity, and the members of `Player` that
 * read and write a player's experience, spawn point, permissions, camera, HUD and input.
 *
 * A behavior pack scenario has no client, so the pack registers the GameTest `jsp:values`, and
 * the capture runs it with `/gametest run` once the pack is ready. Ticks are counted from the
 * tick the test starts. `structures/jsp/values.mcstructure` is a 3 by 3 by 3 structure of air.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import {
    AimAssistCategorySettings,
    AimAssistPresetSettings,
    EntityTypes,
    InputPermissionCategory,
    ItemStack,
    system,
    world
} from '@minecraft/server';
import { register } from '@minecraft/server-gametest';

const PACK = 'values';
let seq = 0;
let start = 0;

/** Logs one observation, stamped with the pack's sequence number and the tick since the test started. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(
        `DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick - start, event, ...observed })}`
    );
};

/** A number rounded to four places, so a float's last digits do not decide a row. */
const round = (value) => (typeof value === 'number' ? Math.round(value * 10000) / 10000 : value);

/** A value as plain data: an entity by its type, a stack by its type and amount, a permutation by its block. */
const plain = (value, depth = 0) => {
    if (value === undefined) return null;
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
    if (typeof value === 'number') return round(value);
    if (Array.isArray(value)) return value.map((each) => plain(each, depth + 1));
    if (typeof value !== 'object' || depth > 3) return String(value);
    if (typeof value.getAllStates === 'function') return { block: value.type.id };
    if (typeof value.typeId === 'string' && typeof value.amount === 'number') {
        return { item: value.typeId, amount: value.amount };
    }
    if (typeof value.typeId === 'string' && typeof value.id === 'string') return { entity: value.typeId };
    const out = {};
    const names = new Set(Object.keys(value));
    for (let proto = Object.getPrototypeOf(value); proto && proto !== Object.prototype; proto = proto.__proto__) {
        for (const name of Object.getOwnPropertyNames(proto)) {
            const descriptor = Object.getOwnPropertyDescriptor(proto, name);
            if (descriptor?.get !== undefined) names.add(name);
        }
    }
    for (const name of [...names].sort()) {
        try {
            out[name] = plain(value[name], depth + 1);
        } catch (error) {
            out[name] = `throws ${String(error)}`;
        }
    }
    return out;
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        record(event, { value: plain(call()) });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** The methods of a component that read lists, which `plain` does not call. */
const LIST_METHODS = [
    'getDropItems',
    'getFeedItems',
    'getBreatheBlocks',
    'getNonBreatheBlocks',
    'getFamilyTypes',
    'getRiders',
    'getSeats',
    'getTypeFamilies'
];

/** Every property of a component, and what its list methods return. */
const dumpComponent = (component) => {
    const out = plain(component);
    for (const method of LIST_METHODS) {
        if (typeof component[method] !== 'function') continue;
        try {
            const found = component[method]();
            out[`${method}()`] = plain(
                method === 'getFeedItems'
                    ? found.map((each) => ({
                          ...plain(each),
                          ...(typeof each.getEffects === 'function' ? { effects: plain(each.getEffects()) } : {})
                      }))
                    : found
            );
        } catch (error) {
            out[`${method}()`] = `throws ${String(error)}`;
        }
    }
    delete out.entity;
    // A container is read by the `entity-components` scenario.
    delete out.container;
    // BDS lists a type's families in no fixed order.
    if (Array.isArray(out['getTypeFamilies()'])) out['getTypeFamilies()'].sort();
    return out;
};

/** The attribute components, which the `entity-components` and `entity-attributes` scenarios read. */
const SKIPPED = ['minecraft:health', 'minecraft:movement'];

/** The attribute components a mob or a player can have, which `getComponents` lists here without. */
const ATTRIBUTES = [
    'minecraft:health',
    'minecraft:movement',
    'minecraft:player.exhaustion',
    'minecraft:player.hunger',
    'minecraft:player.saturation'
];

/** The mobs a spawn gives a random variant, color, profession or strength. */
const RANDOM_MOBS = [
    'minecraft:cat',
    'minecraft:parrot',
    'minecraft:llama',
    'minecraft:tropicalfish',
    'minecraft:axolotl',
    'minecraft:horse'
];

/**
 * The components a spawn adds or leaves out at random: a mob may spawn a baby, which has an
 * ageable component, a smaller scale and other families.
 */
const BABY_COMPONENTS = ['minecraft:ageable', 'minecraft:is_baby', 'minecraft:scale', 'minecraft:type_family'];

/** The mobs that spawn a baby at random. */
const BABY_MOBS = [
    'minecraft:pig',
    'minecraft:horse',
    'minecraft:wolf',
    'minecraft:cat',
    'minecraft:sheep',
    'minecraft:zombie',
    'minecraft:chicken',
    'minecraft:llama',
    'minecraft:strider',
    'minecraft:axolotl'
];

/** The components whose values a random spawn picks. */
const RANDOM_COMPONENTS = [
    'minecraft:variant',
    'minecraft:mark_variant',
    'minecraft:skin_id',
    'minecraft:color',
    'minecraft:color2',
    'minecraft:strength',
    'minecraft:type_family'
];

/** The mobs whose components the scenario reads. */
const MOBS = [
    'minecraft:pig',
    'minecraft:horse',
    'minecraft:wolf',
    'minecraft:cat',
    'minecraft:parrot',
    'minecraft:sheep',
    'minecraft:zombie',
    'minecraft:chest_minecart',
    'minecraft:npc',
    'minecraft:arrow',
    'minecraft:snowball',
    'minecraft:chicken',
    'minecraft:llama',
    'minecraft:boat',
    'minecraft:minecart',
    'minecraft:cod',
    'minecraft:phantom',
    'minecraft:tropicalfish',
    'minecraft:strider',
    'minecraft:armor_stand',
    'minecraft:axolotl',
    'minecraft:bat'
];

attempt('EntityTypes.get pig early', () => EntityTypes.get('minecraft:pig')?.id ?? null);

system.beforeEvents.startup.subscribe(({ aimAssistRegistry }) => {
    attempt('startup aimAssistRegistry', () => aimAssistRegistry !== undefined);
});

register('jsp', 'values', (test) => {
    start = system.currentTick;
    attempt('EntityTypes.get pig', () => {
        const type = EntityTypes.get('minecraft:pig');
        return { id: type.id, localizationKey: type.localizationKey };
    });
    attempt('EntityTypes.get pig without a namespace', () => EntityTypes.get('pig')?.id ?? null);
    attempt('EntityTypes.get of an unknown type', () => EntityTypes.get('jsp:nothing') ?? null);
    attempt('EntityTypes.getAll', () => {
        const all = EntityTypes.getAll();
        return {
            hasPig: all.some((type) => type.id === 'minecraft:pig'),
            hasPlayer: all.some((type) => type.id === 'minecraft:player'),
            sorted:
                all.map((type) => type.id).join() ===
                all
                    .map((type) => type.id)
                    .sort()
                    .join()
        };
    });
    attempt('EntityTypes.get zombie localizationKey', () => EntityTypes.get('minecraft:zombie').localizationKey);

    const registry = world.getAimAssist();
    attempt('aim assist presets', () => registry.getPresets().map((preset) => preset.identifier));
    attempt('aim assist categories', () => registry.getCategories().map((category) => category.identifier));
    attempt('aim assist default preset', () => {
        const preset = registry.getPreset('minecraft:aim_assist_default');
        return preset === undefined
            ? null
            : {
                  ...plain(preset),
                  getExcludedBlockTagTargets: preset.getExcludedBlockTagTargets(),
                  getExcludedBlockTargets: preset.getExcludedBlockTargets(),
                  getExcludedEntityTargets: preset.getExcludedEntityTargets(),
                  getExcludedEntityTypeFamilyTargets: preset.getExcludedEntityTypeFamilyTargets(),
                  getItemSettings: preset.getItemSettings(),
                  getLiquidTargetingItems: preset.getLiquidTargetingItems()
              };
    });
    attempt('aim assist default category', () => {
        const category = registry.getCategory('minecraft:default');
        return category === undefined
            ? null
            : {
                  ...plain(category),
                  getBlockPriorities: category.getBlockPriorities(),
                  getEntityPriorities: category.getEntityPriorities(),
                  getBlockTagPriorities: category.getBlockTagPriorities(),
                  getEntityTypeFamilyPriorities: category.getEntityTypeFamilyPriorities()
              };
    });
    attempt('AimAssistCategorySettings', () => {
        const settings = new AimAssistCategorySettings('jsp:category');
        const before = plain(settings);
        settings.defaultBlockPriority = 3;
        settings.setBlockPriorities({ 'minecraft:stone': 5 });
        settings.setEntityPriorities({ 'minecraft:pig': 7 });
        settings.setBlockTagPriorities({ wood: 2 });
        settings.setEntityTypeFamilyPriorities({ mob: 4 });
        return {
            before,
            after: plain(settings),
            blocks: settings.getBlockPriorities(),
            entities: settings.getEntityPriorities(),
            tags: settings.getBlockTagPriorities(),
            families: settings.getEntityTypeFamilyPriorities()
        };
    });
    attempt('AimAssistPresetSettings', () => {
        const settings = new AimAssistPresetSettings('jsp:preset');
        const before = {
            ...plain(settings),
            blocks: settings.getExcludedBlockTargets() ?? null,
            items: settings.getItemSettings(),
            liquid: settings.getLiquidTargetingItems() ?? null
        };
        settings.defaultItemSettings = 'jsp:category';
        settings.handSettings = 'jsp:category';
        settings.setExcludedBlockTargets(['minecraft:stone']);
        settings.setExcludedEntityTargets(['minecraft:pig']);
        settings.setItemSettings({ 'minecraft:stick': 'jsp:category' });
        settings.setLiquidTargetingItems(['minecraft:bucket']);
        return {
            before,
            after: plain(settings),
            blocks: settings.getExcludedBlockTargets(),
            entities: settings.getExcludedEntityTargets(),
            items: settings.getItemSettings(),
            liquid: settings.getLiquidTargetingItems()
        };
    });
    attempt('addCategory after startup', () => registry.addCategory(new AimAssistCategorySettings('jsp:late')));
    attempt('getPreset of an unknown preset', () => registry.getPreset('jsp:none') ?? null);

    const spawned = new Map();
    for (const typeId of MOBS) {
        try {
            // A mob may spawn a baby, which lacks an adult's components, so a baby is spawned again.
            let entity = test.spawn(typeId, { x: 1, y: 2, z: 1 });
            for (let tries = 0; tries < 50 && entity.getComponent('minecraft:is_baby') !== undefined; tries++) {
                entity.remove();
                entity = test.spawn(typeId, { x: 1, y: 2, z: 1 });
            }
            spawned.set(typeId, entity);
        } catch (error) {
            record(`spawn ${typeId}`, { error: String(error) });
        }
    }
    for (const [typeId, entity] of spawned) {
        attempt(`${typeId} getComponents`, () =>
            entity
                .getComponents()
                .map((component) => component.typeId)
                .filter((id) => !BABY_MOBS.includes(typeId) || !BABY_COMPONENTS.includes(id))
                .filter((id) => !ATTRIBUTES.includes(id))
                .sort()
        );
    }
    for (const [typeId, entity] of spawned) {
        // BDS lists an entity's components in no fixed order.
        const components = entity.getComponents().sort((a, b) => (a.typeId < b.typeId ? -1 : 1));
        for (const component of components) {
            if (SKIPPED.includes(component.typeId)) continue;
            if (RANDOM_MOBS.includes(typeId) && RANDOM_COMPONENTS.includes(component.typeId)) continue;
            if (BABY_MOBS.includes(typeId) && BABY_COMPONENTS.includes(component.typeId)) continue;
            attempt(`${typeId} ${component.typeId}`, () => dumpComponent(component));
        }
    }

    const pig = spawned.get('minecraft:pig');
    attempt('pig component entity', () => pig.getComponent('minecraft:type_family').entity === pig);
    attempt('pig hasTypeFamily mob', () => pig.getComponent('type_family').hasTypeFamily('mob'));
    attempt('pig hasTypeFamily zombie', () => pig.getComponent('type_family').hasTypeFamily('zombie'));
    attempt('pig localizationKey', () => pig.localizationKey);
    attempt('pig nameplate', () => [pig.nameplateDepthTested, pig.nameplateRenderDistance]);
    attempt('pig nameplate set', () => {
        pig.nameplateDepthTested = false;
        pig.nameplateRenderDistance = 12.5;
        return [pig.nameplateDepthTested, pig.nameplateRenderDistance];
    });
    attempt('pig target', () => pig.target ?? null);
    attempt('pig states', () => ({
        isInWater: pig.isInWater,
        isClimbing: pig.isClimbing,
        isSleeping: pig.isSleeping,
        isSprinting: pig.isSprinting,
        isSwimming: pig.isSwimming
    }));
    attempt('pig getAABB', () => {
        const box = pig.getAABB();
        const location = pig.location;
        return {
            extent: box.extent,
            centerAboveFeet: round(box.center.y - location.y),
            centered: round(box.center.x - location.x) === 0 && round(box.center.z - location.z) === 0
        };
    });
    attempt('pig getProperty climate_variant', () => pig.getProperty('minecraft:climate_variant'));
    attempt('pig getProperty of an unknown property', () => pig.getProperty('jsp:nothing') ?? null);
    attempt('pig setProperty climate_variant warm', () => {
        pig.setProperty('minecraft:climate_variant', 'warm');
        return pig.getProperty('minecraft:climate_variant');
    });
    attempt('pig setProperty climate_variant to a value it lacks', () =>
        pig.setProperty('minecraft:climate_variant', 'purple')
    );
    attempt('pig setProperty climate_variant to a number', () => pig.setProperty('minecraft:climate_variant', 3));
    attempt('pig setProperty of an unknown property', () => pig.setProperty('jsp:nothing', 1));
    attempt('pig resetProperty climate_variant', () => [
        pig.resetProperty('minecraft:climate_variant'),
        pig.getProperty('minecraft:climate_variant')
    ]);
    attempt('pig resetProperty of an unknown property', () => pig.resetProperty('jsp:nothing'));
    attempt('pig matches type', () => pig.matches({ type: 'minecraft:pig' }));
    attempt('pig matches families', () => [pig.matches({ families: ['mob'] }), pig.matches({ families: ['monster'] })]);
    attempt('pig matches location', () => pig.matches({ location: pig.location, maxDistance: 1 }));
    attempt('pig triggerEvent of an unknown event', () => pig.triggerEvent('jsp:nothing'));
    attempt('pig triggerEvent entity_born', () => {
        pig.triggerEvent('minecraft:entity_born');
        return pig.getComponent('minecraft:is_baby') !== undefined;
    });
    attempt('pig ageable after entity_born', () => {
        const ageable = pig.getComponent('minecraft:ageable');
        return ageable === undefined ? null : dumpComponent(ageable);
    });
    attempt('pig triggerEvent ageable_grow_up', () => {
        pig.triggerEvent('ageable_grow_up');
        return pig.getComponent('minecraft:is_baby') !== undefined;
    });
    attempt('pig setOnFire', () => pig.setOnFire(5, true));
    attempt('pig onfire', () => pig.getComponent('minecraft:onfire')?.onFireTicksRemaining ?? null);
    attempt('pig extinguishFire', () => [pig.extinguishFire(true), pig.getComponent('onfire') ?? null]);
    attempt('pig extinguishFire when not burning', () => pig.extinguishFire(false));
    attempt('pig setRotation', () => {
        pig.setRotation({ x: 10, y: 90 });
        return pig.getRotation();
    });
    attempt('pig lookAt', () => {
        pig.lookAt({ x: pig.location.x + 5, y: pig.location.y, z: pig.location.z });
        return pig.getRotation();
    });
    attempt('pig getVelocity at rest', () => pig.getVelocity());
    // BDS applies an impulse in the next tick, and the motion after it depends on the ground, so only the calls are recorded.
    attempt('pig applyImpulse', () => pig.applyImpulse({ x: 0, y: 0.5, z: 0 }));
    attempt('pig clearVelocity', () => pig.clearVelocity());
    attempt('pig applyKnockback', () => pig.applyKnockback({ x: 0.4, z: 0 }, 0.3));
    attempt('pig tryTeleport', () => {
        const target = test.worldLocation({ x: 1, y: 2, z: 1 });
        return pig.tryTeleport(target);
    });
    attempt('pig tryTeleport into the ground', () =>
        pig.tryTeleport(test.worldLocation({ x: 1, y: -2, z: 1 }), { checkForBlocks: true })
    );
    attempt('pig playAnimation', () => pig.playAnimation('animation.pig.baby_transform'));
    attempt('pig addItem', () => pig.addItem(new ItemStack('minecraft:apple')));

    const horse = spawned.get('minecraft:horse');
    const wolf = spawned.get('minecraft:wolf');
    const player = test.spawnSimulatedPlayer({ x: 1, y: 2, z: 1 }, 'Tester');
    attempt('wolf tame', () => {
        const tameable = wolf.getComponent('tameable');
        const result = tameable.tame(player);
        return {
            result,
            isTamed: tameable.isTamed,
            toPlayer: tameable.tamedToPlayer === player,
            id: tameable.tamedToPlayerId === player.id,
            isTamedComponent: wolf.getComponent('is_tamed') !== undefined
        };
    });
    attempt('wolf is_tamed component', () => {
        const tamed = wolf.getComponent('is_tamed');
        return { toPlayer: tamed?.tamedToPlayer === player, id: tamed?.tamedToPlayerId === player.id };
    });
    attempt('horse tamemount tameToPlayer', () => {
        const mount = horse.getComponent('tamemount');
        const result = mount.tameToPlayer(false, player);
        return {
            result,
            isTamed: mount.isTamed,
            isTamedToPlayer: mount.isTamedToPlayer,
            toPlayer: mount.tamedToPlayer === player
        };
    });
    attempt('pig leashTo', () => {
        const leash = pig.getComponent('leashable');
        leash.leashTo(player);
        return {
            isLeashed: leash.isLeashed,
            holder: leash.leashHolder === player,
            holderId: leash.leashHolderEntityId === player.id
        };
    });
    attempt('pig unleash', () => {
        const leash = pig.getComponent('leashable');
        leash.unleash();
        return { isLeashed: leash.isLeashed, holder: leash.leashHolder ?? null };
    });
    attempt('horse addRider', () => {
        const rideable = horse.getComponent('rideable');
        const result = rideable.addRider(player);
        return {
            result,
            riders: rideable.getRiders().map((rider) => rider.typeId),
            riding: player.getComponent('riding')?.entityRidingOn === horse
        };
    });
    attempt('horse ejectRider', () => {
        const rideable = horse.getComponent('rideable');
        rideable.ejectRider(player);
        return { riders: rideable.getRiders().length, riding: player.getComponent('riding') ?? null };
    });
    attempt('boat addRider pig and ejectRiders', () => {
        const rideable = spawned.get('minecraft:boat').getComponent('rideable');
        const added = rideable.addRider(spawned.get('minecraft:chicken'));
        const count = rideable.getRiders().length;
        rideable.ejectRiders();
        return { added, count, after: rideable.getRiders().length };
    });
    attempt('arrow projectile owner', () => {
        const projectile = spawned.get('minecraft:arrow').getComponent('projectile');
        const before = projectile.owner ?? null;
        projectile.owner = player;
        return { before, after: projectile.owner === player };
    });
    attempt('arrow projectile set', () => {
        const projectile = spawned.get('minecraft:arrow').getComponent('projectile');
        projectile.gravity = 0.1;
        projectile.airInertia = 0.5;
        projectile.hitParticle = 'iconcrack';
        return [projectile.gravity, projectile.airInertia, projectile.hitParticle];
    });
    attempt('snowball shoot', () => {
        const snowball = spawned.get('minecraft:snowball');
        snowball.getComponent('projectile').shoot({ x: 0, y: 1, z: 0 });
        return snowball.getVelocity();
    });
    attempt('npc set', () => {
        const npc = spawned.get('minecraft:npc').getComponent('npc');
        npc.name = 'Guide';
        npc.skinIndex = 3;
        npc.defaultScene = 'jsp:scene';
        return [npc.name, npc.skinIndex, npc.defaultScene];
    });
    attempt('sheep color set', () => {
        const color = spawned.get('minecraft:sheep').getComponent('color');
        color.value = 5;
        return color.value;
    });
    attempt('cod airSupply set', () => {
        const breathable = spawned.get('minecraft:cod').getComponent('breathable');
        breathable.airSupply = 40;
        return [breathable.airSupply, breathable.canBreathe];
    });

    attempt('player experience', () => ({
        level: player.level,
        total: player.getTotalXp(),
        earned: player.xpEarnedAtCurrentLevel,
        needed: player.totalXpNeededForNextLevel
    }));
    attempt('player addExperience 10', () => [
        player.addExperience(10),
        player.level,
        player.getTotalXp(),
        player.xpEarnedAtCurrentLevel,
        player.totalXpNeededForNextLevel
    ]);
    attempt('player addLevels 3', () => [player.addLevels(3), player.level, player.getTotalXp()]);
    attempt('player addLevels -10', () => [player.addLevels(-10), player.level, player.getTotalXp()]);
    attempt('player addExperience -5', () => [player.addExperience(-5), player.level, player.getTotalXp()]);
    attempt('player addLevels 31', () => [player.addLevels(31), player.getTotalXp(), player.totalXpNeededForNextLevel]);
    attempt('player resetLevel', () => {
        player.resetLevel();
        return [player.level, player.getTotalXp(), player.xpEarnedAtCurrentLevel];
    });
    attempt('player states', () => ({
        isFlying: player.isFlying,
        isGliding: player.isGliding,
        isJumping: player.isJumping,
        isEmoting: player.isEmoting
    }));
    attempt('player localizationKey', () => player.localizationKey);
    attempt('player setSpawnPoint', () => {
        player.setSpawnPoint({ dimension: player.dimension, x: 3, y: -60, z: 4 });
        const point = player.getSpawnPoint();
        return { x: point.x, y: point.y, z: point.z, dimension: point.dimension.id };
    });
    attempt('player setSpawnPoint out of the world', () =>
        player.setSpawnPoint({ dimension: player.dimension, x: 3, y: 1000, z: 4 })
    );
    attempt('player setSpawnPoint undefined', () => {
        player.setSpawnPoint();
        return player.getSpawnPoint() ?? null;
    });
    attempt('player permission levels', () => [player.commandPermissionLevel, player.playerPermissionLevel]);
    attempt('player commandPermissionLevel set', () => {
        player.commandPermissionLevel = 1;
        return player.commandPermissionLevel;
    });
    attempt('player clientSystemInfo', () => {
        const info = player.clientSystemInfo;
        return { locale: info.locale, maxRenderDistance: info.maxRenderDistance, platformType: info.platformType };
    });
    attempt('player inputInfo', () => {
        const input = player.inputInfo;
        return {
            lastInputModeUsed: input.lastInputModeUsed,
            touchOnlyAffectsHotbar: input.touchOnlyAffectsHotbar,
            movement: input.getMovementVector(),
            jump: input.getButtonState('Jump'),
            sneak: input.getButtonState('Sneak')
        };
    });
    attempt('player inputPermissions', () => {
        const permissions = player.inputPermissions;
        const out = {};
        for (const [name, value] of Object.entries(InputPermissionCategory)) {
            if (typeof value === 'number') out[name] = permissions.isPermissionCategoryEnabled(value);
        }
        return out;
    });
    attempt('player setPermissionCategory Movement off', () => {
        player.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, false);
        return [
            player.inputPermissions.isPermissionCategoryEnabled(InputPermissionCategory.Movement),
            player.inputPermissions.isPermissionCategoryEnabled(InputPermissionCategory.LateralMovement),
            player.inputPermissions.isPermissionCategoryEnabled(InputPermissionCategory.Jump)
        ];
    });
    attempt('player setPermissionCategory Movement on', () => {
        player.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, true);
        return player.inputPermissions.isPermissionCategoryEnabled(InputPermissionCategory.Movement);
    });
    attempt('player camera isValid', () => player.camera.isValid);
    attempt('player camera calls', () => {
        const camera = player.camera;
        camera.setCamera('minecraft:free', { location: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0 } });
        camera.fade({ fadeTime: { fadeInTime: 1, holdTime: 1, fadeOutTime: 1 } });
        camera.setFov({ fov: 60 });
        camera.setDefaultCamera('minecraft:first_person');
        camera.clear();
        camera.stopShaking();
        return 'ok';
    });
    attempt('player camera setCamera of an unknown preset', () => player.camera.setCamera('jsp:nothing'));
    attempt('player camera addShake out of bounds', () =>
        player.camera.addShake({ intensity: 9, duration: 1, type: 'Positional' })
    );
    attempt('player camera addShake', () => player.camera.addShake({ intensity: 1, duration: 1, type: 'Positional' }));
    attempt('player getItemCooldown', () => player.getItemCooldown('jsp:wand'));
    attempt('player startItemCooldown', () => {
        player.startItemCooldown('jsp:wand', 40);
        return player.getItemCooldown('jsp:wand');
    });
    attempt('player getControlScheme', () => player.getControlScheme());
    attempt('player setControlScheme', () => {
        player.setControlScheme('CameraRelative');
        return player.getControlScheme();
    });
    attempt('player setControlScheme undefined', () => {
        player.setControlScheme();
        return player.getControlScheme();
    });
    attempt('player getPing', () => typeof player.getPing());
    attempt('player getSplitScreenSlot', () => player.getSplitScreenSlot() ?? null);
    attempt('player graphicsMode', () => player.graphicsMode);
    attempt('player persistentId', () => typeof player.persistentId);
    attempt('player chat names', () => [
        player.chatDisplayName,
        player.chatNamePrefix ?? null,
        player.chatNameSuffix ?? null,
        player.chatMessagePrefix ?? null
    ]);
    attempt('player chat names set', () => {
        player.chatNamePrefix = '[a] ';
        player.chatNameSuffix = ' [b]';
        player.chatMessagePrefix = '> ';
        return [player.chatDisplayName, player.chatNamePrefix, player.chatNameSuffix, player.chatMessagePrefix];
    });
    attempt('player getAimAssist', () => plain(player.getAimAssist().settings));
    attempt('player getAimAssist set', () => {
        player.getAimAssist().set({ presetId: 'minecraft:aim_assist_default', distance: 8 });
        return plain(player.getAimAssist().settings);
    });
    attempt('player getAimAssist set an unknown preset', () => player.getAimAssist().set({ presetId: 'jsp:nothing' }));
    attempt('player hud', () => {
        const display = player.onScreenDisplay;
        const before = display.getHiddenHudElements();
        display.setHudVisibility(0, [1, 3]);
        const hidden = display.getHiddenHudElements();
        const forced = [display.isForcedHidden(1), display.isForcedHidden(2)];
        display.hideAllExcept([2]);
        const allBut = display.getHiddenHudElements();
        display.setHudVisibility(1, [4]);
        const shown = display.getHiddenHudElements();
        display.resetHudElementsVisibility();
        return { before, hidden, forced, allBut, shown, reset: display.getHiddenHudElements() };
    });
    attempt('player cursor_inventory', () => {
        const cursor = player.getComponent('cursor_inventory');
        return { item: cursor?.item ?? null, clear: cursor?.clear() ?? null };
    });
    attempt('player ender_inventory', () => {
        const ender = player.getComponent('minecraft:ender_inventory');
        return ender === undefined ? null : { size: ender.container.size, empty: ender.container.emptySlotsCount };
    });
    attempt('player inventory component', () => {
        const inventory = player.getComponent('inventory');
        return {
            additionalSlotsPerStrength: inventory.additionalSlotsPerStrength,
            canBeSiphonedFrom: inventory.canBeSiphonedFrom,
            containerType: inventory.containerType,
            inventorySize: inventory.inventorySize,
            private: inventory.private,
            restrictToOwner: inventory.restrictToOwner
        };
    });
    attempt('player getComponents', () =>
        player
            .getComponents()
            .map((component) => component.typeId)
            .filter((id) => !ATTRIBUTES.includes(id))
            .sort()
    );
    attempt('player sounds and music', () => {
        player.playMusic('music.game', { fade: 1, loop: true, volume: 0.5 });
        player.queueMusic('music.game');
        player.stopMusic();
        player.stopSound('random.click');
        player.stopAllSounds();
        player.postClientMessage('jsp:hello', 'world');
        return 'ok';
    });
    attempt('player eatItem', () => player.eatItem(new ItemStack('minecraft:apple')));
    attempt('player addItem', () => [
        plain(player.addItem(new ItemStack('minecraft:stick', 3))),
        player.getComponent('inventory').container.getItem(0)?.typeId ?? null
    ]);
    attempt('player property override', () => {
        player.setPropertyOverrideForEntity(pig, 'minecraft:climate_variant', 'cold');
        player.removePropertyOverrideForEntity(pig, 'minecraft:climate_variant');
        player.clearPropertyOverridesForEntity(pig);
        return pig.getProperty('minecraft:climate_variant');
    });
    attempt('player getBlockFromViewDirection', () => {
        player.setRotation({ x: 90, y: 0 });
        const hit = player.getBlockFromViewDirection({ maxDistance: 10 });
        return hit === undefined ? null : hit.face;
    });
    attempt(
        'player getBlockFromViewDirection too short',
        () => player.getBlockFromViewDirection({ maxDistance: 0.5 }) ?? null
    );
    attempt('player getEntitiesFromViewDirection', () =>
        player.getEntitiesFromViewDirection({ maxDistance: 10 }).map((hit) => hit.entity.typeId)
    );

    // The crowd pushes the armor stand around, so it is left alone to settle.
    const stand = spawned.get('minecraft:armor_stand');
    for (const entity of spawned.values()) if (entity !== stand && entity.isValid) entity.remove();
    stand.teleport(test.worldLocation({ x: 0.5, y: 1, z: 0.5 }));

    system.runTimeout(() => {
        attempt('armor stand states', () => ({
            isOnGround: stand.isOnGround,
            isFalling: stand.isFalling,
            isInWater: stand.isInWater
        }));
        attempt('armor stand getVelocity', () => stand.getVelocity());
        attempt('armor stand getBlockStandingOn', () => stand.getBlockStandingOn() !== undefined);
        attempt('armor stand getAllBlocksStandingOn', () => stand.getAllBlocksStandingOn().length > 0);
        attempt('player cooldown after 20 ticks', () => player.getItemCooldown('jsp:wand'));
        record('removing');
        const camera = player.camera;
        test.removeSimulatedPlayer(player);
        attempt('camera isValid after removal', () => camera.isValid);
        attempt('level after removal', () => player.level);
        for (const entity of spawned.values()) if (entity.isValid) entity.remove();
        test.succeed();
        system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
    }, 20);
})
    .structureLocation({ x: 0, y: -60, z: 0 })
    .maxTicks(80);

record('ready for /gametest');
