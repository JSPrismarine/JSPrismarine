import * as fs from 'fs';

import BinaryStream from '@jsprismarine/jsbinaryutils';
import { ByteOrder } from './ByteOrder';
import ByteVal from './types/ByteVal';
import DoubleVal from './types/DoubleVal';
import FloatVal from './types/FloatVal';
import LongVal from './types/LongVal';
import NBTReader from './NBTReader';
import NBTWriter from './NBTWriter';
import NumberVal from './types/NumberVal';
import ShortVal from './types/ShortVal';
import StringVal from './types/StringVal';

export default class NBTTagCompound {
    private name: string | null;
    private children: Map<string, any> = new Map();

    public static readFromFile(
        path: string,
        byteOrder: ByteOrder
    ): NBTTagCompound {
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

    public getByte(name: string, defaultValue: number): number {
        return this.children.has(name)
            ? (this.children.get(name) as ByteVal).getValue()
            : defaultValue;
    }

    public getShort(name: string, defaultValue: number): number {
        return this.children.has(name)
            ? (this.children.get(name) as ShortVal).getValue()
            : defaultValue;
    }

    public getNumber(name: string, defaultValue: number): number {
        return this.children.has(name)
            ? (this.children.get(name) as NumberVal).getValue()
            : defaultValue;
    }

    public getLong(name: string, defaultValue: bigint): bigint {
        return this.children.has(name)
            ? (this.children.get(name) as LongVal).getValue()
            : defaultValue;
    }

    public getFloat(name: string, defaultValue: number): number {
        return this.children.has(name)
            ? (this.children.get(name) as FloatVal).getValue()
            : defaultValue;
    }

    public getDouble(name: string, defaultValue: number): number {
        return this.children.has(name)
            ? (this.children.get(name) as DoubleVal).getValue()
            : defaultValue;
    }

    public getString(name: string, defaultValue: string): string {
        return this.children.has(name)
            ? (this.children.get(name) as StringVal).getValue()
            : defaultValue;
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
