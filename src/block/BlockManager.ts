import fs from "fs";
import path from "path";

import Block from "./";
import RuntimeBlockMapping from "./RuntimeBlockMapping";
import * as Logger from "../utils/Logger";
import { BlockToolType } from "./BlockToolType";

export default class BlockManager {
    private blocks = new Map()
    private runtimeMapper = new RuntimeBlockMapping();

    constructor() {
        this.importBlocks();
    }

    getBlock(name: string): Block | null {
        return this.blocks.get(name) || null;
    }
    getBlockById(id: number): Block | null {
        if (!BlockToolType[id])
            return null;

        return this.getBlocks().filter(a => a.id === id)[0] || null;
    }
    getBlockByRuntimeId(id: number): Block | null {
        return this.getBlockById(this.runtimeMapper.toId(id))
    }
    getBlocks(): Array<Block> {
        return Array.from(this.blocks.values());
    }

    getRuntimeBlockMapper() {
        return this.runtimeMapper;
    }


    registerClassBlock(block: Block) {
        block.setRuntimeId(this.getRuntimeBlockMapper().toRuntimeId(block.id)); // Hacky solution?
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
