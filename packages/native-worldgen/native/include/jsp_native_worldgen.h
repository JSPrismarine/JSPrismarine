/*
 * The C interface of @jsprismarine/native-worldgen: terrain generation's hot loops, in the same
 * float rounding as @jsprismarine/worldgen's TypeScript.
 *
 * Every argument the per-sample calls take is a double, the shape node:ffi called fastest when
 * this was measured (docs/research/spikes/native-noise). A noise stack's handle is therefore the
 * stack's address as a double: user-space addresses on every published platform fit in the 53
 * bits a double holds exactly.
 */
#ifndef JSP_NATIVE_WORLDGEN_H
#define JSP_NATIVE_WORLDGEN_H

#include <stdint.h>

#if defined(_WIN32)
#define JWG_EXPORT __declspec(dllexport)
#else
#define JWG_EXPORT __attribute__((visibility("default")))
/* The 32-bit words of one density program record: the operation, then up to five operands. */
#define JWG_PROGRAM_WORDS 6

/*
 * Registers a density program: nodeCount records of JWG_PROGRAM_WORDS words in nodes, with the
 * constants, the link lists and the noise stack handles they name, and cacheSlots memo slots.
 * Node 0 is the root. Returns the program's handle, or 0 when a record names something out of
 * range or memory runs out. The operations are PointOp in src/densityProgram.ts.
 */
JWG_EXPORT double jwg_program_create(
    const int32_t *nodes,
    int32_t nodeCount,
    const double *constants,
    int32_t constantCount,
    const int32_t *links,
    int32_t linkCount,
    const double *stacks,
    int32_t stackCount,
    int32_t cacheSlots
);

/* Frees a program. A handle of 0 is ignored. */
JWG_EXPORT void jwg_program_destroy(double handle);

/*
 * The program's value at one position, as the density closures compute it. A program is not
 * reentrant: its caches belong to the thread that calls it.
 */
JWG_EXPORT double jwg_program_eval(double handle, double x, double y, double z);

/*
 * Registers a climate search tree as packages/worldgen/src/biome/Climate.ts flattens it: per node,
 * seven min/max bound pairs, its child range, its leaf value index (-1 for a subtree) and its
 * first leaf rank; then the child list. Returns the tree's handle, or 0 when a node names a child
 * that does not exist or memory runs out.
 */
JWG_EXPORT double jwg_climate_create(
    const double *bounds,
    const uint32_t *childStarts,
    const uint32_t *childCounts,
    const int32_t *valueIndices,
    const uint32_t *firstLeafRanks,
    int32_t nodeCount,
    const uint32_t *children,
    int32_t childTotal,
    int32_t maxDepth
);

/* Frees a climate tree. A handle of 0 is ignored. */
JWG_EXPORT void jwg_climate_destroy(double handle);

/*
 * The leaf nearest the quantized target, starting from the candidate leaf the previous search
 * returned (-1 for none), as closestLeaf in Climate.ts finds it. Returns -1 when the tree yields
 * no leaf. A tree is not reentrant: its search stack belongs to the thread that calls it.
 */
JWG_EXPORT double jwg_climate_find(
    double handle,
    double candidate,
    double temperature,
    double humidity,
    double continentalness,
    double erosion,
    double depth,
    double weirdness
);

#endif

/* The interface version; the binding refuses a library that answers another. */
#define JWG_ABI_VERSION 1

/*
 * The number of doubles per layer in jwg_stack_create's params: x, y and z offsets, frequency,
 * amplitude, and the smear scale (0 for plain Perlin noise).
 */
#define JWG_LAYER_PARAMS 6

JWG_EXPORT int32_t jwg_abi_version(void);

/*
 * Registers an octave stack: count layers, each a 256-byte permutation table in perms and
 * JWG_LAYER_PARAMS doubles in params. Returns the stack's handle, or 0 when it cannot be made.
 */
JWG_EXPORT double jwg_stack_create(const uint8_t *perms, const double *params, int32_t count);

/* Frees a stack. A handle of 0 is ignored. */
JWG_EXPORT void jwg_stack_destroy(double handle);

/* The stack's value at one position, as NoiseStack.get3 computes it. */
JWG_EXPORT double jwg_stack_get3(double handle, double x, double y, double z);

/* Fills out[i] with the stack's value at xyz[3i], xyz[3i + 1], xyz[3i + 2], for count positions. */
JWG_EXPORT void jwg_stack_fill(double handle, const double *xyz, double *out, int32_t count);

/* The 32-bit words of one density program record: the operation, then up to five operands. */
#define JWG_PROGRAM_WORDS 6

/*
 * Registers a density program: nodeCount records of JWG_PROGRAM_WORDS words in nodes, with the
 * constants, the link lists and the noise stack handles they name, and cacheSlots memo slots.
 * Node 0 is the root. Returns the program's handle, or 0 when a record names something out of
 * range or memory runs out. The operations are PointOp in src/densityProgram.ts.
 */
JWG_EXPORT double jwg_program_create(
    const int32_t *nodes,
    int32_t nodeCount,
    const double *constants,
    int32_t constantCount,
    const int32_t *links,
    int32_t linkCount,
    const double *stacks,
    int32_t stackCount,
    int32_t cacheSlots
);

/* Frees a program. A handle of 0 is ignored. */
JWG_EXPORT void jwg_program_destroy(double handle);

/*
 * The program's value at one position, as the density closures compute it. A program is not
 * reentrant: its caches belong to the thread that calls it.
 */
JWG_EXPORT double jwg_program_eval(double handle, double x, double y, double z);

/*
 * Registers a climate search tree as packages/worldgen/src/biome/Climate.ts flattens it: per node,
 * seven min/max bound pairs, its child range, its leaf value index (-1 for a subtree) and its
 * first leaf rank; then the child list. Returns the tree's handle, or 0 when a node names a child
 * that does not exist or memory runs out.
 */
JWG_EXPORT double jwg_climate_create(
    const double *bounds,
    const uint32_t *childStarts,
    const uint32_t *childCounts,
    const int32_t *valueIndices,
    const uint32_t *firstLeafRanks,
    int32_t nodeCount,
    const uint32_t *children,
    int32_t childTotal,
    int32_t maxDepth
);

/* Frees a climate tree. A handle of 0 is ignored. */
JWG_EXPORT void jwg_climate_destroy(double handle);

/*
 * The leaf nearest the quantized target, starting from the candidate leaf the previous search
 * returned (-1 for none), as closestLeaf in Climate.ts finds it. Returns -1 when the tree yields
 * no leaf. A tree is not reentrant: its search stack belongs to the thread that calls it.
 */
JWG_EXPORT double jwg_climate_find(
    double handle,
    double candidate,
    double temperature,
    double humidity,
    double continentalness,
    double erosion,
    double depth,
    double weirdness
);

/*
 * The three jitter offsets of one biome lattice point, as Java's BiomeManager derives them from the
 * zoom seed (given as its unsigned high and low 32 bits) and the point's coordinates. Each offset
 * is bits 24 to 33 of one step of Java's linear congruential generator; the result packs the x, y
 * and z offsets' bits as x | y << 10 | z << 20.
 */
JWG_EXPORT double jwg_biome_jitter(double seed_hi, double seed_lo, double x, double y, double z);

#endif
