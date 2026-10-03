import CraftingInput from '../crafting/CraftingInput';
import HumanInventory from '../inventory/HumanInventory';
import { Entity } from './Entity';
import { type Attribute, Attributes } from './Attribute';

/**
 * How far a human's eyes are above its feet, in blocks.
 *
 * Load-bearing, and not for rendering. Bedrock clients report their position as the position of
 * their *eyes*, and this server stores what the client reports and echoes it back unchanged - so
 * a player's `getPosition` is 1.62 higher than every other entity's, which are feet. Anything
 * comparing a player against another entity's body has to take it off first.
 */
export const EYE_HEIGHT = 1.62;

/**
 * Represents a Player entity.
 * @internal
 */
export default class Human extends Entity {
    public static MOB_ID = 'minecraft:player';
    protected inventory = new HumanInventory();

    /** What is sitting in the crafting slots, whether the inventory's four or a table's nine. */
    protected readonly craftingInput = new CraftingInput();

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
        return this.position.getY() - EYE_HEIGHT;
    }

    /**
     * Armour points worn.
     *
     * The last link in a chain that was complete at both ends and joined in the middle by nothing:
     * twenty-four armour items have declared their protection since long before this, and the
     * damage formula has known what to do with it since the pipeline was written - but there were
     * no armour slots to read, so every blow landed as though the player were naked.
     * @returns {number} Points, out of twenty for a full diamond set.
     */
    public override getArmorDefensePoints(): number {
        return this.inventory.getArmorDefensePoints();
    }

    /** Armour toughness worn, which softens what a hard blow does to that armour. */
    public override getArmorToughness(): number {
        return this.inventory.getArmorToughness();
    }

    public getInventory(): HumanInventory {
        return this.inventory;
    }

    public getCraftingInput(): CraftingInput {
        return this.craftingInput;
    }
}
