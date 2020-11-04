import TieredTool from "../TieredTool";
import { BlockToolType } from "../../block/BlockToolType";
import { ItemIdsType } from "../ItemIdsType";
import { ItemTieredToolType } from "../ItemTieredToolType";

export default class NetheriteSword extends TieredTool {
    constructor() {
        super(
            {
                name: "minecraft:netherite_sword",
                id: ItemIdsType.NetheriteSword,
            },
            ItemTieredToolType.Netherite
        );
    }

    getMaxDurability() {
        return 2032;
    }

    getToolType() {
        return BlockToolType.Sword;
    }
}
