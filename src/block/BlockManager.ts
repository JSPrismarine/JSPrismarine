import fs from "fs";
import path from "path";

import Block from "./";
import * as Logger from "../utils/Logger";

export default class BlockManager {
    private blocks = new Map()

    constructor() {
        this.importBlocks();
    }

    getBlock(name: string) {
        return this.blocks.get(name)
    }
    getBlocks() {
        return Array.from(this.blocks.values());
    }


    registerClassBlock(block: Block) {
        Logger.silly(`Block with id §b${block.name}§r registered`);
        this.blocks.set(block.name, block)
    }

    importBlocks() {
        try {
            const blocks = fs.readdirSync(path.join(__dirname, 'blocks'));
            blocks.forEach((id: string) => {
                if (id.includes('.test.') || id.includes('.d.ts'))
                    return;  // Exclude test files

                const block = require(`./blocks/${id}`).default;
                try {
                    this.registerClassBlock(new block());
                } catch (err) {
                    Logger.error(`${id} failed to register!`);
                }
            });
            Logger.debug(`Registered §b${blocks.length}§r block(s)!`);
        } catch (err) {
            Logger.error(`Failed to register blocks: ${err}`);
        }
    }
}
