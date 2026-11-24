/**
 * Java 26.3's slot sources, which `execute if slots` and `execute if items` read: a description of
 * which item slots to look at, evaluated against a block or an entity.
 *
 * The `minecraft:slot_source` argument is a slot name, such as `weapon.mainhand` or
 * `container.*`, which stands for a `slot_range` over the target; otherwise the id of a
 * datapack's `slot_source` file, a `#tag` of them, or the source itself as SNBT. The six types are
 * Java's `SlotSources`:
 *
 * - `empty`: no slots.
 * - `group`: every slot each of its `terms` selects, in order.
 * - `slot_range`: the slots a name covers on `source`, which is the target (`container`, the
 *   default) or the entity running the command (`this`). Empty slots count, as Java counts them.
 * - `filtered`: the slots of `slot_source` whose stack passes `item_filter`, an item predicate.
 * - `limit_slots`: the first `limit` slots of `slot_source`.
 * - `contents`: what the stacks of `slot_source` hold in their `component`. Only
 *   `minecraft:container`, a shulker box's contents, holds anything here.
 */
import type { CommandSource, SlotTarget } from '@jsprismarine/commands';
import { isJsonObject, namespaced } from '@jsprismarine/predicates';

import type Server from '../../Server';
import type { ServerContent } from '../../content/ServerContent';
import { javaSlotIds } from '../../inventory/slotAddress';
import { Item } from '../../item/Item';
import { predicateStackOf, slotItemsOf } from './inventory';
import { itemPredicateTest, parseItemPredicateArgument } from './itemPredicate';
import { jsonOfSnbt } from './snbtJson';
import { refuse } from './support';

/** What one slot holds; null for an empty one, which a range still selects. */
type HeldStack = Item | null;

/** How deep references may nest before the source is refused as a cycle. */
const MAX_DEPTH = 64;

/** What a source is evaluated against. */
interface SlotSourceScope {
    readonly server: Server;
    readonly content: ServerContent;
    /** The block or entity the command named, which `container` means. */
    readonly container: SlotTarget;
    /** The command's own entity, which `this` means. */
    readonly self: CommandSource['entity'];
}

/** A stack as an item predicate reads it, an empty slot as the empty stack. */
const stackOf = (held: HeldStack) => (held === null ? Item.air().asPredicateStack() : predicateStackOf(held));

/** The slots one source selects. */
const provide = (value: unknown, scope: SlotSourceScope, depth: number): readonly HeldStack[] => {
    if (depth > MAX_DEPTH) refuse('That slot source refers to itself');
    if (Array.isArray(value)) return value.flatMap((entry) => provide(entry, scope, depth + 1));
    if (typeof value === 'string') {
        if (value.startsWith('#')) {
            const tag = namespaced(value.slice(1));
            if (!scope.content.tags.has('slot_source', tag)) refuse(`Unknown slot source tag: ${tag}`);
            return scope.content.tags
                .members('slot_source', tag)
                .flatMap((member) => provide(member, scope, depth + 1));
        }
        const id = namespaced(value);
        const definition = scope.content.definitions.slotSources.get(id);
        if (definition === undefined) refuse(`Unknown slot source: ${id}`);
        return provide(definition.data, scope, depth + 1);
    }
    if (!isJsonObject(value) || typeof value['type'] !== 'string') refuse('A slot source needs a type');

    const inner = () => provide(value['slot_source'], scope, depth + 1);
    const type = namespaced(value['type']);
    switch (type) {
        case 'minecraft:empty':
            return [];
        case 'minecraft:group':
            return provide(value['terms'] ?? [], scope, depth + 1);
        case 'minecraft:slot_range': {
            const slots = value['slots'];
            if (typeof slots !== 'string') refuse('A slot_range slot source needs slots');
            const source = value['source'] ?? 'container';
            // A command's context holds the target and the running entity, and nothing else a
            // loot context argument can name.
            const target: SlotTarget | undefined =
                source === 'container'
                    ? scope.container
                    : source === 'this' && scope.self !== undefined
                      ? { kind: 'entity', entity: scope.self }
                      : undefined;
            return target === undefined ? [] : (slotItemsOf(scope.server, target, [slots])[0] ?? []);
        }
        case 'minecraft:filtered': {
            const matches = itemPredicateTest(value['item_filter'] ?? {}, scope.content.loot, 'item_filter');
            return inner().filter((held) => matches(stackOf(held)));
        }
        case 'minecraft:limit_slots': {
            const limit = value['limit'];
            if (typeof limit !== 'number' || limit < 1) refuse('A limit_slots slot source needs a limit of 1 or more');
            return inner().slice(0, Math.trunc(limit));
        }
        case 'minecraft:contents': {
            const component = typeof value['component'] === 'string' ? namespaced(value['component']) : undefined;
            if (component !== 'minecraft:container') return [];
            return inner().flatMap((held) => held?.getContents().filter((item) => item !== null) ?? []);
        }
        default:
            return refuse(`Unknown slot source type: ${type}`);
    }
};

/**
 * Reads the `minecraft:slot_source` argument, which is Java's `SlotSourceArgument`: a slot name
 * first, and otherwise an id, a `#tag` or SNBT.
 */
const sourceOfArgument = (text: string): unknown => {
    if (javaSlotIds(text) !== undefined || text.startsWith('slot.')) return { type: 'slot_range', slots: text };
    return text.startsWith('{') || text.startsWith('[') ? jsonOfSnbt(text) : text;
};

/**
 * The slots a slot source selects on every target, one target after another, as Java's
 * `EntityItemAccessor` concatenates them.
 *
 * @throws {CommandSyntaxException} When the source cannot be read, names an id no datapack
 *   declares, or a block target is not a container.
 */
const slotsOfSource = (
    server: Server,
    targets: readonly SlotTarget[],
    text: string,
    source: CommandSource
): readonly HeldStack[] => {
    const content = server.getContent();
    const parsed = sourceOfArgument(text);
    return targets.flatMap((container) => {
        // A block that holds no slots is refused before anything is read, as Java's
        // `BlockItemAccessor` refuses it, whatever the source would have selected.
        if (container.kind === 'block') slotItemsOf(server, container, []);
        return provide(parsed, { server, content, container, self: source.entity }, 0);
    });
};

/**
 * How many slots a slot source selects across the targets, which is `execute if slots`.
 *
 * @param slots - The `minecraft:slot_source` argument.
 */
export const countSlots = (
    server: Server,
    targets: readonly SlotTarget[],
    slots: string,
    source: CommandSource
): number => slotsOfSource(server, targets, slots, source).length;

/**
 * Counts the items in the slots a slot source selects across the targets that pass an item
 * predicate, which is `execute if items` and Java's `ExecuteCommand.countItems`.
 *
 * @param slots - The `minecraft:slot_source` argument.
 * @param predicate - Java's `item_predicate` argument.
 */
export const countSlotItems = (
    server: Server,
    targets: readonly SlotTarget[],
    slots: string,
    predicate: string,
    source: CommandSource
): number => {
    const matches = parseItemPredicateArgument(predicate, server.getContent().loot);
    return slotsOfSource(server, targets, slots, source).reduce(
        (count, held) => (held !== null && matches(predicateStackOf(held)) ? count + held.getAmount() : count),
        0
    );
};
