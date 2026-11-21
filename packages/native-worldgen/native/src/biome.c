/*
 * The jitter Java's BiomeManager adds to each biome lattice point, as
 * packages/worldgen/src/biome/BiomeManager.ts (fiddleOffsets) draws it. Every step is a 64-bit
 * multiply and add that wraps the way Java's long does, which C's uint64_t does by definition.
 */
#include <stdint.h>

#include "jsp_native_worldgen.h"

#define LCG_MULTIPLIER 6364136223846793005ULL
#define LCG_INCREMENT 1442695040888963407ULL

/* Java's LinearCongruentialGenerator.next. */
static inline uint64_t lcg_next(uint64_t seed, uint64_t value) {
    return seed * (seed * LCG_MULTIPLIER + LCG_INCREMENT) + value;
}

/* Bits 24 to 33 of a value, which Java's floorMod(value >> 24, 1024) reads. */
static inline uint32_t fiddle_bits(uint64_t value) {
    return (uint32_t)(value >> 24) & 1023u;
}

/* A coordinate as the sign-extended long Java passes to next. */
static inline uint64_t as_long(double coordinate) {
    return (uint64_t)(int64_t)coordinate;
}

double jwg_biome_jitter(double seed_hi, double seed_lo, double x, double y, double z) {
    const uint64_t seed = ((uint64_t)(uint32_t)seed_hi << 32) | (uint64_t)(uint32_t)seed_lo;
    const uint64_t lx = as_long(x), ly = as_long(y), lz = as_long(z);
    uint64_t value = lcg_next(seed, lx);
    value = lcg_next(value, ly);
    value = lcg_next(value, lz);
    value = lcg_next(value, lx);
    value = lcg_next(value, ly);
    value = lcg_next(value, lz);
    const uint32_t first = fiddle_bits(value);
    value = lcg_next(value, seed);
    const uint32_t second = fiddle_bits(value);
    value = lcg_next(value, seed);
    const uint32_t third = fiddle_bits(value);
    return (double)(first | (second << 10) | (third << 20));
}
