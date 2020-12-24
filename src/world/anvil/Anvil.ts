import Provider from '../Provider';
// import path from 'path';

// const ANVIL_FORMAT = 'mca';

export default class Anvil extends Provider {
    // private regionPath: string;
    // private regions: Map<string, Buffer> = new Map();

    public constructor(folderPath: string) {
        super(folderPath);
        // this.regionPath = path.join(this.getPath(), 'region');
    }

    public async readChunk({ x, z }: { x: number; z: number }) {
        // const regionX = x >> 5, regionZ = z >> 5;

        try {
            // const regionFile = await fs.promises.readFile(this.getRegionPath(regionX, regionZ));
            // const str = new BinaryStream(regionFile)
            // console.log(str.readInt())
            // console.log(str.readByte())
            // const decodedFile = await util.promisify(Zlib.def)(regionFile);
            // console.log(decodedFile)
            // const NBT = new NBTReader(str, ByteOrder.BIG_ENDIAN);
            // console.log(NBT.parse())
        } catch (e) {
            // console.log("Region x=%d z=%d not found", x, z);
        }
    }

    // private getRegionPath(regionX: number, regionZ: number): string {
    //    return path.join(
    //        this.regionPath,
    //        `r.${regionX}.${regionZ}.${ANVIL_FORMAT}`
    //    );
    // }
}
