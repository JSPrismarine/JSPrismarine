import BinaryStream from "@jsprismarine/jsbinaryutils";
import { ByteOrder } from "./ByteOrder";
import NBTReader from "./NBTReader";

export default class NBTTagCompound {
    private name: string|null;
    private children: Map<string, any> = new Map();

    public static readFromFile(): NBTTagCompound {
        // todo
        return new NBTTagCompound();
    }
    
    public static readFromStream(input: BinaryStream, byteOrder: ByteOrder): NBTTagCompound{
        let reader: NBTReader = new NBTReader(input, byteOrder);
        return reader.parse();
    }

    public constructor(name: string|null = null) {
        this.name = name;
    }

    public setName(name: string): void {
        this.name = name;
    }

    public getName(): string|null {
        return this.name;
    }

    public addValue(name: string, value: any): void {
        if (value instanceof NBTTagCompound) {
            if (!(name == value.getName())) {
                throw new Error(`Failed to add NBTTagCompound with name ${value.getName()} given name ${name}`);
            }
        }
        this.children.set(name, value);
    }

    public addChild(tag: NBTTagCompound): void {
        this.children.set(tag.getName() as string, tag);
    }

    public getList(name: string, insert: boolean): Map<string, any> | null {
        if (this.children.has(name)) {
            return this.children.get(name);
        }

        if (insert) {
            let backingList: Map<string, any> = new Map();
            this.addValue(name, backingList);
            return backingList;
        } else {
            return null;
        }
    }
}