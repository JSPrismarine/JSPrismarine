import { defineErrors } from './defineErrors';

/** The errors `@jsprismarine/binaryutils` throws. */
export const BinaryutilsErrors = defineErrors('binaryutils', {
    /**
     * The stream was created for writing and has no buffer to read from. Pass a buffer when
     * creating a stream you read.
     */
    WriteOnlyStream: 'Buffer is write only!',
    /**
     * A read went past the end of the data. The bytes are shorter than the format being read says
     * they should be, so they are truncated or not that format.
     */
    EndOfBuffer: 'No bytes left in buffer',
    /**
     * A 32-bit variable-length integer had its continuation bit set in all five bytes it may take,
     * so the data is malformed.
     */
    VarintUnterminated: 'VarInt did not terminate after 5 bytes!',
    /**
     * A variable-length integer's fifth byte sets bits past the 32nd, so the encoded value cannot
     * fit and the data is malformed.
     */
    VarintOverflows32Bits: 'VarInt overflows 32 bits!',
    /**
     * A 64-bit variable-length integer had its continuation bit set in all ten bytes it may take,
     * so the data is malformed.
     */
    VarlongUnterminated: 'VarLong did not terminate after 10 bytes!',
    /**
     * A variable-length long sets bits past the 64th, so the encoded value cannot fit and the data
     * is malformed.
     */
    VarlongOverflows64Bits: 'VarLong overflows 64 bits!'
});
