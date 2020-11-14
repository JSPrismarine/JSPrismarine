import BinaryStream from "@jsprismarine/jsbinaryutils";
import { ByteOrder } from "./ByteOrder";
import NBTReader from "./NBTReader";
import NBTWriter from "./NBTWriter";
import * as fs from "fs";

export default class NBTTagCompound {
    private name: string | null;
    private children: Map<string, any> = new Map();

    public static readFromFile(path: string, byteOrder: ByteOrder): NBTTagCompound {
        return NBTTagCompound.readFromStream(
            new BinaryStream(fs.readFileSync(path)),
            byteOrder
        );
    }

    public static readFromStream(
        input: BinaryStream,
        byteOrder: ByteOrder
    ): NBTTagCompound {
        let reader: NBTReader = new NBTReader(input, byteOrder);
        return reader.parse();
    }

    public constructor(name: string | null = null) {
        this.name = name;
    }

    public setName(name: string): void {
        this.name = name;
    }

    public getName(): string | null {
        return this.name;
    }

    public addValue(name: string, value: any): void {
        if (value instanceof NBTTagCompound) {
            if (!(name == value.getName())) {
                throw new Error(
                    `Failed to add NBTTagCompound with name ${value.getName()} given name ${name}`
                );
            }
        }
        this.children.set(name, value);
    }

    public addChild(tag: NBTTagCompound): void {
        this.children.set(tag.getName() as string, tag);
    }

    public getList(name: string, insert: boolean): Set<any> | null {
        if (this.children.has(name)) {
            return this.children.get(name);
        }

        if (insert) {
            let backingList: Set<any> = new Set();
            this.addValue(name, backingList);
            return backingList;
        } else {
            return null;
        }
    }

    public getCompound(name: string, insert: boolean): NBTTagCompound | null {
        if (this.children.has(name)) {
            return this.children.get(name);
        }

        if (insert) {
            let compound: NBTTagCompound = new NBTTagCompound();
            this.addValue(name, compound);
            return compound;
        } else {
            return null;
        }
    }

    public writeToStream(out: BinaryStream, byteOrder: ByteOrder): void {
        let writer: NBTWriter = new NBTWriter(out, byteOrder);
        writer.writeCompound(this);
    }

    public getValue(name: string, defaultValue: any): any {
        return this.children.has(name) ? this.children.get(name) : defaultValue;
    }

    public remove(key: string): boolean {
        return this.children.delete(key);
    }

    public entries(): IterableIterator<[string, any]> {
        return this.children.entries();
    }

    public has(key: string): boolean {
        return this.children.has(key);
    }

    public size(): number {
        return this.children.size;
    }
}
