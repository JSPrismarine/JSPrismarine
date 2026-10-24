import fs from 'node:fs';

import BinaryStream from '@jsprismarine/binaryutils';
import type { ByteOrder } from './ByteOrder';
import NBTReader from './NBTReader';
import NBTWriter from './NBTWriter';
import ByteVal from './types/ByteVal';
import DoubleVal from './types/DoubleVal';
import FloatVal from './types/FloatVal';
import LongVal from './types/LongVal';
import NumberVal from './types/NumberVal';
import ShortVal from './types/ShortVal';
import StringVal from './types/StringVal';

type NumberTag = ByteVal | ShortVal | NumberVal | FloatVal | DoubleVal;

function isNumberTag(value: unknown): value is NumberTag {
    return (
        value instanceof ByteVal ||
        value instanceof ShortVal ||
        value instanceof NumberVal ||
        value instanceof FloatVal ||
        value instanceof DoubleVal
    );
}

export default class NBTTagCompound {
    private name: string | null;
    public readonly children: Map<string, any> = new Map();

    public static readFromFile(path: string, byteOrder: ByteOrder): NBTTagCompound {
        return NBTTagCompound.readFromStream(new BinaryStream(fs.readFileSync(path)), byteOrder);
    }

    public static readFromStream(input: BinaryStream, byteOrder: ByteOrder, varints = false): NBTTagCompound {
        const reader: NBTReader = new NBTReader(input, byteOrder);
        reader.setUseVarint(varints);
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

    public writeToStream(out: BinaryStream, byteOrder: ByteOrder, varints = false): void {
        const writer: NBTWriter = new NBTWriter(out, byteOrder);
        writer.setUseVarint(varints);
        writer.writeCompound(this);
    }

    public getByte(name: string, defaultValue: number): number {
        return this.numberAt(name, defaultValue);
    }

    public getShort(name: string, defaultValue: number): number {
        return this.numberAt(name, defaultValue);
    }

    public getNumber(name: string, defaultValue: number): number {
        return this.numberAt(name, defaultValue);
    }

    public getLong(name: string, defaultValue: bigint): bigint {
        const value = this.children.get(name);
        return value instanceof LongVal ? value.getValue() : defaultValue;
    }

    public getFloat(name: string, defaultValue: number): number {
        return this.numberAt(name, defaultValue);
    }

    public getDouble(name: string, defaultValue: number): number {
        return this.numberAt(name, defaultValue);
    }

    public getString(name: string, defaultValue: string): string {
        const value = this.children.get(name);
        return value instanceof StringVal ? value.getValue() : defaultValue;
    }

    // The numeric getters accept any number-valued tag, not only the one matching the
    // getter's name. Bedrock stores some tags with a different width than the vanilla
    // layout documents (`ItemRotation` is a float read through `getByte`), and callers
    // depend on that leniency.
    private numberAt(name: string, defaultValue: number): number {
        const value = this.children.get(name);
        return isNumberTag(value) ? value.getValue() : defaultValue;
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
