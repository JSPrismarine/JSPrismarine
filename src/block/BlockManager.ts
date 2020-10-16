import fs from "fs";
import path from "path";

import Block from "./";
import * as Logger from "../utils/Logger";
import { BlockToolType } from "./BlockToolType";
import Prismarine from "../prismarine";

export default class BlockManager {
    private blocks = new Map()

    constructor(server: Prismarine) {
        this.importBlocks(server);
    }

    public getBlock(name: string): Block | null {
        return this.blocks.get(name) || null;
    }
    public getBlockById(id: number): Block | null {
        if (!BlockToolType[id])
            return null;

        return this.getBlocks().filter(a => a.id === id)[0] || null;
    }
    public getBlockByIdAndMeta(id: number, meta: number): Block | null {
        if (!BlockToolType[id])
            return null;

        return this.getBlocks().filter(a => a.id === id && a.meta == meta)[0] || null;
    }
    public getBlockByRuntimeId(id: number): Block | null {
        return this.getBlocks()[id] || null;
    }
    public getBlocks(): Array<Block> {
        return Array.from(this.blocks.values());
    }


    public registerClassBlock(block: Block, server: Prismarine) {
        // The runtime ID is a unique ID sent with the start-game packet
        // ours is always based on the block's index in the this.blocks map
        // starting from 0.
        block.setRuntimeId(this.blocks.size);
        server.getLogger().silly(`Block with id §b${block.name}§r registered`);
        this.blocks.set(block.name, block);
    }

    importBlocks(server: Prismarine) {
        try {
            const blocks = fs.readdirSync(path.join(__dirname, 'blocks'));
            blocks.forEach((id: string) => {
                if (id.includes('.test.') || id.includes('.d.ts'))
                    return;  // Exclude test files

                const block = require(`./blocks/${id}`).default;
                try {
                    this.registerClassBlock(new block(), server);
                } catch (err) {
                    server.getLogger().error(`${id} failed to register!`);
                }
            });
            server.getLogger().debug(`Registered §b${blocks.length}§r block(s)!`);
        } catch (err) {
            server.getLogger().error(`Failed to register blocks: ${err}`);
        }
    }
}
