import BinaryStream from "@jsprismarine/jsbinaryutils";
import { ByteOrder } from "./nbt/ByteOrder";
import NBTReader from "./nbt/NBTReader";
import NBTTagCompound from "./nbt/NBTTagCompound";
import * as fs from "fs";
import * as util from "util"

let buf = fs.readFileSync(__dirname + '/assets.dat');
let str = new BinaryStream(buf);
let root = NBTTagCompound.readFromStream(str, ByteOrder.BIG_ENDIAN);
// console.log(util.inspect(root, {showHidden: true, depth: null}));
