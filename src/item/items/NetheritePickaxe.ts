import TieredTool from "../TieredTool";
import { BlockToolType } from "../../block/BlockToolType";
import { ItemIdsType } from "../ItemIdsType";
import { ItemTieredToolType } from "../ItemTieredToolType";

export default class Pickaxe extends TieredTool {
    constructor() {
        super(
            {
                name: "minecraft:netherite_pickaxe",
                id: ItemIdsType.NetheritePickaxe,
            },
            ItemTieredToolType.Netherite
        );
    }

    getMaxDurability() {
        return 2032;
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }
}
