import BinaryStream from "@jsprismarine/jsbinaryutils";
import { ByteOrder } from "./nbt/ByteOrder";
import NBTTagCompound from "./nbt/NBTTagCompound";
import * as fs from "fs";
import * as util from "util"


let buf = fs.readFileSync(__dirname + '/assets.dat');
let str = new BinaryStream(buf);

console.log('Decoding started!');
let root = NBTTagCompound.readFromStream(str, ByteOrder.BIG_ENDIAN);
// console.log(util.inspect(root, {showHidden: true, depth: null}));

let str2 = new BinaryStream();
root.writeToStream(str2, ByteOrder.BIG_ENDIAN);

let time = Date.now();
// console.log('Decoding-encoding test passed: ' + str.getBuffer().equals(str2.getBuffer()) ? 'true' : 'false');
console.log(str.getBuffer());
console.log(str2.getBuffer());
console.log(`Decoding took ${Date.now() - time}`);