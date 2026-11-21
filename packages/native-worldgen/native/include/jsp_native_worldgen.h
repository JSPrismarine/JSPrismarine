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

/* The 32-bit words of one cell program record: the operation, then up to five operands. */
#define JWG_CELL_WORDS 6

/*
 * Registers a cell program: node_count records of JWG_CELL_WORDS words as
 * @jsprismarine/worldgen's CellProgram lays them out, root first, the constants they name, and
 * how many interpolated cells they read. Returns its handle, or 0 when a record names something
 * out of range, a record runs a TypeScript fallback, the cell holds more than 4096 values, or
 * memory runs out.
 */
JWG_EXPORT double jwg_cell_create(
    const int32_t *nodes,
    int32_t node_count,
    const double *constants,
    int32_t constant_count,
    int32_t cell_count,
    int32_t xz,
    int32_t y
);

/* Frees a cell program. A handle of 0 is ignored. */
JWG_EXPORT void jwg_cell_destroy(double handle);

/*
 * Fills out with the tree's value at every block of one cell, x-major, then z, then y. corners
 * holds eight corner values per interpolated cell, in CellProgram's corner order. Hook records
 * take their neutral constant, so call this only for a context with no hook set.
 */
JWG_EXPORT void jwg_cell_fill(double handle, const double *corners, double *out);

/* The fluid codes jwg_aquifer_fill writes, and the bit that asks for a fluid tick. */
#define JWG_FLUID_AIR 0
#define JWG_FLUID_WATER 1
#define JWG_FLUID_LAVA 2
/* The dimension's default fluid when it is neither water, lava nor air. */
#define JWG_FLUID_OTHER 3
/* No fluid: the position keeps the dimension's default block. */
#define JWG_FLUID_NONE 4
#define JWG_FLUID_SCHEDULE 0x80

/* The density programs an aquifer reads: barrier, floodedness, spread, lava, exclusion, surface level. */
#define JWG_AQUIFER_PROGRAMS 6

/*
 * Registers the noise-driven aquifer of one chunk extent. programs holds JWG_AQUIFER_PROGRAMS
 * point program handles; the seed lanes are the aquifer's Xoroshiro positional factory, its low
 * half then its high half, each as unsigned high and low 32 bits; extent holds the lowest block x,
 * y and z, then the highest, inclusive. default_fluid is one of the JWG_FLUID_ codes but NONE, and
 * skip_sampling_above_y is NoiseBasedAquifer's cutoff. Returns its handle, or 0.
 */
JWG_EXPORT double jwg_aquifer_create(
    const double *programs,
    double seed_lo_hi,
    double seed_lo_lo,
    double seed_hi_hi,
    double seed_hi_lo,
    const int32_t *extent,
    int32_t sea_level,
    int32_t default_fluid,
    int32_t skip_sampling_above_y
);

/* Frees an aquifer. A handle of 0 is ignored. */
JWG_EXPORT void jwg_aquifer_destroy(double handle);

/*
 * Runs the aquifer over one cell's densities, in the cell walk's order. cell holds the first x, y
 * and z, the last, inclusive, and the x and z strides of densities and out, whose y stride is 1.
 * Writes each block's fluid code, with JWG_FLUID_SCHEDULE set where a fluid tick is wanted.
 * Returns 1, or 0 when a block reads a cell outside the extent, which leaves out incomplete.
 */
JWG_EXPORT int32_t jwg_aquifer_fill(double handle, const double *densities, const int32_t *cell, uint8_t *out);

#endif
