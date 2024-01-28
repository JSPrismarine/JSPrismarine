/* eslint-disable complexity */
import { Allocation } from './Allocation.js';
import BinaryStream from '@jsprismarine/jsbinaryutils';
import { ByteOrder } from './ByteOrder.js';
import { NBTDefinitions } from './NBTDefinitions.js';
import NBTStreamReader from './NBTStreamReader.js';
import NBTTagCompound from './NBTTagCompound.js';

export default class NBTReader extends NBTStreamReader {
    public constructor(input: BinaryStream, byteOrder: ByteOrder) {
        super(input, byteOrder);
    }

    public parseList<TagType>(): Set<TagType> {
        this.expectInput(this.isUsingVarint() ? 2 : 3, 'Invalid NBT Data: Not enough data to read new tag', false);
        if (this.readByteValue().getValue() !== NBTDefinitions.TAG_LIST) {
            throw new Error('Invalid NBT Data: Not list tag found');
        }

        this.readStringValue();
        return this.readTagListValue();
    }

    public parse(): NBTTagCompound {
        this.expectInput(this.isUsingVarint() ? 2 : 3, 'Invalid NBT Data: Not enough data to read new tag', false);
        if (this.readByteValue().getValue() !== NBTDefinitions.TAG_COMPOUND) {
            throw new Error('Invalid NBT Data: No root tag found');
        }

        const name: string = this.readStringValue().getValue();
        const root: NBTTagCompound = this.readTagCompoundValue();
        root.setName(name);
        return root;
    }

    private readTagCompoundValue(): NBTTagCompound {
        this.alterAllocationLimit(Allocation.COMPOUND);
        const compound: NBTTagCompound = new NBTTagCompound();
        this.expectInput(1, 'Invalid NBT Data: Expected Tag ID in compound tag', false);

        let tagID = this.readByteValue().getValue();
        while (tagID !== NBTDefinitions.TAG_END) {
            switch (tagID) {
                case NBTDefinitions.TAG_BYTE:
                    compound.addValue(this.readStringValue().getValue(), this.readByteValue());
                    break;
                case NBTDefinitions.TAG_SHORT:
                    compound.addValue(this.readStringValue().getValue(), this.readShortValue());
                    break;
                case NBTDefinitions.TAG_INT:
                    compound.addValue(this.readStringValue().getValue(), this.readIntValue());
                    break;
                case NBTDefinitions.TAG_LONG:
                    compound.addValue(this.readStringValue().getValue(), this.readLongValue());
                    break;
                case NBTDefinitions.TAG_FLOAT:
                    compound.addValue(this.readStringValue().getValue(), this.readFloatValue());
                    break;
                case NBTDefinitions.TAG_DOUBLE:
                    compound.addValue(this.readStringValue().getValue(), this.readDoubleValue());
                    break;
                case NBTDefinitions.TAG_BYTE_ARRAY:
                    compound.addValue(this.readStringValue().getValue(), this.readByteArrayValue());
                    break;
                case NBTDefinitions.TAG_STRING:
                    compound.addValue(this.readStringValue().getValue(), this.readStringValue());
                    break;
                case NBTDefinitions.TAG_LIST:
                    compound.addValue(this.readStringValue().getValue(), this.readTagListValue());
                    break;
                case NBTDefinitions.TAG_COMPOUND:
                    const name: string = this.readStringValue().getValue();
                    const child: NBTTagCompound = this.readTagCompoundValue();
                    child.setName(name);
                    compound.addChild(child);
                    break;
                case NBTDefinitions.TAG_INT_ARRAY:
                    compound.addValue(this.readStringValue().getValue(), this.readIntArrayValue());
                    break;
                default:
                    throw new Error(`Invalid NBT Data: Unknown tag <${tagID}>`);
            }

            this.expectInput(1, 'Invalid NBT Data: Expected tag ID in tag compound', false);
            tagID = this.readByteValue().getValue();
        }

        return compound;
    }

    private readTagListValue(): Set<any> {
        this.expectInput(this.isUsingVarint() ? 2 : 5, 'Invalid NBT Data: Expected TAGList header', false);
        const listType: number = this.readByteValue().getValue();
        let listLength: number = this.readIntValue().getValue();

        this.alterAllocationLimit(Allocation.ARRAY_LIST);
        this.alterAllocationLimit(Allocation.REFERENCE);

        const backingList: Set<any> = new Set();

        switch (listType) {
            case NBTDefinitions.TAG_END:
                listLength = 0;
                break;
            case NBTDefinitions.TAG_BYTE:
                this.expectInput(listLength, 'Invalid NBT Data: Expected bytes for list');
                for (let i = 0; i < listLength; i++) {
                    backingList.add(this.readShortValue());
                }

                break;
            case NBTDefinitions.TAG_SHORT:
                this.expectInput(2 * listLength, 'Invalid NBT Data: Expected shorts for list');
                for (let i = 0; i < listLength; i++) {
                    backingList.add(this.readShortValue());
                }

                break;
            case NBTDefinitions.TAG_INT:
                this.expectInput(4 * listLength, 'Invalid NBT Data: Expected ints for list');
                for (let i = 0; i < listLength; i++) {
                    backingList.add(this.readIntValue());
                }

                break;
            case NBTDefinitions.TAG_LONG:
                this.expectInput(8 * listLength, 'Invalid NBT Data: Expected longs for list');
                for (let i = 0; i < listLength; i++) {
                    backingList.add(this.readLongValue());
                }

                break;
            case NBTDefinitions.TAG_FLOAT:
                this.expectInput(4 * listLength, 'Invalid NBT Data: Expected floats for list');
                for (let i = 0; i < listLength; i++) {
                    backingList.add(this.readFloatValue());
                }

                break;
            case NBTDefinitions.TAG_DOUBLE:
                this.expectInput(8 * listLength, 'Invalid NBT Data: Expected doubles for list');
                for (let i = 0; i < listLength; i++) {
                    backingList.add(this.readDoubleValue());
                }

                break;
            case NBTDefinitions.TAG_BYTE_ARRAY:
                for (let i = 0; i < listLength; i++) {
                    backingList.add(this.readByteArrayValue());
                }

                break;
            case NBTDefinitions.TAG_STRING:
                for (let i = 0; i < listLength; i++) {
                    backingList.add(this.readStringValue());
                }

                break;
            case NBTDefinitions.TAG_LIST:
                for (let i = 0; i < listLength; i++) {
                    backingList.add(this.readTagListValue());
                }

                break;
            case NBTDefinitions.TAG_COMPOUND:
                for (let i = 0; i < listLength; i++) {
                    backingList.add(this.readTagCompoundValue());
                }

                break;
            case NBTDefinitions.TAG_INT_ARRAY:
                for (let i = 0; i < listLength; i++) {
                    backingList.add(this.readIntArrayValue());
                }

                break;
            default:
                throw new Error(`Invalid NBT Data: Unknown tag <${listType}>`);
        }

        return backingList;
    }
}
