/**
 * PacketCompressionAlgorithm, from Mojang's published protocol documentation.
 *
 * Generated - do not edit. Change `datagen/manifest.json` and run `pnpm generate`.
 * Source: Mojang/bedrock-protocol-docs release v1.26.60 (Minecraft 1.26.60, protocol 2225)
 * Upstream name: PacketCompressionAlgorithm
 */
export enum PacketCompressionAlgorithm {
    ZLIB = 0,
    SNAPPY = 1,
    NONE = 65535
}
