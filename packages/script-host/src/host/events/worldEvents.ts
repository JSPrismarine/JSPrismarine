/**
 * The events of `world.afterEvents` and `world.beforeEvents` the world describes with a
 * {@link ScriptGameEvent}: their signals, the properties that give them, and their objects'
 * members, which read the fields the world gave the event.
 *
 * An after-event waits for the script flush at the end of the tick. A before-event is a guard of
 * the action it is about ([ADR 0013](../../../../../docs/adr/0013-vetoable-actions-are-staged.md)):
 * its scripts run at once, in restricted execution, and the action goes on with the fields they
 * changed, or not at all when one canceled it.
 */
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import type { ScriptValue } from '../../values';
import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import { blockKeyOf, gameModeOf, SERVER } from '../serverObjects';
import type { ScriptEventValue } from '../world';
import { EVENT_TAG, gameDataOf, jsonValue, plainObject, scriptValueOf } from './eventValues';
import { effectDisplayName } from '../serverFeedback';
import { SCRIPT_MODULE_HISTORIES } from '../../generated/scriptModules';

/** Each `GameRule` value by its name in lower case, which is how a world may spell it. */
const GAME_RULES: ReadonlyMap<string, string> = (() => {
    const found = new Map<string, string>();
    for (const values of Object.values(SCRIPT_MODULE_HISTORIES[SERVER]?.declarations.GameRule?.members ?? {})) {
        const value = values.at(-1);
        if (value?.kind === 'constant' && typeof value.value === 'string')
            found.set(value.value.toLowerCase(), value.value);
    }
    return found;
})();

/*
 * The world events left without behavior, which throw `NotImplementedError`, because JSPrismarine
 * lacks the game system that would raise them and building it is out of this module's reach:
 * world clocks, `worldClockOn*` and `StartupEvent.worldClockRegistry` (#3290); script-registered
 * dimensions, `StartupEvent.dimensionRegistry` (#3291); pack settings, `packSettingChange` (#3292);
 * a sound's length, `soundCompleted` (#3293); tripwire and target block redstone, `tripWireTrip`
 * and `targetBlockHit` (#3294); input permissions, `playerInputPermissionCategoryChange` (#3295);
 * entity upgrades, `entityUpgrade` (#3296); and the component hooks `onStepOff`, `onNamedTick`,
 * `onNeighborChanged` and `onBeforeDurabilityDamage` (#3297).
 */

/** The signals of the events this module gives behavior, by the class the Script API gives each. */
export const WORLD_EVENT_SIGNALS = [
    'PlayerPlaceBlockBeforeEventSignal',
    'PlayerPlaceBlockAfterEventSignal',
    'PlayerGameModeChangeBeforeEventSignal',
    'PlayerGameModeChangeAfterEventSignal',
    'EntityHitEntityAfterEventSignal',
    'EntityHitBlockAfterEventSignal',
    'EntityRemoveBeforeEventSignal',
    'EntityRemoveAfterEventSignal',
    'EntityLoadAfterEventSignal',
    'PlayerDimensionChangeAfterEventSignal',
    'ExplosionBeforeEventSignal',
    'ExplosionAfterEventSignal',
    'BlockExplodeAfterEventSignal',
    'EffectAddBeforeEventSignal',
    'EffectAddAfterEventSignal',
    'EntityHurtBeforeEventSignal',
    'EntityHealBeforeEventSignal',
    'EntityHealAfterEventSignal',
    'EntityHealthChangedAfterEventSignal',
    'ItemStartUseAfterEventSignal',
    'ItemCompleteUseAfterEventSignal',
    'ItemReleaseUseAfterEventSignal',
    'ItemStopUseAfterEventSignal',
    'ItemStartUseOnAfterEventSignal',
    'ItemStopUseOnAfterEventSignal',
    'PlayerInventoryItemChangeAfterEventSignal',
    'PlayerHotbarSelectedSlotChangeAfterEventSignal',
    'EntityItemDropAfterEventSignal',
    'EntityItemPickupBeforeEventSignal',
    'EntityItemPickupAfterEventSignal',
    'GameRuleChangeAfterEventSignal',
    'EntityStartSneakingAfterEventSignal',
    'EntityStopSneakingAfterEventSignal',
    'PlayerStartBreakingBlockAfterEventSignal',
    'PlayerCancelBreakingBlockAfterEventSignal',
    'PlayerSwingStartAfterEventSignal',
    'PlayerItemAttackEntityBeforeEventSignal',
    'ProjectileHitEntityAfterEventSignal',
    'ProjectileHitBlockAfterEventSignal',
    'DataDrivenEntityTriggerAfterEventSignal',
    'EntityTamedBeforeEventSignal',
    'EntityTamedAfterEventSignal',
    'PlayerUseNameTagAfterEventSignal',
    'BlockContainerOpenedAfterEventSignal',
    'BlockContainerClosedAfterEventSignal',
    'EntityContainerOpenedAfterEventSignal',
    'EntityContainerClosedAfterEventSignal',
    'PlayerEmoteAfterEventSignal',
    'PlayerButtonInputAfterEventSignal',
    'PlayerInputModeChangeAfterEventSignal',
    'ServerMessageAfterEventSignal',
    'PlayerCursorItemGrabAfterEventSignal',
    'PlayerCraftRecipeAfterEventSignal',
    'PlayerCursorItemReleaseAfterEventSignal',
    'PistonActivateAfterEventSignal',
    'LeverActionAfterEventSignal',
    'ButtonPushAfterEventSignal',
    'PressurePlatePushAfterEventSignal',
    'PressurePlatePopAfterEventSignal'
] as const;

/** One of {@link WORLD_EVENT_SIGNALS}. */
export type WorldEventSignal = (typeof WORLD_EVENT_SIGNALS)[number];

const isWorldEventSignal = (name: string): name is WorldEventSignal =>
    WORLD_EVENT_SIGNALS.some((signal) => signal === name);

/** The signal an event class's object goes out on, or undefined for a class this module has none for. */
export const signalOfEvent = (event: string): WorldEventSignal | undefined => {
    // `messageReceive`'s signal is named for the server, not for its event.
    const name = event === 'MessageReceiveAfterEvent' ? 'ServerMessageAfterEventSignal' : `${event}Signal`;
    return isWorldEventSignal(name) ? name : undefined;
};

/** Whether an event class is a before-event, whose scripts run in restricted execution as a guard. */
export const isBeforeEvent = (event: string): boolean => event.endsWith('BeforeEvent');

/**
 * Registers the properties of `world.afterEvents` and `world.beforeEvents` that give these
 * signals, and the members of their events.
 * @param signal - The property implementation that gives a signal's one object.
 */
export const implementWorldEvents = (
    implementations: ScriptApiImplementations,
    host: PackHost,
    signal: (name: WorldEventSignal) => { get: () => ScriptHandle }
): void => {
    const data = (call: ScriptCall) => gameDataOf(host, call);
    const field = (name: string) => ({ get: (call: ScriptCall) => scriptValueOf(host, data(call).fields[name]) });
    const cancel = {
        get: (call: ScriptCall) => data(call).cancel,
        set: (call: ScriptCall) => {
            data(call).cancel = call.args[0] === true;
        }
    };
    /** A field a before-event's script may write, kept as the script gave it once `convert` takes it. */
    const writable = (name: string, convert: (call: ScriptCall) => ScriptEventValue | undefined) => ({
        get: (call: ScriptCall) => scriptValueOf(host, data(call).fields[name]),
        set: (call: ScriptCall) => {
            const value = convert(call);
            if (value !== undefined) data(call).fields[name] = value;
        }
    });
    const number = (call: ScriptCall): number | undefined =>
        typeof call.args[0] === 'number' ? call.args[0] : undefined;
    const integer = (call: ScriptCall): number | undefined => {
        const value = number(call);
        return value === undefined ? undefined : Math.trunc(value);
    };
    const text = (call: ScriptCall): string | undefined =>
        typeof call.args[0] === 'string' ? call.args[0] : undefined;

    implementations
        .implement(SERVER, 'WorldBeforeEvents', 'playerPlaceBlock', signal('PlayerPlaceBlockBeforeEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'playerPlaceBlock', signal('PlayerPlaceBlockAfterEventSignal'))
        .implement(SERVER, 'PlayerPlaceBlockBeforeEvent', 'cancel', cancel)
        .implement(SERVER, 'PlayerPlaceBlockBeforeEvent', 'player', field('player'))
        .implement(SERVER, 'PlayerPlaceBlockBeforeEvent', 'face', field('face'))
        .implement(SERVER, 'PlayerPlaceBlockBeforeEvent', 'faceLocation', field('faceLocation'))
        .implement(SERVER, 'PlayerPlaceBlockBeforeEvent', 'permutationToPlace', field('permutationToPlace'))
        .implement(SERVER, 'PlayerPlaceBlockAfterEvent', 'player', field('player'));

    implementations
        .implement(SERVER, 'WorldBeforeEvents', 'playerGameModeChange', signal('PlayerGameModeChangeBeforeEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'playerGameModeChange', signal('PlayerGameModeChangeAfterEventSignal'))
        .implement(SERVER, 'PlayerGameModeChangeBeforeEvent', 'cancel', cancel)
        .implement(SERVER, 'PlayerGameModeChangeBeforeEvent', 'player', field('player'))
        .implement(SERVER, 'PlayerGameModeChangeBeforeEvent', 'fromGameMode', field('fromGameMode'))
        .implement(
            SERVER,
            'PlayerGameModeChangeBeforeEvent',
            'toGameMode',
            writable('toGameMode', (call) => gameModeOf(call.args[0] ?? null))
        )
        .implement(SERVER, 'PlayerGameModeChangeAfterEvent', 'player', field('player'))
        .implement(SERVER, 'PlayerGameModeChangeAfterEvent', 'fromGameMode', field('fromGameMode'))
        .implement(SERVER, 'PlayerGameModeChangeAfterEvent', 'toGameMode', field('toGameMode'));

    implementations
        .implement(SERVER, 'WorldAfterEvents', 'entityHitEntity', signal('EntityHitEntityAfterEventSignal'))
        .implement(SERVER, 'EntityHitEntityAfterEvent', 'damagingEntity', field('damagingEntity'))
        .implement(SERVER, 'EntityHitEntityAfterEvent', 'hitEntity', field('hitEntity'))
        .implement(SERVER, 'WorldAfterEvents', 'entityHitBlock', signal('EntityHitBlockAfterEventSignal'))
        .implement(SERVER, 'EntityHitBlockAfterEvent', 'damagingEntity', field('damagingEntity'))
        .implement(SERVER, 'EntityHitBlockAfterEvent', 'hitBlock', field('hitBlock'))
        .implement(SERVER, 'EntityHitBlockAfterEvent', 'hitBlockPermutation', field('hitBlockPermutation'))
        .implement(SERVER, 'EntityHitBlockAfterEvent', 'blockFace', field('blockFace'));

    implementations
        .implement(SERVER, 'WorldBeforeEvents', 'entityRemove', signal('EntityRemoveBeforeEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'entityRemove', signal('EntityRemoveAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'entityLoad', signal('EntityLoadAfterEventSignal'))
        .implement(SERVER, 'EntityRemoveBeforeEvent', 'removedEntity', field('removedEntity'))
        .implement(SERVER, 'EntityRemoveAfterEvent', 'removedEntityId', field('removedEntityId'))
        .implement(SERVER, 'EntityRemoveAfterEvent', 'typeId', field('typeId'))
        // The metadata lets a script write it; BDS keeps the entity the event is about.
        .implement(SERVER, 'EntityLoadAfterEvent', 'entity', { get: field('entity').get, set: () => {} });

    implementations
        .implement(SERVER, 'WorldAfterEvents', 'playerDimensionChange', signal('PlayerDimensionChangeAfterEventSignal'))
        .implement(SERVER, 'PlayerDimensionChangeAfterEvent', 'player', field('player'))
        .implement(SERVER, 'PlayerDimensionChangeAfterEvent', 'fromDimension', field('fromDimension'))
        .implement(SERVER, 'PlayerDimensionChangeAfterEvent', 'fromLocation', field('fromLocation'))
        .implement(SERVER, 'PlayerDimensionChangeAfterEvent', 'toDimension', field('toDimension'))
        .implement(SERVER, 'PlayerDimensionChangeAfterEvent', 'toLocation', field('toLocation'));

    implementations
        .implement(SERVER, 'WorldBeforeEvents', 'explosion', signal('ExplosionBeforeEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'explosion', signal('ExplosionAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'blockExplode', signal('BlockExplodeAfterEventSignal'))
        .implement(SERVER, 'ExplosionAfterEvent', 'dimension', field('dimension'))
        .implement(SERVER, 'ExplosionAfterEvent', 'source', field('source'))
        .implement(SERVER, 'ExplosionAfterEvent', 'getImpactedBlocks', (call) =>
            scriptValueOf(host, data(call).fields.impactedBlocks ?? { blocks: [] })
        )
        .implement(SERVER, 'ExplosionBeforeEvent', 'cancel', cancel)
        .implement(SERVER, 'ExplosionBeforeEvent', 'setImpactedBlocks', (call) => {
            const [given] = call.args;
            const blocks = [];
            if (given instanceof ScriptHandle) {
                const length = call.engine.get(given, 'length');
                for (let index = 0; index < (typeof length === 'number' ? length : 0); index++) {
                    const each = call.engine.get(given, String(index));
                    const state = call.stateOf(each ?? null);
                    if (each instanceof ScriptHandle) call.engine.free(each);
                    if (state !== '') blocks.push(blockKeyOf(state));
                }
            }
            data(call).fields.impactedBlocks = { blocks };
            return undefined;
        })
        .implement(SERVER, 'BlockExplodeAfterEvent', 'explodedBlockPermutation', field('explodedBlockPermutation'))
        .implement(SERVER, 'BlockExplodeAfterEvent', 'source', field('source'));

    implementations
        .implement(SERVER, 'WorldBeforeEvents', 'effectAdd', signal('EffectAddBeforeEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'effectAdd', signal('EffectAddAfterEventSignal'))
        .implement(SERVER, 'EffectAddBeforeEvent', 'cancel', cancel)
        .implement(SERVER, 'EffectAddBeforeEvent', 'entity', field('entity'))
        // BDS gives the effect's name, as `Effect.displayName` writes it without a potency.
        .implement(SERVER, 'EffectAddBeforeEvent', 'effectType', {
            get: (call) => {
                const typeId = data(call).fields.effectType;
                return typeof typeId === 'string' ? effectDisplayName({ typeId, amplifier: 0 }) : undefined;
            }
        })
        .implement(SERVER, 'EffectAddBeforeEvent', 'duration', writable('duration', integer))
        .implement(SERVER, 'EffectAddAfterEvent', 'entity', field('entity'))
        .implement(SERVER, 'EffectAddAfterEvent', 'effect', field('effect'));

    const healSource = (call: ScriptCall) => {
        const cause = data(call).fields.healCause;
        return host.engine.release(
            host.create(
                'EntityHealSource',
                EVENT_TAG.healSource,
                JSON.stringify({ cause: typeof cause === 'string' ? cause : undefined })
            )
        );
    };
    implementations
        .implement(SERVER, 'WorldBeforeEvents', 'entityHurt', signal('EntityHurtBeforeEventSignal'))
        .implement(SERVER, 'EntityHurtBeforeEvent', 'cancel', cancel)
        .implement(SERVER, 'EntityHurtBeforeEvent', 'hurtEntity', field('hurtEntity'))
        .implement(SERVER, 'EntityHurtBeforeEvent', 'damageSource', field('damageSource'))
        .implement(SERVER, 'EntityHurtBeforeEvent', 'damage', writable('damage', number))
        .implement(SERVER, 'WorldBeforeEvents', 'entityHeal', signal('EntityHealBeforeEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'entityHeal', signal('EntityHealAfterEventSignal'))
        .implement(SERVER, 'EntityHealBeforeEvent', 'cancel', cancel)
        .implement(SERVER, 'EntityHealBeforeEvent', 'healedEntity', field('healedEntity'))
        .implement(SERVER, 'EntityHealBeforeEvent', 'healSource', { get: healSource })
        .implement(SERVER, 'EntityHealBeforeEvent', 'healing', writable('healing', number))
        .implement(SERVER, 'EntityHealAfterEvent', 'healedEntity', field('healedEntity'))
        .implement(SERVER, 'EntityHealAfterEvent', 'healSource', { get: healSource })
        .implement(SERVER, 'EntityHealAfterEvent', 'healing', field('healing'))
        .implement(SERVER, 'WorldAfterEvents', 'entityHealthChanged', signal('EntityHealthChangedAfterEventSignal'))
        .implement(SERVER, 'EntityHealthChangedAfterEvent', 'entity', field('entity'))
        .implement(SERVER, 'EntityHealthChangedAfterEvent', 'oldValue', field('oldValue'))
        .implement(SERVER, 'EntityHealthChangedAfterEvent', 'newValue', field('newValue'));

    implementations
        .implement(SERVER, 'WorldAfterEvents', 'itemStartUse', signal('ItemStartUseAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'itemCompleteUse', signal('ItemCompleteUseAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'itemReleaseUse', signal('ItemReleaseUseAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'itemStopUse', signal('ItemStopUseAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'itemStartUseOn', signal('ItemStartUseOnAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'itemStopUseOn', signal('ItemStopUseOnAfterEventSignal'));
    for (const className of [
        'ItemStartUseAfterEvent',
        'ItemCompleteUseAfterEvent',
        'ItemReleaseUseAfterEvent',
        'ItemStopUseAfterEvent'
    ] as const) {
        implementations
            .implement(SERVER, className, 'source', field('source'))
            .implement(SERVER, className, 'itemStack', field('itemStack'))
            .implement(SERVER, className, 'useDuration', field('useDuration'));
    }
    implementations
        .implement(SERVER, 'ItemStartUseOnAfterEvent', 'source', field('source'))
        .implement(SERVER, 'ItemStartUseOnAfterEvent', 'itemStack', field('itemStack'))
        .implement(SERVER, 'ItemStartUseOnAfterEvent', 'block', field('block'))
        .implement(SERVER, 'ItemStartUseOnAfterEvent', 'blockFace', field('blockFace'))
        .implement(SERVER, 'ItemStopUseOnAfterEvent', 'source', field('source'))
        .implement(SERVER, 'ItemStopUseOnAfterEvent', 'itemStack', field('itemStack'))
        .implement(SERVER, 'ItemStopUseOnAfterEvent', 'block', field('block'));

    implementations
        .implement(
            SERVER,
            'WorldAfterEvents',
            'playerInventoryItemChange',
            signal('PlayerInventoryItemChangeAfterEventSignal')
        )
        .implement(SERVER, 'PlayerInventoryItemChangeAfterEvent', 'player', field('player'))
        .implement(SERVER, 'PlayerInventoryItemChangeAfterEvent', 'slot', field('slot'))
        .implement(SERVER, 'PlayerInventoryItemChangeAfterEvent', 'inventoryType', field('inventoryType'))
        .implement(SERVER, 'PlayerInventoryItemChangeAfterEvent', 'beforeItemStack', field('beforeItemStack'))
        .implement(SERVER, 'PlayerInventoryItemChangeAfterEvent', 'itemStack', field('itemStack'))
        .implement(
            SERVER,
            'WorldAfterEvents',
            'playerHotbarSelectedSlotChange',
            signal('PlayerHotbarSelectedSlotChangeAfterEventSignal')
        )
        .implement(SERVER, 'PlayerHotbarSelectedSlotChangeAfterEvent', 'player', field('player'))
        .implement(SERVER, 'PlayerHotbarSelectedSlotChangeAfterEvent', 'itemStack', field('itemStack'))
        .implement(SERVER, 'PlayerHotbarSelectedSlotChangeAfterEvent', 'newSlotSelected', field('newSlotSelected'))
        .implement(
            SERVER,
            'PlayerHotbarSelectedSlotChangeAfterEvent',
            'previousSlotSelected',
            field('previousSlotSelected')
        );

    implementations
        .implement(SERVER, 'WorldAfterEvents', 'entityItemDrop', signal('EntityItemDropAfterEventSignal'))
        .implement(SERVER, 'EntityItemDropAfterEvent', 'entity', field('entity'))
        .implement(SERVER, 'EntityItemDropAfterEvent', 'items', field('items'))
        .implement(SERVER, 'WorldBeforeEvents', 'entityItemPickup', signal('EntityItemPickupBeforeEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'entityItemPickup', signal('EntityItemPickupAfterEventSignal'))
        .implement(SERVER, 'EntityItemPickupBeforeEvent', 'cancel', cancel)
        .implement(SERVER, 'EntityItemPickupBeforeEvent', 'entity', field('entity'))
        .implement(SERVER, 'EntityItemPickupBeforeEvent', 'item', field('item'))
        .implement(SERVER, 'EntityItemPickupAfterEvent', 'entity', field('entity'))
        .implement(SERVER, 'EntityItemPickupAfterEvent', 'items', field('items'));

    implementations
        .implement(SERVER, 'WorldAfterEvents', 'gameRuleChange', signal('GameRuleChangeAfterEventSignal'))
        .implement(SERVER, 'GameRuleChangeAfterEvent', 'rule', {
            get: (call) => {
                const rule = data(call).fields.rule;
                return typeof rule === 'string' ? (GAME_RULES.get(rule.toLowerCase()) ?? rule) : undefined;
            }
        })
        .implement(SERVER, 'GameRuleChangeAfterEvent', 'value', field('value'))
        .implement(SERVER, 'WorldAfterEvents', 'entityStartSneaking', signal('EntityStartSneakingAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'entityStopSneaking', signal('EntityStopSneakingAfterEventSignal'))
        .implement(SERVER, 'EntityStartSneakingAfterEvent', 'entity', field('entity'))
        .implement(SERVER, 'EntityStopSneakingAfterEvent', 'entity', field('entity'));

    implementations
        .implement(
            SERVER,
            'WorldAfterEvents',
            'playerStartBreakingBlock',
            signal('PlayerStartBreakingBlockAfterEventSignal')
        )
        .implement(
            SERVER,
            'WorldAfterEvents',
            'playerCancelBreakingBlock',
            signal('PlayerCancelBreakingBlockAfterEventSignal')
        )
        .implement(SERVER, 'PlayerStartBreakingBlockAfterEvent', 'player', field('player'))
        .implement(SERVER, 'PlayerStartBreakingBlockAfterEvent', 'blockPermutation', field('blockPermutation'))
        .implement(SERVER, 'PlayerStartBreakingBlockAfterEvent', 'face', field('face'))
        .implement(SERVER, 'PlayerStartBreakingBlockAfterEvent', 'heldItemStack', field('heldItemStack'))
        .implement(SERVER, 'PlayerCancelBreakingBlockAfterEvent', 'player', field('player'))
        .implement(SERVER, 'PlayerCancelBreakingBlockAfterEvent', 'blockPermutation', field('blockPermutation'))
        .implement(SERVER, 'PlayerCancelBreakingBlockAfterEvent', 'face', field('face'))
        .implement(SERVER, 'PlayerCancelBreakingBlockAfterEvent', 'heldItemStack', field('heldItemStack'))
        .implement(SERVER, 'PlayerCancelBreakingBlockAfterEvent', 'breakProgress', field('breakProgress'))
        .implement(SERVER, 'WorldAfterEvents', 'playerSwingStart', signal('PlayerSwingStartAfterEventSignal'))
        .implement(SERVER, 'PlayerSwingStartAfterEvent', 'player', field('player'))
        .implement(SERVER, 'PlayerSwingStartAfterEvent', 'heldItemStack', field('heldItemStack'))
        .implement(SERVER, 'PlayerSwingStartAfterEvent', 'swingSource', field('swingSource'))
        .implement(
            SERVER,
            'WorldBeforeEvents',
            'playerItemAttackEntity',
            signal('PlayerItemAttackEntityBeforeEventSignal')
        )
        .implement(SERVER, 'PlayerItemAttackEntityBeforeEvent', 'cancel', cancel)
        .implement(SERVER, 'PlayerItemAttackEntityBeforeEvent', 'player', field('player'))
        .implement(SERVER, 'PlayerItemAttackEntityBeforeEvent', 'target', field('target'))
        .implement(SERVER, 'PlayerItemAttackEntityBeforeEvent', 'itemStack', field('itemStack'))
        .implement(SERVER, 'PlayerItemAttackEntityBeforeEvent', 'aimDirection', field('aimDirection'));

    const blockHit = (call: ScriptCall) => {
        const { fields } = data(call);
        return plainObject(host, {
            block: scriptValueOf(host, fields.hitBlock),
            face: scriptValueOf(host, fields.hitFace),
            faceLocation: scriptValueOf(host, fields.hitFaceLocation)
        });
    };
    implementations
        .implement(SERVER, 'WorldAfterEvents', 'projectileHitEntity', signal('ProjectileHitEntityAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'projectileHitBlock', signal('ProjectileHitBlockAfterEventSignal'));
    for (const className of ['ProjectileHitEntityAfterEvent', 'ProjectileHitBlockAfterEvent'] as const) {
        implementations
            .implement(SERVER, className, 'projectile', field('projectile'))
            .implement(SERVER, className, 'source', field('source'))
            .implement(SERVER, className, 'dimension', field('dimension'))
            .implement(SERVER, className, 'location', field('location'))
            .implement(SERVER, className, 'hitVector', field('hitVector'));
    }
    implementations
        .implement(SERVER, 'ProjectileHitEntityAfterEvent', 'getEntityHit', (call) =>
            plainObject(host, { entity: scriptValueOf(host, data(call).fields.hitEntity) })
        )
        .implement(SERVER, 'ProjectileHitBlockAfterEvent', 'getBlockHit', blockHit);

    /**
     * The one `DefinitionModifier` a trigger made: the component groups it added and removed. Its
     * `triggers` list is empty, as JSPrismarine's events run no other event.
     */
    const modifiers = (call: ScriptCall) => {
        const { fields } = data(call);
        const groups = (name: string): ScriptValue => scriptValueOf(host, fields[name] ?? { json: '[]' });
        const modifier = plainObject(host, {
            addedComponentGroups: jsonValue(host, groups('addedComponentGroups')),
            removedComponentGroups: jsonValue(host, groups('removedComponentGroups')),
            triggers: jsonValue(host, '[]')
        });
        return jsonValue(host, '[]', [modifier]);
    };
    implementations
        .implement(
            SERVER,
            'WorldAfterEvents',
            'dataDrivenEntityTrigger',
            signal('DataDrivenEntityTriggerAfterEventSignal')
        )
        .implement(SERVER, 'DataDrivenEntityTriggerAfterEvent', 'entity', field('entity'))
        .implement(SERVER, 'DataDrivenEntityTriggerAfterEvent', 'eventId', field('eventId'))
        .implement(SERVER, 'DataDrivenEntityTriggerAfterEvent', 'getModifiers', modifiers);

    implementations
        .implement(SERVER, 'WorldBeforeEvents', 'entityTamed', signal('EntityTamedBeforeEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'entityTamed', signal('EntityTamedAfterEventSignal'))
        .implement(SERVER, 'EntityTamedBeforeEvent', 'cancel', cancel)
        .implement(SERVER, 'EntityTamedBeforeEvent', 'entity', field('entity'))
        .implement(SERVER, 'EntityTamedBeforeEvent', 'tamingEntity', field('tamingEntity'))
        .implement(SERVER, 'EntityTamedAfterEvent', 'entity', field('entity'))
        .implement(SERVER, 'EntityTamedAfterEvent', 'tamingEntity', field('tamingEntity'));

    // The metadata marks these writable; a script's write changes what later reads of this event see.
    implementations
        .implement(SERVER, 'WorldAfterEvents', 'playerUseNameTag', signal('PlayerUseNameTagAfterEventSignal'))
        .implement(SERVER, 'PlayerUseNameTagAfterEvent', 'player', { get: field('player').get, set: () => {} })
        .implement(SERVER, 'PlayerUseNameTagAfterEvent', 'entityNamed', {
            get: field('entityNamed').get,
            set: () => {}
        })
        .implement(SERVER, 'PlayerUseNameTagAfterEvent', 'newName', writable('newName', text))
        .implement(SERVER, 'PlayerUseNameTagAfterEvent', 'previousName', writable('previousName', text));

    const accessSource = (name: string) => ({
        get: (call: ScriptCall) => plainObject(host, { entity: scriptValueOf(host, data(call).fields[name]) }),
        set: () => {}
    });
    implementations
        .implement(SERVER, 'WorldAfterEvents', 'blockContainerOpened', signal('BlockContainerOpenedAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'blockContainerClosed', signal('BlockContainerClosedAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'entityContainerOpened', signal('EntityContainerOpenedAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'entityContainerClosed', signal('EntityContainerClosedAfterEventSignal'))
        .implement(SERVER, 'BlockContainerOpenedAfterEvent', 'openSource', accessSource('source'))
        .implement(SERVER, 'BlockContainerClosedAfterEvent', 'closeSource', accessSource('source'))
        .implement(SERVER, 'EntityContainerOpenedAfterEvent', 'entity', field('entity'))
        .implement(SERVER, 'EntityContainerOpenedAfterEvent', 'openSource', { get: accessSource('source').get })
        .implement(SERVER, 'EntityContainerClosedAfterEvent', 'entity', field('entity'))
        .implement(SERVER, 'EntityContainerClosedAfterEvent', 'closeSource', { get: accessSource('source').get });

    implementations
        .implement(SERVER, 'WorldAfterEvents', 'playerEmote', signal('PlayerEmoteAfterEventSignal'))
        .implement(SERVER, 'PlayerEmoteAfterEvent', 'player', field('player'))
        .implement(SERVER, 'PlayerEmoteAfterEvent', 'personaPieceId', field('personaPieceId'))
        .implement(SERVER, 'WorldAfterEvents', 'playerButtonInput', signal('PlayerButtonInputAfterEventSignal'))
        .implement(SERVER, 'PlayerButtonInputAfterEvent', 'player', field('player'))
        .implement(SERVER, 'PlayerButtonInputAfterEvent', 'button', field('button'))
        .implement(SERVER, 'PlayerButtonInputAfterEvent', 'newButtonState', field('newButtonState'))
        .implement(SERVER, 'WorldAfterEvents', 'playerCraftRecipe', signal('PlayerCraftRecipeAfterEventSignal'))
        .implement(SERVER, 'PlayerCraftRecipeAfterEvent', 'player', field('player'))
        .implement(SERVER, 'PlayerCraftRecipeAfterEvent', 'itemStack', field('itemStack'))
        .implement(SERVER, 'PlayerCraftRecipeAfterEvent', 'block', field('block'))
        .implement(SERVER, 'WorldAfterEvents', 'playerCursorItemGrab', signal('PlayerCursorItemGrabAfterEventSignal'))
        .implement(
            SERVER,
            'WorldAfterEvents',
            'playerCursorItemRelease',
            signal('PlayerCursorItemReleaseAfterEventSignal')
        )
        .implement(SERVER, 'PlayerCursorItemGrabAfterEvent', 'player', field('player'))
        .implement(SERVER, 'PlayerCursorItemGrabAfterEvent', 'item', field('item'))
        .implement(SERVER, 'PlayerCursorItemReleaseAfterEvent', 'player', field('player'))
        .implement(SERVER, 'PlayerCursorItemReleaseAfterEvent', 'item', field('item'))
        .implement(SERVER, 'WorldAfterEvents', 'messageReceive', signal('ServerMessageAfterEventSignal'))
        .implement(SERVER, 'MessageReceiveAfterEvent', 'id', field('id'))
        .implement(SERVER, 'MessageReceiveAfterEvent', 'message', field('message'))
        .implement(SERVER, 'MessageReceiveAfterEvent', 'player', field('player'))
        .implement(SERVER, 'WorldAfterEvents', 'playerInputModeChange', signal('PlayerInputModeChangeAfterEventSignal'))
        .implement(SERVER, 'PlayerInputModeChangeAfterEvent', 'player', field('player'))
        .implement(SERVER, 'PlayerInputModeChangeAfterEvent', 'newInputModeUsed', field('newInputModeUsed'))
        .implement(SERVER, 'PlayerInputModeChangeAfterEvent', 'previousInputModeUsed', field('previousInputModeUsed'));

    implementations
        .implement(SERVER, 'WorldAfterEvents', 'pistonActivate', signal('PistonActivateAfterEventSignal'))
        .implement(SERVER, 'PistonActivateAfterEvent', 'isExpanding', field('isExpanding'))
        .implement(SERVER, 'PistonActivateAfterEvent', 'piston', field('piston'))
        .implement(SERVER, 'WorldAfterEvents', 'leverAction', signal('LeverActionAfterEventSignal'))
        .implement(SERVER, 'LeverActionAfterEvent', 'player', field('player'))
        .implement(SERVER, 'LeverActionAfterEvent', 'isPowered', field('isPowered'))
        .implement(SERVER, 'WorldAfterEvents', 'buttonPush', signal('ButtonPushAfterEventSignal'))
        .implement(SERVER, 'ButtonPushAfterEvent', 'source', field('source'))
        .implement(SERVER, 'WorldAfterEvents', 'pressurePlatePush', signal('PressurePlatePushAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'pressurePlatePop', signal('PressurePlatePopAfterEventSignal'))
        .implement(SERVER, 'PressurePlatePushAfterEvent', 'source', field('source'))
        .implement(SERVER, 'PressurePlatePushAfterEvent', 'redstonePower', field('redstonePower'))
        .implement(SERVER, 'PressurePlatePushAfterEvent', 'previousRedstonePower', field('previousRedstonePower'))
        .implement(SERVER, 'PressurePlatePopAfterEvent', 'redstonePower', field('redstonePower'))
        .implement(SERVER, 'PressurePlatePopAfterEvent', 'previousRedstonePower', field('previousRedstonePower'));
};
