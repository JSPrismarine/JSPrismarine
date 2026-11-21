/**
 * What one entity carries, as named containers of item slots
 * ([plan](../../../../docs/plans/unified-item-slots.md)).
 *
 * A layout decides which containers an entity has and how many slots each one holds. A player
 * has a 36-slot `inventory` whose first nine slots are the hotbar, and its main hand is the
 * hotbar slot the hand points at. A mob has a `mainhand` container of its own. Equipment is a
 * view over the containers: `equipment('head')` reads `armor` slot 0, and an alias points an
 * equipment slot at another container slot, as a horse's armor lives in its inventory.
 */
import type { EntityContainer, SlotValue } from './slotLog';
import { itemOfSlotValue, slotValueOfItem } from './slotLog';
import { ItemContainer } from './ItemContainer';
import type { Item } from '../item/Item';
import type { ServerContent } from '../content/ServerContent';
import type { PlainData } from '../world/changelog/PlainData';
import type { ViewableEquipment } from '../entity/predicateView';
import type { MobEquipmentSlot } from '../entity/equipment';
import { MOB_EQUIPMENT_SLOTS } from '../entity/equipment';
import { PrismarineServerErrors } from '@jsprismarine/errors/prismarine/server';

/** Helmet, chestplate, leggings, boots: the `armor` container's slots, in the order the client numbers them. */
export const ARMOR_SLOTS = 4;

/** Slots the hotbar reaches, and so the range a player's hand slot may name. */
export const HOTBAR_SIZE = 9;

/** The containers an {@link EntityInventory} holds: every entity container but the crafting grid. */
export type InventoryContainer = Exclude<EntityContainer, 'crafting'>;

/** One slot of one container of an {@link EntityInventory}. */
export interface SlotAddress {
    readonly container: InventoryContainer;
    readonly slot: number;
}

/** Which containers an entity has, and how big each one is. */
export interface InventoryLayout<C extends InventoryContainer> {
    /** Each container's name and number of slots. */
    readonly containers: readonly (readonly [C, number])[];
    /**
     * How many of the first `inventory` slots the hand can point at, which is a player's hotbar.
     * Without it the main hand is the `mainhand` container's one slot.
     */
    readonly hotbar?: number;
}

/** Hears every write to what an entity carries, which is how it reaches the change log. */
export interface EntityInventoryObserver {
    /** One slot of one container changed, from `before` to `after`. */
    slot(container: InventoryContainer, slot: number, before: SlotValue, after: SlotValue): void;
    /** The hand moved from one hotbar slot to another. */
    handSlot(before: number, after: number): void;
}

/** The armor container slot each worn equipment slot reads. */
const ARMOR_SLOT_OF: Readonly<Partial<Record<MobEquipmentSlot, number>>> = { head: 0, chest: 1, legs: 2, feet: 3 };

/**
 * The containers a player carries, besides the crafting grid.
 *
 * - `inventory` is the 36 main slots, hotbar first. The hand slot names one of the first nine.
 * - `armor` is a container of its own rather than four more main slots, because the client
 *   addresses it as one (`ContainerUiId.ARMOR_CONTAINER`) and because everything that walks the
 *   inventory looking for space would otherwise offer to put a pickaxe on your head.
 * - `offhand` is one slot, for a shield or a torch.
 * - `ender_chest` is on the player and not on a block for the reason vanilla puts it there:
 *   every `minecraft:ender_chest` in every dimension shows the same 27 slots to one player.
 * - `cursor` is the stack held by the pointer between picking it up and putting it down. A drag
 *   is two requests, one that moves a stack onto the pointer and a later one that moves it off,
 *   so the stack needs somewhere to be in between.
 */
export const PLAYER_LAYOUT = {
    containers: [
        ['inventory', 36],
        ['armor', ARMOR_SLOTS],
        ['offhand', 1],
        ['ender_chest', 27],
        ['cursor', 1]
    ],
    hotbar: HOTBAR_SIZE
} as const satisfies InventoryLayout<InventoryContainer>;

/** The containers a player layout has. */
export type PlayerInventoryContainer = (typeof PLAYER_LAYOUT)['containers'][number][0];

/**
 * A mob's layout: one slot each for the main hand, the off hand and the body, four armor slots
 * and an inventory of the size its `minecraft:inventory` component gives.
 * @param inventorySize - The `inventory` container's number of slots, 0 for a mob with none.
 */
export const mobLayout = (inventorySize: number) =>
    ({
        containers: [
            ['mainhand', 1],
            ['offhand', 1],
            ['armor', ARMOR_SLOTS],
            ['body', 1],
            ['inventory', inventorySize]
        ]
    }) as const satisfies InventoryLayout<InventoryContainer>;

/** The containers a mob layout has. */
export type MobInventoryContainer = ReturnType<typeof mobLayout>['containers'][number][0];

/**
 * Named containers of item slots, laid out for one kind of entity.
 *
 * `C` is the containers the layout has, so {@link EntityInventory.container} returns a container
 * and never undefined for one of them. Code that has a name off the change log or the wire uses
 * {@link EntityInventory.containerNamed}, which returns undefined for a container the layout lacks.
 */
export class EntityInventory<C extends InventoryContainer = InventoryContainer> {
    /** The containers in layout order, with their names. */
    private readonly named: readonly (readonly [C, ItemContainer])[];

    /** The same containers by name, for a name read off the change log or the wire. */
    private readonly byName = new Map<string, ItemContainer>();

    /** How many `inventory` slots the hand can point at; 0 when the main hand is a container of its own. */
    private readonly hotbar: number;

    /** Which `inventory` slot the hand points at, when the layout has a hotbar. */
    private handSlot = 0;

    /** Equipment slots read through another container slot, such as a horse's body armor. */
    private readonly aliases = new Map<MobEquipmentSlot, SlotAddress>();

    /** Hears hand moves once {@link EntityInventory.observe} has been called. */
    private observer: EntityInventoryObserver | null = null;

    public constructor(layout: InventoryLayout<C>) {
        this.named = layout.containers.map(([name, size]) => [name, new ItemContainer(size)] as const);
        for (const [name, container] of this.named) this.byName.set(name, container);
        this.hotbar = layout.hotbar ?? 0;
    }

    /**
     * One of the layout's containers.
     * @throws {TypeError} When the layout has no such container, which the type of `name` rules out.
     */
    public container(name: C): ItemContainer {
        const found = this.byName.get(name);
        if (found === undefined) throw new PrismarineServerErrors.UnknownInventoryContainer({ container: name });
        return found;
    }

    /**
     * A container by a name read off the change log or the wire.
     * @returns The container, or undefined for a name this layout has no container for, such as
     *   `crafting`, which is a `CraftingInput`.
     */
    public containerNamed(name: string): ItemContainer | undefined {
        return this.byName.get(name);
    }

    /** Every container with its name, in layout order. */
    public entries(): readonly (readonly [C, ItemContainer])[] {
        return this.named;
    }

    /**
     * Reports every later write to any container, and every move of the hand.
     *
     * A stack changed in place is not a write; see {@link ItemContainer.observe}.
     * @param observer - Hears each write. It replaces any observer set before.
     */
    public observe(observer: EntityInventoryObserver): void {
        this.observer = observer;
        for (const [name, container] of this.named) {
            container.observe((slot, before, after) => observer.slot(name, slot, before, after));
        }
    }

    /** Whether a slot number names one the hand can point at: a hotbar slot. */
    public isHandSlot(slot: number): boolean {
        return Number.isInteger(slot) && slot >= 0 && slot < this.hotbar;
    }

    /** Which `inventory` slot the hand points at. Always 0 for a layout with no hotbar. */
    public getHandSlot(): number {
        return this.handSlot;
    }

    /**
     * Points the hand at a hotbar slot, as the client reports it.
     * @param slot - The hotbar slot. Anything outside the hotbar is ignored, because it arrives
     *   off the wire and is not to be trusted as an index.
     */
    public setHandSlot(slot: number): void {
        if (!this.isHandSlot(slot)) return;

        const before = this.handSlot;
        this.handSlot = slot;
        if (before !== slot) this.observer?.handSlot(before, slot);
    }

    /**
     * Reads and writes an equipment slot through another container slot, or stops doing so.
     * @param slot - The equipment slot.
     * @param address - Where its stack lives, or undefined to read it from its own container again.
     */
    public setAlias(slot: MobEquipmentSlot, address: SlotAddress | undefined): void {
        if (address === undefined) this.aliases.delete(slot);
        else this.aliases.set(slot, address);
    }

    /**
     * The container slot an equipment slot reads and writes.
     * @returns The address, or undefined when the layout has no container for it, such as a
     *   player's `body`.
     */
    public equipmentAddress(slot: MobEquipmentSlot): SlotAddress | undefined {
        const address = this.aliases.get(slot) ?? this.ownAddress(slot);
        if (address === undefined || !this.byName.get(address.container)?.has(address.slot)) return undefined;
        return address;
    }

    private ownAddress(slot: MobEquipmentSlot): SlotAddress | undefined {
        if (slot === 'mainhand') {
            return this.hotbar > 0
                ? { container: 'inventory', slot: this.handSlot }
                : { container: 'mainhand', slot: 0 };
        }
        if (slot === 'offhand' || slot === 'body') return { container: slot, slot: 0 };
        const armor = ARMOR_SLOT_OF[slot];
        return armor === undefined ? undefined : { container: 'armor', slot: armor };
    }

    /** The stack in an equipment slot, or null when it is empty or the layout has no such slot. */
    public equipment(slot: MobEquipmentSlot): Item | null {
        const address = this.equipmentAddress(slot);
        return address === undefined ? null : (this.byName.get(address.container)?.get(address.slot) ?? null);
    }

    /**
     * Puts a stack in an equipment slot, through the container slot it reads.
     * @param item - The stack, or null to empty the slot.
     * @returns Whether the layout has the slot.
     */
    public setEquipment(slot: MobEquipmentSlot, item: Item | null): boolean {
        const address = this.equipmentAddress(slot);
        return address !== undefined && (this.byName.get(address.container)?.set(address.slot, item) ?? false);
    }

    /**
     * Resizes the stack in an equipment slot, as using some of it does. The slot holds a copy at
     * the new size, so the change log hears the write, and a count of zero or less empties it.
     * @returns Whether the slot held a stack to resize.
     */
    public setEquipmentCount(slot: MobEquipmentSlot, count: number): boolean {
        const held = this.equipment(slot);
        return held !== null && this.setEquipment(slot, held.withCount(count));
    }

    /**
     * What is worn and held, as the network layer and the enchantment effect components read it.
     * An empty slot is left out.
     */
    public getEquipment(): ViewableEquipment {
        const view: ViewableEquipment = {};
        for (const slot of MOB_EQUIPMENT_SLOTS) {
            const item = this.equipment(slot);
            if (item !== null) view[slot] = item;
        }
        return view;
    }

    /**
     * Armor points worn, summed across the four armor slots.
     *
     * Each piece reads its own figure off Java's `minecraft:attribute_modifiers`, so an iron
     * chestplate is worth six here because Java says six.
     * @returns Points, out of twenty for a full diamond set.
     */
    public getArmorDefensePoints(): number {
        return this.sumArmor((item) => item.getArmorDefensePoints());
    }

    /** Armor toughness worn, which only diamond and netherite have any of. */
    public getArmorToughness(): number {
        return this.sumArmor((item) => item.getArmorToughness());
    }

    private sumArmor(of: (item: Item) => number): number {
        return (this.byName.get('armor')?.stacks() ?? []).reduce((total, item) => total + of(item), 0);
    }

    /**
     * Writes a logged value back into a slot, which is how the change log undoes a write. The
     * write is reported like any other, and the store ignores it while it is undoing.
     * @param container - The container the entry names. The crafting grid is not this inventory's.
     * @param slot - The slot.
     * @param value - The logged value to write back.
     * @param content - The content build, which decides an item's maximum durability.
     * @returns Whether this inventory has that container and slot.
     */
    public restoreSlot(container: string, slot: number, value: PlainData, content?: ServerContent): boolean {
        const target = this.containerNamed(container);
        if (target === undefined || !target.has(slot)) return false;
        return target.set(slot, itemOfSlotValue(value, content));
    }

    /**
     * What a slot holds, as it is stored.
     * @param container - The container an `inventory-slot` entry names.
     * @returns The stack, null for an empty slot, or undefined when this inventory has no such slot.
     */
    public slotItem(container: string, slot: number): Item | null | undefined {
        const target = this.containerNamed(container);
        return target === undefined || !target.has(slot) ? undefined : target.get(slot);
    }

    /**
     * What one slot holds, as its slot entries log it.
     * @returns The value, or null for an empty slot or one this inventory does not have.
     */
    public slotValue(container: string, slot: number): SlotValue {
        return slotValueOfItem(this.containerNamed(container)?.get(slot) ?? null);
    }
}
