import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors `@jsprismarine/nbt` throws. */
export const NbtErrors = defineErrors('nbt', {
    /**
     * The NBT data declares more bytes than the reader's allocation limit allows, which guards
     * against data built to exhaust memory. The data is malformed or hostile.
     */
    AllocationLimitReached: 'Could not allocate more bytes due to reaching the set limit',
    /** A compound tag was added under a name that differs from its own. */
    CompoundNameMismatch: 'Failed to add NBTTagCompound with name {name} given name {name2}',
    /** A value was written as NBT that has no NBT type, such as a function or a class instance. */
    UnknownValueType: {
        message: 'Invalid NBT Data: Cannot deduce NBT type of class {name} ({value})',
        base: TypeError
    },
    /** The NBT data ended where a byte should be, so it is truncated. */
    ExpectedByte: 'Invalid NBT Data: Expected byte',
    /** The NBT data ended inside a byte array, so it is truncated. */
    ExpectedByteArray: 'Invalid NBT Data: Expected byte array data',
    /** The NBT data ended inside a list of bytes, so it is truncated. */
    ExpectedByteList: 'Invalid NBT Data: Expected bytes for list',
    /** The NBT data ended where a double should be, so it is truncated. */
    ExpectedDouble: 'Invalid NBT Data: Expected double',
    /** The NBT data ended inside a list of doubles, so it is truncated. */
    ExpectedDoubleList: 'Invalid NBT Data: Expected doubles for list',
    /** The NBT data ended inside a list of floats, so it is truncated. */
    ExpectedFloatList: 'Invalid NBT Data: Expected floats for list',
    /** The NBT data ended where an int should be, so it is truncated. */
    ExpectedInt: 'Invalid NBT Data: Expected int',
    /** The NBT data ended inside an int array, so it is truncated. */
    ExpectedIntArray: 'Invalid NBT Data: Expected int array data',
    /** The NBT data ended inside a list of ints, so it is truncated. */
    ExpectedIntList: 'Invalid NBT Data: Expected ints for list',
    /** The NBT data ended where a long should be, so it is truncated. */
    ExpectedLong: 'Invalid NBT Data: Expected long',
    /** The NBT data ended inside a list of longs, so it is truncated. */
    ExpectedLongList: 'Invalid NBT Data: Expected longs for list',
    /** The NBT data ended where a short should be, so it is truncated. */
    ExpectedShort: 'Invalid NBT Data: Expected short',
    /** The NBT data ended inside a list of shorts, so it is truncated. */
    ExpectedShortList: 'Invalid NBT Data: Expected shorts for list',
    /** The NBT data ended inside a string, so it is truncated. */
    ExpectedString: 'Invalid NBT Data: Expected string bytes',
    /** The NBT data ended where a string's length should be, so it is truncated. */
    ExpectedStringLength: 'Invalid NBT Data: Expected string length',
    /** The NBT data ended inside a compound tag before its end tag, so it is truncated. */
    ExpectedCompoundTagId: 'Invalid NBT Data: Expected Tag ID in compound tag',
    /** The NBT data ended inside a nested compound tag, so it is truncated. */
    ExpectedNestedTagId: 'Invalid NBT Data: Expected tag ID in tag compound',
    /** The NBT data ended where a list's type and length should be, so it is truncated. */
    ExpectedListHeader: 'Invalid NBT Data: Expected TAGList header',
    /** The NBT data declares a byte array with a negative length, so it is malformed. */
    NegativeByteArrayLength: 'Invalid NBT Data: Negative byte array length',
    /** The NBT data declares an int array with a negative length, so it is malformed. */
    NegativeIntArrayLength: 'Invalid NBT Data: Negative int array length',
    /** The NBT data declares a list with a negative length, so it is malformed. */
    NegativeListLength: 'Invalid NBT Data: Negative list length',
    /**
     * The NBT data does not start with a compound tag, so it is not NBT or is in the other byte
     * order.
     */
    NoRootTag: 'Invalid NBT Data: No root tag found',
    /** The NBT data ended where the next tag's header should be, so it is truncated. */
    ExpectedTagHeader: 'Invalid NBT Data: Not enough data to read new tag',
    /** The NBT data was read as a list, but it does not start with a list tag. */
    NotListTag: 'Invalid NBT Data: Not list tag found',
    /** The NBT data has a tag type that does not exist, so it is malformed or not NBT. */
    UnknownTag: 'Invalid NBT Data: Unknown tag <{tagID}>',
    /** A list was written with an element type that does not exist. */
    UnknownListType: 'Invalid NBTTagType'
});
