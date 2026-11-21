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
#endif

/* The interface version; the binding refuses a library that answers another. */
#define JWG_ABI_VERSION 1

/* The number of doubles per layer in jwg_stack_create's params: x, y and z offsets, frequency, amplitude. */
#define JWG_LAYER_PARAMS 5

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

#endif
