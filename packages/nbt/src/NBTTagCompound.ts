import fs from 'node:fs';

import BinaryStream from '@jsprismarine/jsbinaryutils';
import type { ByteOrder } from './ByteOrder';
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
    public readonly children: Map<string, any> = new Map();

    public static readFromFile(path: string, byteOrder: ByteOrder): NBTTagCompound {
        return NBTTagCompound.readFromStream(new BinaryStream(fs.readFileSync(path)), byteOrder);
    }

    public static readFromStream(input: BinaryStream, byteOrder: ByteOrder): NBTTagCompound {
        const reader: NBTReader = new NBTReader(input, byteOrder);
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
        if (value instanceof NBTTagCompound && name !== value.getName()) {
            throw new Error(`Failed to add NBTTagCompound with name ${value.getName()} given name ${name}`);
        }

        this.children.set(name, value);
    }

    public addChild(tag: NBTTagCompound): void {
        this.children.set(tag.getName()!, tag);
    }

    public getList(name: string, insert: boolean): Set<any> | null {
        if (this.children.has(name)) {
            return this.children.get(name);
        }

        if (insert) {
            const backingList: Set<any> = new Set();
            this.addValue(name, backingList);
            return backingList;
        }

        return null;
    }

    public getCompound(name: string, insert: boolean): NBTTagCompound | null {
        if (this.children.has(name)) {
            return this.children.get(name);
        }

        if (insert) {
            const compound: NBTTagCompound = new NBTTagCompound();
            this.addValue(name, compound);
            return compound;
        }

        return null;
    }

    public writeToStream(out: BinaryStream, byteOrder: ByteOrder): void {
        const writer: NBTWriter = new NBTWriter(out, byteOrder);
        writer.writeCompound(this);
    }

    public getByte(name: string, defaultValue: number): number {
        return this.children.has(name) ? (this.children.get(name) as ByteVal).getValue() : defaultValue;
    }

    public getShort(name: string, defaultValue: number): number {
        return this.children.has(name) ? (this.children.get(name) as ShortVal).getValue() : defaultValue;
    }

    public getNumber(name: string, defaultValue: number): number {
        return this.children.has(name) ? (this.children.get(name) as NumberVal).getValue() : defaultValue;
    }

    public getLong(name: string, defaultValue: bigint): bigint {
        return this.children.has(name) ? (this.children.get(name) as LongVal).getValue() : defaultValue;
    }

    public getFloat(name: string, defaultValue: number): number {
        return this.children.has(name) ? (this.children.get(name) as FloatVal).getValue() : defaultValue;
    }

    public getDouble(name: string, defaultValue: number): number {
        return this.children.has(name) ? (this.children.get(name) as DoubleVal).getValue() : defaultValue;
    }

    public getString(name: string, defaultValue: string): string {
        return this.children.has(name) ? (this.children.get(name) as StringVal).getValue() : defaultValue;
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

    // Thanks stackoverflow! https://stackoverflow.com/questions/35948335/how-can-i-check-if-two-map-objects-are-equal
    public equals(that: NBTTagCompound): boolean {
        if (this.children.size !== that.children.size) {
            return false;
        }

        for (const [key, val] of this.children) {
            const testVal = that.children.get(key);

            if (testVal === undefined && !that.children.has(key)) {
                return false;
            }

            if (val instanceof NBTTagCompound && testVal instanceof NBTTagCompound && !val.equals(testVal)) {
                return false;
            }

            if (val instanceof ByteVal && testVal instanceof ByteVal && val.getValue() !== testVal.getValue()) {
                return false;
            }

            if (val instanceof DoubleVal && testVal instanceof DoubleVal && val.getValue() !== testVal.getValue()) {
                return false;
            }

            if (val instanceof FloatVal && testVal instanceof FloatVal && val.getValue() !== testVal.getValue()) {
                return false;
            }

            if (val instanceof LongVal && testVal instanceof LongVal && val.getValue() !== testVal.getValue()) {
                return false;
            }

            if (val instanceof NumberVal && testVal instanceof NumberVal && val.getValue() !== testVal.getValue()) {
                return false;
            }

            if (val instanceof ShortVal && testVal instanceof ShortVal && val.getValue() !== testVal.getValue()) {
                return false;
            }

            if (val instanceof StringVal && testVal instanceof StringVal && val.getValue() !== testVal.getValue()) {
                return false;
            }
        }

        return true;
    }
}
