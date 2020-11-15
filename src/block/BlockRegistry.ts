import type Prismarine from '../Prismarine';
import type Block from './Block';
import AcaciaPlanks from './blocks/AcaciaPlanks';
import AcaciaSapling from './blocks/AcaciaSapling';
import Air from './blocks/Air';
import Andesite from './blocks/Andesite';
import Bedrock from './blocks/Bedrock';
import BirchPlanks from './blocks/BirchPlanks';
import BirchSapling from './blocks/BirchSapling';

export default class BlockRegistry {
    private server: Prismarine;
    private blocks: Map<string, Block> = new Map();

    constructor(server: Prismarine) {
        this.server = server;
    }

    public getBlocks(): Map<string, Block> {
        return this.blocks;
    }

    public async onEnable() {
        const time = Date.now();

        this.blocks.set('minecraft:acacia_planks', new AcaciaPlanks());
        this.blocks.set('minecraft:acacia_sapling', new AcaciaSapling());
        this.blocks.set('minecraft:air', new Air());
        this.blocks.set('minecraft:andesite', new Andesite());
        this.blocks.set('minecraft:bedrock', new Bedrock());
        this.blocks.set('minecraft:birch_planks', new BirchPlanks());
        this.blocks.set('minecraft:birch_sapling', new BirchSapling());

        this.server
            .getLogger()
            .debug(
                `Registered §b${this.blocks.size}§r block(s) (took ${
                    Date.now() - time
                } ms)!`
            );
    }
    public async onDisable() {
        this.blocks.clear();
    }
}
