import { BlockToolType } from '../block/BlockToolType';
import type { ItemProps } from './Item';
import { ItemTieredToolType } from './ItemTieredToolType';
import Tool from './Tool';

/**
 * What a swing with each tool is worth, by tool type and then by tier.
 *
 * One table rather than a `getAttackDamage` in each of the thirty-odd tool files, and it can be
 * one because a tiered tool already knows both of the things the answer depends on: `getTier`
 * comes from here and `getToolType` is declared by the item itself.
 *
 * The tiers are indexed by {@link ItemTieredToolType}, whose order is the *harvest* order - gold
 * sits between wood and stone, because gold mines what stone mines. It does not hit like stone.
 * Gold's damage is wood's, which is why the second and third entries of every row are equal and
 * why a table indexed by tier cannot simply be an ascending run of numbers.
 * @see https://minecraft.wiki/w/Damage#Attack_damage
 */
const ATTACK_BY_TIER: Partial<Record<BlockToolType, readonly number[]>> = {
    //                            None Wood Gold Stone Iron Diamond Netherite
    [BlockToolType.Sword]: /*  */ [1, 4, 4, 5, 6, 7, 8],
    [BlockToolType.Axe]: /*    */ [1, 3, 3, 4, 5, 6, 7],
    [BlockToolType.Pickaxe]: /**/ [1, 2, 2, 3, 4, 5, 6],
    [BlockToolType.Shovel]: /* */ [1, 2, 2, 3, 4, 5, 6]
};

/** What anything not in the table is worth: the same as a fist. */
const BARE_HANDED = 1;

export class TieredTool extends Tool {
    private readonly tier: ItemTieredToolType = ItemTieredToolType.None;

    public constructor(args: ItemProps, tier: ItemTieredToolType) {
        super(args);
        this.tier = tier;
    }

    public getTier() {
        return this.tier;
    }

    public getToolHarvestLevel() {
        return this.getTier();
    }

    /**
     * Half-hearts a swing with this tool is worth.
     *
     * Shears and anything whose type is not in the table fall back to a fist's one point, which
     * is what vanilla does with them too.
     * @returns {number} The damage, before criticals and enchantments.
     */
    public override getAttackDamage(): number {
        return ATTACK_BY_TIER[this.getToolType()]?.[this.getTier()] ?? BARE_HANDED;
    }
}
