import CraftingInput from '../crafting/CraftingInput';
import HumanInventory from '../inventory/HumanInventory';
import { itemOfSlotValue, playerContainerNamed } from '../inventory/slotLog';
import { Vector3 } from '@jsprismarine/math';
import { Entity } from './Entity';
import { logLegacySlot, logLegacyWrite } from './legacyAdapter';
import type { PlainData } from '../world/changelog/PlainData';
import type { Attribute } from '@jsprismarine/protocol/wire/structures/Attribute';
import { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { ViewableEquipment } from './predicateView';

/**
 * How far a human's eyes are above its feet, in blocks.
 *
 * Load-bearing, and not for rendering. Bedrock clients report their position as the position of
 * their *eyes*, and this server stores what the client reports and echoes it back unchanged - so
 * a player's `getPosition` is 1.62 higher than every other entity's, which are feet. Anything
 * comparing a player against another entity's body has to take it off first.
 */
export const EYE_HEIGHT = 1.62;

/** The position a human reports when their feet are at `feet`: the same spot, {@link EYE_HEIGHT} up. */
export const eyePositionAt = (feet: Vector3): Vector3 =>
    new Vector3(feet.getX(), feet.getY() + EYE_HEIGHT, feet.getZ());

/**
 * Represents a Player entity.
 * @internal
 */
export default class Human extends Entity {
    public static MOB_ID = 'minecraft:player';
    protected inventory = new HumanInventory();

    /** What is sitting in the crafting slots, whether the inventory's four or a table's nine. */
    protected readonly craftingInput = new CraftingInput();

    /**
     * A human's constructor. Every slot it carries, the hand slot and the crafting grid report
     * their writes to the change log through the legacy adapter from here on.
     * @param options - What {@link Entity} takes.
     */
    public constructor(options: ConstructorParameters<typeof Entity>[0]) {
        super(options);
        this.inventory.observeCarried({
            slot: (container, slot, before, after) => logLegacySlot(this, container, slot, before, after),
            handSlot: (before, after) => logLegacyWrite(this, 'inventory.handSlot', before, after)
        });
        this.craftingInput.observe((slot, before, after) => logLegacySlot(this, 'crafting', slot, before, after));
    }

    /** A human has a food bar, experience and luck on top of what everything living has. */
    protected override getDefaultAttributes(): Attribute[] {
        return Attributes.getPlayerDefaults();
    }

    /**
     * Mobs are shoved out of a player's way.
     *
     * Only ever in that direction: a player's position comes from their own client, so the server
     * moving them would be overruled on the next movement packet and read as rubber-banding. The
     * player displaces mobs; nothing displaces the player.
     */
    public override occupiesSpace(): boolean {
        return true;
    }

    /**
     * The bottom of a player's body, which is {@link EYE_HEIGHT} below what they report.
     *
     * This is what made a player able to shove a villager and nothing else. Comparing a player's
     * reported height against a mob's body without taking the eyes off puts the player's "feet"
     * at chest height, so only mobs taller than 1.62 - villagers, zombies, skeletons - overlapped
     * them at all. Every cow, sheep, chicken and spider was, geometrically, underfoot.
     */
    public override getFeetY(): number {
        return this.getPosition().getY() - this.getEyeHeight();
    }

    /**
     * How far above the feet the position this human reports is.
     * @returns The eye height, in blocks; one place to change when a human is not the default size.
     */
    public getEyeHeight(): number {
        return EYE_HEIGHT;
    }

    /**
     * Armor points worn.
     *
     * The last link in a chain that was complete at both ends and joined in the middle by nothing:
     * twenty-four armor items have declared their protection since long before this, and the
     * damage formula has known what to do with it since the pipeline was written - but there were
     * no armor slots to read, so every blow landed as though the player were naked.
     * @returns {number} Points, out of twenty for a full diamond set.
     */
    public override getArmorDefensePoints(): number {
        return this.inventory.getArmorDefensePoints();
    }

    /** Armor toughness worn, which softens what a hard blow does to that armor. */
    public override getArmorToughness(): number {
        return this.inventory.getArmorToughness();
    }

    /** What is worn and held, which is what the enchantment effect components are run over. */
    public override getEquipment(): ViewableEquipment {
        return this.inventory.getEquipment();
    }

    public getInventory(): HumanInventory {
        return this.inventory;
    }

    public getCraftingInput(): CraftingInput {
        return this.craftingInput;
    }

    /** Writes a logged hand slot back; other fields are the entity's. */
    public override restoreLoggedField(field: string, value: PlainData): boolean {
        if (field !== 'inventory.handSlot') return super.restoreLoggedField(field, value);
        if (typeof value !== 'number') throw new TypeError(`${field} cannot hold ${String(value)}`);
        this.inventory.setHandSlot(value);
        return true;
    }

    /** Writes a logged stack back into a slot of a container this human carries. */
    public override restoreLoggedSlot(container: string, slot: number, value: PlainData): boolean {
        const named = playerContainerNamed(container);
        if (named === undefined) return false;
        const content = this.getServer().getContent();
        if (named !== 'crafting') return this.inventory.restoreSlot(named, slot, value, content);
        if (!Number.isInteger(slot) || slot < 0 || slot >= CraftingInput.SLOTS) return false;
        this.craftingInput.set(slot, itemOfSlotValue(value, content));
        return true;
    }
}
