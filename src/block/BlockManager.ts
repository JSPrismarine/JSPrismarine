import fs from 'fs';
import path from 'path';

import Block from './Block';
import Prismarine from '../Prismarine';
import { BlockIdsType } from './BlockIdsType';

export default class BlockManager {
    private server: Prismarine;
    private blocks = new Map();
    private runtimeIds: Array<number> = [];

    constructor(server: Prismarine) {
        this.server = server;
    }

    /**
     * onEnable hook
     */
    public async onEnable() {
        this.importBlocks();
        this.generateRuntimeIds();
    }

    /**
     * onDisable hook
     */
    public async onDisable() {
        this.blocks.clear();
    }

    /**
     * Get block by namespaced  id
     */
    public getBlock(name: string): Block | null {
        return this.blocks.get(name) || null;
    }

    /**
     * Get block by numeric id
     */
    public getBlockById(id: number): Block | null {
        if (!BlockIdsType[id]) return null;

        return (
            this.getBlocks().filter(
                (a) => a.getId() === id && a.meta === 0
            )[0] || null
        );
    }

    /**
     * Get block by numeric id and damage value
     */
    public getBlockByIdAndMeta(id: number, meta: number): Block | null {
        if (!BlockIdsType[id]) return null;

        return (
            this.getBlocks().filter((a) => a.id === id && a.meta == meta)[0] ||
            null
        );
    }

    /**
     * Get block by runtime id
     */
    public getBlockByRuntimeId(id: number, meta: number = 0): Block | null {
        return this.getBlockByIdAndMeta(this.runtimeIds[id], meta) || null;
    }

    /**
     * Get all blocks
     */
    public getBlocks(): Array<Block> {
        return Array.from(this.blocks.values());
    }

    /**
     * Registers block from block class
     */
    public registerClassBlock(block: Block) {
        // The runtime ID is a unique ID sent with the start-game packet
        // ours is always based on the block's index in the this.blocks map
        // starting from 0.
        this.server
            .getLogger()
            .silly(`Block with id §b${block.name}§r registered`);
        this.blocks.set(block.name, block);
    }

    /**
     * Loops through ./src/block/blocks and register them
     */
    private importBlocks() {
        try {
            const time = Date.now();
            const blocks = fs.readdirSync(path.join(__dirname, 'blocks'));
            blocks.forEach((id: string) => {
                if (id.includes('.test.') || id.includes('.d.ts')) return; // Exclude test files

                const block = require(`./blocks/${id}`).default;
                try {
                    this.registerClassBlock(new block());
                } catch (err) {
                    this.server.getLogger().error(`${id} failed to register!`);
                }
            });
            this.server
                .getLogger()
                .debug(
                    `Registered §b${blocks.length}§r block(s) (took ${
                        Date.now() - time
                    } ms)!`
                );
        } catch (err) {
            this.server.getLogger().error(`Failed to register blocks: ${err}`);
        }
    }

    private generateRuntimeIds() {
        // TODO: once we have NBT writing
        const blocks = this.getBlocks()
            .filter((a) => a.meta === 0 && a.getId() !== 0)
            .sort(() => 0.5 - Math.random()); // Randomize runtimeIds to prevent plugin authors (or us) from using it directly.

        this.runtimeIds.push(0);
        for (let i = 0; i < blocks.length; i++) {
            const variants = this.getBlocks().filter(
                (a) => a.getId() === blocks[i].getId()
            );
            variants.forEach((variant) => variant.setRuntimeId(i));
            this.runtimeIds.push(blocks[i].getId());
        }
    }
}
