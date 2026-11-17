import { Allocation } from './Allocation';
import type BinaryStream from '@jsprismarine/binaryutils';
import type { ByteOrder } from './ByteOrder';
import { NBTDefinitions } from './NBTDefinitions';
import NBTStreamReader from './NBTStreamReader';
import NBTTagCompound from './NBTTagCompound';
import { NbtErrors } from '@jsprismarine/errors/nbt';

export default class NBTReader extends NBTStreamReader {
    public constructor(input: BinaryStream, byteOrder: ByteOrder) {
        super(input, byteOrder);
    }

    public parseList<TagType>(): Set<TagType> {
        this.expectInput(this.isUsingVarint() ? 2 : 3, NbtErrors.ExpectedTagHeader, false);
        if (this.readByteValue().getValue() !== NBTDefinitions.TAG_LIST) {
            throw new NbtErrors.NotListTag();
        }

        this.readStringValue();
        return this.readTagListValue();
    }

    public parse(): NBTTagCompound {
        this.expectInput(this.isUsingVarint() ? 2 : 3, NbtErrors.ExpectedTagHeader, false);
        if (this.readByteValue().getValue() !== NBTDefinitions.TAG_COMPOUND) {
            throw new NbtErrors.NoRootTag();
        }

        const name: string = this.readStringValue().getValue();
        const root: NBTTagCompound = this.readTagCompoundValue();
        root.setName(name);
        return root;
    }

    private readTagCompoundValue(): NBTTagCompound {
        this.alterAllocationLimit(Allocation.COMPOUND);
        const compound: NBTTagCompound = new NBTTagCompound();
        this.expectInput(1, NbtErrors.ExpectedCompoundTagId, false);

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
                    throw new NbtErrors.UnknownTag({ tagID });
            }

            this.expectInput(1, NbtErrors.ExpectedNestedTagId, false);
            tagID = this.readByteValue().getValue();
        }

        return compound;
    }

    private readTagListValue(): Set<any> {
        this.expectInput(this.isUsingVarint() ? 2 : 5, NbtErrors.ExpectedListHeader, false);
        const listType: number = this.readByteValue().getValue();
        let listLength = this.readLength(NbtErrors.NegativeListLength);

        this.alterAllocationLimit(Allocation.ARRAY_LIST);
        this.alterAllocationLimit(Allocation.REFERENCE);

        const backingList: Set<any> = new Set();

        switch (listType) {
            case NBTDefinitions.TAG_END:
                listLength = 0;
                break;
            case NBTDefinitions.TAG_BYTE:
                this.expectInput(listLength, NbtErrors.ExpectedByteList);
                for (let i = 0; i < listLength; i++) {
                    backingList.add(this.readByteValue());
                }

                break;
            case NBTDefinitions.TAG_SHORT:
                this.expectInput(2 * listLength, NbtErrors.ExpectedShortList);
                for (let i = 0; i < listLength; i++) {
                    backingList.add(this.readShortValue());
                }

                break;
            case NBTDefinitions.TAG_INT:
                this.expectInput(4 * listLength, NbtErrors.ExpectedIntList);
                for (let i = 0; i < listLength; i++) {
                    backingList.add(this.readIntValue());
                }

                break;
            case NBTDefinitions.TAG_LONG:
                this.expectInput(8 * listLength, NbtErrors.ExpectedLongList);
                for (let i = 0; i < listLength; i++) {
                    backingList.add(this.readLongValue());
                }

                break;
            case NBTDefinitions.TAG_FLOAT:
                this.expectInput(4 * listLength, NbtErrors.ExpectedFloatList);
                for (let i = 0; i < listLength; i++) {
                    backingList.add(this.readFloatValue());
                }

                break;
            case NBTDefinitions.TAG_DOUBLE:
                this.expectInput(8 * listLength, NbtErrors.ExpectedDoubleList);
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
                throw new NbtErrors.UnknownTag({ tagID: listType });
        }

        return backingList;
    }
}
