/**
 * The options a script passes to `subscribe` of a world event signal, which pick the events its
 * callback gets: `EntityEventOptions`, `BlockEventOptions`, `EntityFilter` and the rest. A
 * subscriber gets an event when every option it gave matches the event.
 */
import { isRecord } from '../../isRecord';
import type { ScriptCall } from '../../shape/implementations';
import type { ScriptValue } from '../../values';
import { ScriptHandle } from '../../values';
import { entityKeyOf, permutationOf, withNamespace } from '../serverObjects';
import type { ScriptBlockPermutation, ScriptEntityRef, ScriptEventValue, ScriptGameEvent, ScriptWorld } from '../world';

/** The options a subscriber gave, as JSON data, with each entity as its id and each permutation as its data. */
export type WorldEventOptions = Readonly<Record<string, unknown>>;

/** The keys whose value lists entity objects, which JSON does not carry. */
const ENTITY_LISTS = ['entities'];

/** The keys whose value lists permutation objects. */
const PERMUTATION_LISTS = ['permutations', 'includePermutations', 'excludePermutations'];

/** Reads a list of host objects from an option, by the state each carries. */
const statesOf = (call: ScriptCall, owner: ScriptHandle, key: string): string[] | undefined => {
    const found = call.engine.get(owner, key);
    if (!(found instanceof ScriptHandle)) return undefined;
    try {
        const length = call.engine.get(found, 'length');
        if (typeof length !== 'number') return undefined;
        return Array.from({ length }, (_, index) => {
            const each = call.engine.get(found, String(index));
            const state = call.stateOf(each ?? null);
            if (each instanceof ScriptHandle) call.engine.free(each);
            return state;
        });
    } finally {
        call.engine.free(found);
    }
};

/** Reads an options object: its JSON, with its entity and permutation lists read from the objects. */
const readOptions = (call: ScriptCall, options: ScriptHandle): Record<string, unknown> => {
    const json = call.stringify(options);
    // The engine wrote the string with JSON.stringify.
    const parsed: unknown = json === undefined ? undefined : JSON.parse(json);
    const read: Record<string, unknown> = isRecord(parsed) ? { ...parsed } : {};
    for (const key of ENTITY_LISTS) {
        const states = statesOf(call, options, key);
        if (states !== undefined) read[key] = states.map((state) => (state === '' ? '' : entityKeyOf(state).id));
    }
    for (const key of PERMUTATION_LISTS) {
        const states = statesOf(call, options, key);
        if (states !== undefined) read[key] = states.filter((state) => state !== '').map(permutationOf);
    }
    for (const [key, value] of Object.entries(read)) {
        const nested = call.engine.get(options, key);
        if (isRecord(value) && nested instanceof ScriptHandle) read[key] = readOptions(call, nested);
        if (nested instanceof ScriptHandle) call.engine.free(nested);
    }
    return read;
};

/** Reads the options a subscriber passed, or undefined when it passed none. */
export const worldEventOptionsOf = (call: ScriptCall, value: ScriptValue | undefined): WorldEventOptions | undefined =>
    value instanceof ScriptHandle ? readOptions(call, value) : undefined;

/** What an event's options are matched against: the fields that hold its entity, its block and its stacks. */
interface Subject {
    readonly entity?: string;
    readonly secondEntity?: string;
    readonly permutation?: string;
    readonly items?: readonly string[];
}

/** The fields each event's options look at, by the event's class. */
const SUBJECTS: Readonly<Record<string, Subject>> = {
    PlayerPlaceBlockBeforeEvent: { entity: 'player', permutation: 'permutationToPlace' },
    PlayerPlaceBlockAfterEvent: { entity: 'player', permutation: 'permutation' },
    EntityHitEntityAfterEvent: { entity: 'damagingEntity' },
    EntityHitBlockAfterEvent: { entity: 'damagingEntity' },
    EntityRemoveBeforeEvent: { entity: 'removedEntity' },
    EntityRemoveAfterEvent: { entity: 'removedEntity' },
    EffectAddBeforeEvent: { entity: 'entity' },
    EffectAddAfterEvent: { entity: 'entity' },
    EntityHurtBeforeEvent: { entity: 'hurtEntity' },
    EntityHealBeforeEvent: { entity: 'healedEntity' },
    EntityHealAfterEvent: { entity: 'healedEntity' },
    EntityHealthChangedAfterEvent: { entity: 'entity' },
    EntityItemDropAfterEvent: { entity: 'entity', items: ['itemStacks'] },
    EntityItemPickupBeforeEvent: { entity: 'entity', items: ['itemStack'] },
    EntityItemPickupAfterEvent: { entity: 'entity', items: ['items'] },
    EntityStartSneakingAfterEvent: { entity: 'entity' },
    EntityStopSneakingAfterEvent: { entity: 'entity' },
    EntityTamedBeforeEvent: { entity: 'entity', secondEntity: 'tamingEntity' },
    EntityTamedAfterEvent: { entity: 'entity', secondEntity: 'tamingEntity' },
    DataDrivenEntityTriggerAfterEvent: { entity: 'entity' },
    EntityContainerOpenedAfterEvent: { entity: 'entity' },
    EntityContainerClosedAfterEvent: { entity: 'entity' },
    BlockContainerOpenedAfterEvent: { permutation: 'permutation' },
    BlockContainerClosedAfterEvent: { permutation: 'permutation' },
    PlayerStartBreakingBlockAfterEvent: { entity: 'player', permutation: 'blockPermutation' },
    PlayerCancelBreakingBlockAfterEvent: { entity: 'player', permutation: 'blockPermutation' },
    PlayerCraftRecipeAfterEvent: { entity: 'player', permutation: 'permutation', items: ['itemStack'] },
    PlayerSwingStartAfterEvent: { entity: 'player' }
};

/** The entity a field names. */
const entityOf = (value: ScriptEventValue | undefined): ScriptEntityRef | undefined =>
    typeof value === 'object' && 'entity' in value ? value.entity : undefined;

const permutationOfValue = (value: ScriptEventValue | undefined): ScriptBlockPermutation | undefined =>
    typeof value === 'object' && 'permutation' in value ? value.permutation : undefined;

const strings = (value: unknown): readonly string[] | undefined =>
    Array.isArray(value) ? value.filter((each) => typeof each === 'string') : undefined;

/** Whether a permutation is one a script's permutation names: the same type and each state it gives. */
const samePermutation = (given: ScriptBlockPermutation, actual: ScriptBlockPermutation): boolean =>
    given.typeId === actual.typeId &&
    Object.entries(given.states).every(([name, value]) => actual.states[name] === value);

/** Whether an entity passes an `EntityFilter`, read as the world has it now. */
const passesEntityFilter = (world: ScriptWorld, ref: ScriptEntityRef | undefined, filter: unknown): boolean => {
    if (!isRecord(filter)) return true;
    if (ref === undefined) return false;
    const state = world.entity(ref.id);
    const type = filter.type;
    if (typeof type === 'string' && withNamespace(type) !== ref.typeId) return false;
    if (strings(filter.excludeTypes)?.some((each) => withNamespace(each) === ref.typeId) === true) return false;
    const tags = state?.tags ?? [];
    if (strings(filter.tags)?.every((tag) => tags.includes(tag)) === false) return false;
    if (strings(filter.excludeTags)?.some((tag) => tags.includes(tag)) === true) return false;
    const name = state?.name ?? state?.nameTag ?? '';
    if (typeof filter.name === 'string' && filter.name !== name) return false;
    if (strings(filter.excludeNames)?.includes(name) === true) return false;
    const gameMode = state?.gameMode;
    if (typeof filter.gameMode === 'string' && filter.gameMode !== gameMode) return false;
    if (gameMode !== undefined && strings(filter.excludeGameModes)?.includes(gameMode) === true) return false;
    return true;
};

/** Whether a permutation passes a `BlockFilter`. Block tags are not read, so a tag filter passes. */
const passesBlockFilter = (permutation: ScriptBlockPermutation | undefined, filter: unknown): boolean => {
    if (!isRecord(filter)) return true;
    if (permutation === undefined) return false;
    const includeTypes = strings(filter.includeTypes)?.map(withNamespace);
    if (includeTypes !== undefined && !includeTypes.includes(permutation.typeId)) return false;
    if (strings(filter.excludeTypes)?.map(withNamespace).includes(permutation.typeId) === true) return false;
    const permutations = (key: string): ScriptBlockPermutation[] | undefined => {
        const value = filter[key];
        return Array.isArray(value)
            ? value.filter((each): each is ScriptBlockPermutation => isRecord(each))
            : undefined;
    };
    const include = permutations('includePermutations');
    if (include !== undefined && !include.some((each) => samePermutation(each, permutation))) return false;
    if (permutations('excludePermutations')?.some((each) => samePermutation(each, permutation)) === true) return false;
    return true;
};

/** The type ids of the stacks an event's item fields hold. */
const itemTypes = (event: ScriptGameEvent, keys: readonly string[]): string[] =>
    keys.flatMap((key) => {
        const value = event.fields[key];
        if (typeof value !== 'object') return [];
        if ('item' in value) return [value.item.typeId];
        if ('items' in value) return value.items.map((item) => item.typeId);
        return [];
    });

/**
 * Whether an event reaches a subscriber with options, as BDS reads each option: an entity list,
 * an entity type list and an `EntityFilter` look at the event's entity, a block list and a
 * `BlockFilter` at its block, and the rest at the field they name.
 */
export const passesWorldEventOptions = (
    world: ScriptWorld,
    event: ScriptGameEvent,
    options: WorldEventOptions | undefined
): boolean => {
    if (options === undefined) return true;
    const subject = SUBJECTS[event.event] ?? {};
    const { fields } = event;
    const entity = subject.entity === undefined ? undefined : entityOf(fields[subject.entity]);
    const permutation = subject.permutation === undefined ? undefined : permutationOfValue(fields[subject.permutation]);
    const entities = strings(options.entities);
    if (entities !== undefined && (entity === undefined || !entities.includes(entity.id))) return false;
    const entityTypes = strings(options.entityTypes);
    if (entityTypes !== undefined && (entity === undefined || !entityTypes.includes(entity.typeId))) return false;
    const eventTypes = strings(options.eventTypes);
    if (eventTypes !== undefined && !eventTypes.includes(String(fields.eventId))) return false;
    if (!passesEntityFilter(world, entity, options.entityFilter)) return false;
    if (!passesEntityFilter(world, entity, options.playerFilter)) return false;
    const second = subject.secondEntity === undefined ? undefined : entityOf(fields[subject.secondEntity]);
    if (!passesEntityFilter(world, second, options.tamingEntityFilter)) return false;
    const access = options.accessSourceFilter;
    if (isRecord(access) && !passesEntityFilter(world, entityOf(fields.source), access.entityFilter)) return false;
    const healCauses = strings(options.allowedHealCauses);
    if (healCauses !== undefined && !healCauses.includes(String(fields.healCause))) return false;
    const damageCauses = strings(options.allowedDamageCauses);
    const damageSource = fields.damageSource;
    if (
        damageCauses !== undefined &&
        !(typeof damageSource === 'object' && 'damageSource' in damageSource
            ? damageCauses.includes(damageSource.damageSource.cause)
            : false)
    ) {
        return false;
    }
    const blockTypes = strings(options.blockTypes)?.map(withNamespace);
    if (blockTypes !== undefined && (permutation === undefined || !blockTypes.includes(permutation.typeId))) {
        return false;
    }
    const permutations = Array.isArray(options.permutations)
        ? options.permutations.filter((each): each is ScriptBlockPermutation => isRecord(each))
        : undefined;
    if (
        permutations !== undefined &&
        (permutation === undefined || !permutations.some((each) => samePermutation(each, permutation)))
    ) {
        return false;
    }
    if (!passesBlockFilter(permutation, options.blockFilter)) return false;
    const itemFilter = options.itemFilter;
    const includeItems = isRecord(itemFilter) ? strings(itemFilter.includeTypes)?.map(withNamespace) : undefined;
    if (includeItems !== undefined && !itemTypes(event, subject.items ?? []).some((id) => includeItems.includes(id))) {
        return false;
    }
    const slots = Array.isArray(options.allowedSlots) ? options.allowedSlots : undefined;
    const slot = fields.newSlotSelected ?? fields.slot;
    if (slots !== undefined && !slots.includes(slot)) return false;
    if (typeof options.inventoryType === 'string' && options.inventoryType !== fields.inventoryType) return false;
    const stackTypes = itemTypes(event, ['itemStack', 'beforeItemStack']);
    const included = strings(options.includeItems)?.map(withNamespace);
    if (included !== undefined && !stackTypes.some((id) => included.includes(id))) return false;
    const excluded = strings(options.excludeItems)?.map(withNamespace);
    if (excluded !== undefined && stackTypes.some((id) => excluded.includes(id))) return false;
    if (options.ignoreQuantityChange === true && fields.quantityOnly === true) return false;
    const buttons = strings(options.buttons);
    if (buttons !== undefined && !buttons.includes(String(fields.button))) return false;
    if (typeof options.state === 'string' && options.state !== fields.newButtonState) return false;
    if (typeof options.swingSource === 'string' && options.swingSource !== fields.swingSource) return false;
    const held = fields.heldItemStack !== undefined;
    if (options.heldItemOption === 'AnyItem' && !held) return false;
    if (options.heldItemOption === 'NoItem' && held) return false;
    return true;
};
