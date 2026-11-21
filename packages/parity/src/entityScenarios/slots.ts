/**
 * The item slots a command names on an entity: `/item`, `/loot replace` and `/replaceitem` read a
 * slot name against one entity and write the slot it means there
 * ([plan](../../../../docs/plans/unified-item-slots.md)).
 */
import type { EntityPosition, FilterEntityView } from '@jsprismarine/entities';
import { javaSlotIds, mobSlotHolder, resolveSlotName } from '@jsprismarine/prismarine/inventory/slotAddress';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { javaOperations, pinnedJavaClass } from '../javaClassFile.ts';
import type { StagedEntity } from './stage.ts';
import { STAGE_PLAYER_ID, stage, tickStage, withEntity } from './stage.ts';
import { hold } from './mobSlots.ts';
import { mappedEntity } from './subjects.ts';

/** One name Java's `SlotRanges` registers, with the slot numbers it stands for when they are literal. */
interface JavaSlotName {
    readonly name: string;
    /** How many slots the name covers. */
    readonly size: number;
    /** The numbers, when the class pushes them as constants; an equipment slot's is computed. */
    readonly ids?: readonly number[];
}

/**
 * Every slot name Java's `SlotRanges` registers, read off the lambda its static `SLOTS` list is
 * built with: each `addSlotRange(list, prefix, base, size)`, `addSingleSlot(list, name, id)` and
 * `addSlots(list, name, ids...)` call, with the string and the numbers pushed before it.
 */
const javaSlotNames = (): readonly JavaSlotName[] => {
    const builder = pinnedJavaClass('net/minecraft/world/inventory/SlotRanges').find((method) =>
        method.calls.some((call) => call.endsWith('SlotRanges.addSlotRange'))
    );
    if (builder === undefined) throw new Error('SlotRanges has no method that adds a slot range');

    const names: JavaSlotName[] = [];
    let name: string | undefined;
    let numbers: number[] = [];
    let computed = false;
    for (const operation of javaOperations(builder)) {
        if (operation.kind === 'string') {
            name = operation.value;
            numbers = [];
            computed = false;
        } else if (operation.kind === 'number') numbers.push(operation.value);
        else if (operation.kind === 'field') computed = true;
        else if (operation.target.endsWith('.addSlotRange') && name !== undefined) {
            const [base = 0, size = 0] = numbers;
            const ids = Array.from({ length: size }, (_unused, index) => base + index);
            for (const [index, id] of ids.entries()) names.push({ name: `${name}${index}`, size: 1, ids: [id] });
            names.push({ name: `${name}*`, size, ids });
            name = undefined;
        } else if (operation.target.endsWith('.addSingleSlot') && name !== undefined) {
            const [id] = numbers;
            names.push({ name, size: 1, ...(computed || id === undefined ? {} : { ids: [id] }) });
            name = undefined;
        } else if (operation.target.endsWith('.addSlots') && name !== undefined) {
            // The array's length is the first number pushed after the name.
            names.push({ name, size: numbers[0] ?? 0 });
            name = undefined;
        }
    }
    return names;
};

/** One slot name on one entity, and whether Java's `getSlot` answers it there. */
interface EntitySlot {
    readonly javaId: string;
    /** The events that make it the entity the row is about, such as a tamed, chested llama. */
    readonly events: readonly string[];
    readonly label: string;
    readonly slot: string;
    readonly has: boolean;
    /**
     * An item a player puts on the entity first, through the entity's own interaction. The row
     * then checks that `slot` does not reach the container slot the item went to, as a llama's
     * chest is not where its carpet is.
     */
    readonly wearing?: string;
}

const tame = ['minecraft:on_tame'];
const tameWithChest = ['minecraft:on_tame', 'minecraft:on_chest'];

/**
 * What Java 26.3 answers for a slot name on an entity, from `LivingEntity.getSlot` (every
 * equipment slot the entity can use), `AbstractHorse.getSlot` and `canUseSlot` (a saddle and body
 * armor on a horse, body armor and no saddle on a llama), `AbstractChestedHorse.getSlot` (the
 * chest slots, only with a chest on), `InventoryCarrier` (`mob.inventory.N` on a villager) and
 * `ContainerEntity.getChestVehicleSlot` (`container.N` on a chest minecart, inside its 27).
 */
const ENTITY_SLOTS: readonly EntitySlot[] = [
    { javaId: 'minecraft:zombie', events: [], label: 'zombie', slot: 'armor.head', has: true },
    { javaId: 'minecraft:zombie', events: [], label: 'zombie', slot: 'weapon.offhand', has: true },
    { javaId: 'minecraft:zombie', events: [], label: 'zombie', slot: 'container.0', has: false },
    { javaId: 'minecraft:zombie', events: [], label: 'zombie', slot: 'mob.inventory.0', has: false },
    { javaId: 'minecraft:horse', events: tame, label: 'tamed horse', slot: 'saddle', has: true },
    { javaId: 'minecraft:horse', events: tame, label: 'tamed horse', slot: 'armor.body', has: true },
    { javaId: 'minecraft:horse', events: tame, label: 'tamed horse', slot: 'horse.0', has: false },
    { javaId: 'minecraft:llama', events: tame, label: 'tamed llama', slot: 'horse.0', has: false },
    { javaId: 'minecraft:llama', events: tameWithChest, label: 'chested llama', slot: 'horse.0', has: true },
    {
        javaId: 'minecraft:llama',
        events: tameWithChest,
        label: 'chested llama',
        slot: 'horse.*',
        has: true,
        wearing: 'minecraft:red_carpet'
    },
    { javaId: 'minecraft:llama', events: tameWithChest, label: 'chested llama', slot: 'armor.body', has: true },
    { javaId: 'minecraft:llama', events: tameWithChest, label: 'chested llama', slot: 'saddle', has: false },
    { javaId: 'minecraft:llama', events: tameWithChest, label: 'chested llama', slot: 'horse.chest', has: true },
    { javaId: 'minecraft:villager', events: [], label: 'villager', slot: 'mob.inventory.0', has: true },
    { javaId: 'minecraft:villager', events: [], label: 'villager', slot: 'container.0', has: false },
    { javaId: 'minecraft:chest_minecart', events: [], label: 'chest minecart', slot: 'container.26', has: true },
    { javaId: 'minecraft:chest_minecart', events: [], label: 'chest minecart', slot: 'container.27', has: false }
];

/** Open ground on the stage, where a mount stands still for the length of a row. */
const GROUND: EntityPosition = { x: 0.5, y: 0, z: 0.5 };

/** The player that puts an item on a staged mount. */
const WEARER_ID = STAGE_PLAYER_ID + 7;

/**
 * Has a standing player who owns the entity put `item` on it through the entity's own
 * interaction, as a player right-clicking a llama with a carpet does.
 *
 * @returns The `inventory` container slot the item went to, or a sentence saying it did not go on.
 */
const wear = (entity: StagedEntity, item: string): number | string => {
    const { runtime } = stage();
    const player = runtime.spawnPlayer(WEARER_ID, { ...GROUND, x: GROUND.x + 1 });
    if (player === undefined) return 'the runtime refused to spawn a player';
    try {
        hold(player.body, item);
        runtime.setOwner(entity.id, WEARER_ID);
        const view = runtime.mobById(WEARER_ID)?.view();
        if (view === undefined) return 'the runtime has no view of its own player';
        const standing: FilterEntityView = {
            ...view,
            flag: (name) => (name === 'is_sneaking' ? false : view.flag?.(name))
        };
        if (!runtime.interactWithItem(entity.id, WEARER_ID, item, standing).accepted)
            return `the ${item} did not go on`;
        const slot = entity.body.inventory
            .container('inventory')
            .items()
            .findIndex((stack) => stack?.getName() === item);
        return slot < 0 ? `the ${item} went on but sits in no inventory slot` : slot;
    } finally {
        runtime.remove(WEARER_ID, 'parity scenario complete');
    }
};

/** The entity scenarios about the item slots commands address. */
export const slotScenarios: readonly BehaviorScenario<JavaSlotName>[] = [
    {
        name: 'item-slot-name',
        java: "Every slot name Java's SlotRanges registers is one a command can name, standing for the same slots.",
        reference: 'Java net.minecraft.world.inventory.SlotRanges in 26.3; issue #3567',
        subjects: javaSlotNames,
        idOf: (subject) => subject.name,
        covers: () => undefined,
        run: (subject) => {
            const ids = javaSlotIds(subject.name);
            if (ids === undefined) return `the server does not know slot ${subject.name}`;
            if (ids.length !== subject.size)
                return `the server reads ${subject.name} as ${ids.length} slots; Java reads ${subject.size}`;
            if (subject.ids !== undefined && ids.join(',') !== subject.ids.join(','))
                return `the server numbers ${subject.name} ${ids.join(', ')}; Java numbers it ${subject.ids.join(', ')}`;
            return undefined;
        }
    }
];

/** The scenario that reads slot names on staged entities. */
export const entitySlotScenarios: readonly BehaviorScenario<EntitySlot>[] = [
    {
        name: 'entity-item-slot',
        java: "A slot name reaches a slot on an entity exactly when Java's getSlot answers it there.",
        reference:
            'Java LivingEntity.getSlot, AbstractHorse.getSlot and canUseSlot, AbstractChestedHorse.getSlot, InventoryCarrier and ContainerEntity.getChestVehicleSlot; issue #3567',
        subjects: () => ENTITY_SLOTS,
        idOf: (subject) => `${subject.label}/${subject.slot}`,
        covers: () => undefined,
        run: (subject) => {
            const bedrock = mappedEntity(subject.javaId)?.bedrock;
            if (bedrock === undefined) return `${subject.javaId} maps to no Bedrock entity`;
            const outcome = withEntity(bedrock, GROUND, (entity) => {
                for (const event of subject.events) entity.instance.fire(event);
                entity.instance.applyQueuedEvents();
                // The runtime sizes a mount's container to its tamed group on its next pass.
                tickStage();
                const worn = subject.wearing === undefined ? undefined : wear(entity, subject.wearing);
                return { resolved: resolveSlotName({ name: subject.slot }, mobSlotHolder(entity)), worn };
            });
            if (typeof outcome === 'string') return outcome;
            const { resolved, worn } = outcome;
            if (resolved.ok !== subject.has) {
                return resolved.ok
                    ? `the server writes ${subject.slot} on a ${subject.label}, which Java does not have`
                    : `the server refuses ${subject.slot} on a ${subject.label}: ${resolved.refusal}`;
            }
            if (worn === undefined || !resolved.ok) return undefined;
            if (typeof worn === 'string') return worn;
            return resolved.slots.some((slot) => slot.container === 'inventory' && slot.slot === worn)
                ? `${subject.slot} on a ${subject.label} reaches inventory slot ${worn}, where its ${subject.wearing} is`
                : undefined;
        },
        classify: (subject) =>
            subject.slot === 'horse.chest'
                ? {
                      kind: 'deferred',
                      reason: "A mount's chest is the minecraft:is_chested component group, which a slot write does not switch yet.",
                      reference: 'https://github.com/JSPrismarine/JSPrismarine/issues/3608'
                  }
                : undefined
    }
];
