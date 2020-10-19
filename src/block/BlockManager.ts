import fs from "fs";
import path from "path";

import Block from "./";
import { BlockToolType } from "./BlockToolType";
import Prismarine from "../prismarine";

export default class BlockManager {
    private server: Prismarine;
    private blocks = new Map()

    constructor(server: Prismarine) {
        this.server = server;
    }

    /**
     * onStart hook
     */
    public async onStart() {
        this.importBlocks();
    }

     /**
     * onExit hook
     */
    public async onExit() {
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
        if (!BlockToolType[id])
            return null;

        return this.getBlocks().filter(a => a.id === id)[0] || null;
    }

    /**
     * Get block by numeric id and damage value
     */
    public getBlockByIdAndMeta(id: number, meta: number): Block | null {
        if (!BlockToolType[id])
            return null;

        return this.getBlocks().filter(a => a.id === id && a.meta == meta)[0] || null;
    }

    /**
     * Get block by runtime id
     */
    public getBlockByRuntimeId(id: number): Block | null {
        return this.getBlocks()[id] || null;
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
        block.setRuntimeId(this.blocks.size);
        this.server.getLogger().silly(`Block with id §b${block.name}§r registered`);
        this.blocks.set(block.name, block);
    }

    /**
     * Loops through ./src/block/blocks and register them
     */
    private importBlocks() {
        try {
            const blocks = fs.readdirSync(path.join(__dirname, 'blocks'));
            blocks.forEach((id: string) => {
                if (id.includes('.test.') || id.includes('.d.ts'))
                    return;  // Exclude test files

                const block = require(`./blocks/${id}`).default;
                try {
                    this.registerClassBlock(new block());
                } catch (err) {
                    this.server.getLogger().error(`${id} failed to register!`);
                }
            });
            this.server.getLogger().debug(`Registered §b${blocks.length}§r block(s)!`);
        } catch (err) {
            this.server.getLogger().error(`Failed to register blocks: ${err}`);
        }
    }
}
