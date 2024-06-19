export const RAKNET_TPS = 10;
export const MAX_CHANNELS = 32;
export const MINECRAFT_PROTOCOL_VERSION = 11;
export const UDP_HEADER_SIZE = 28;
export const OFFLINE_MESSAGE_DATA_ID: Buffer = Buffer.from(
    '\u0000\u00FF\u00FF\u0000\u00FE\u00FE\u00FE\u00FE\u00FD\u00FD\u00FD\u00FD\u0012\u0034\u0056\u0078',
    'binary'
);

// https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/MTUSize.h
export const MAX_MTU_SIZE = 1492;
export const MIN_MTU_SIZE = 400;
