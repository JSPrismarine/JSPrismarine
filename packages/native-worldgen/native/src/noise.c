/*
 * Java's ImprovedNoise sample and the octave stack NormalNoise builds, in the rounding of
 * packages/worldgen/src/noise/{PerlinNoise,NoiseStack,GradientNoise}.ts: every f32(...) there is
 * one float operation here, and everything else is a double. The build compiles this with
 * -ffp-contract=off, so no multiply and add fuse into one rounding.
 */
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "jsp_native_worldgen.h"

static const float GX[16] = {1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, 0, -1, 0};
static const float GY[16] = {1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1};
static const float GZ[16] = {0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 1, 0, -1};

typedef struct {
    uint8_t perm[256];
    double ox, oy, oz;
    double freq;
    float amp;
} Layer;

typedef struct {
    int32_t count;
    Layer layers[];
} Stack;

/* The largest address a double holds exactly. */
#define HANDLE_LIMIT 9007199254740992.0

static inline double wrap(double v) {
    const double half = 16777216.0 - 0x1p-29;
    if (v >= -half && v < half) return v;
    return v - floor(v / 33554432.0 + 0.5) * 33554432.0;
}

/*
 * JavaScript's ToInt32, which worldgen's floor() applies (`Math.floor(value) | 0`): the integer
 * wrapped modulo 2^32, and 0 for NaN and the infinities. A plain C cast is undefined outside the
 * int range, so the far side of that range goes through fmod.
 */
static inline int32_t to_int32(double v) {
    if (v >= -2147483648.0 && v < 2147483648.0) return (int32_t)v;
    if (!isfinite(v)) return 0;
    double wrapped = fmod(trunc(v), 4294967296.0);
    if (wrapped < 0) wrapped += 4294967296.0;
    return (int32_t)(uint32_t)wrapped;
}

static inline float smoothstep(float x) {
    float a = (float)((float)(x * x) * x);
    float b = (float)((float)(x * (float)((float)(x * 6.0f) - 15.0f)) + 10.0f);
    return (float)(a * b);
}

static inline float dot(int g, float x, float y, float z) {
    float s = (float)(GX[g] * x + GY[g] * y);
    return (float)(s + GZ[g] * z);
}

static inline float lerpf(float a, float from, float to) { return (float)(from + (float)(a * (float)(to - from))); }

static float sample(const Layer *l, double x, double y, double z) {
    double wx = wrap(x) + l->ox, wy = wrap(y) + l->oy, wz = wrap(z) + l->oz;
    int32_t fx = to_int32(floor(wx)), fy = to_int32(floor(wy)), fz = to_int32(floor(wz));
    float rx = (float)(wx - fx), ry = (float)(wy - fy), rz = (float)(wz - fz);
    const uint8_t *p = l->perm;
    /* Unsigned, so a sum past the int range wraps as JavaScript's & does instead of overflowing. */
    uint32_t ux = (uint32_t)fx, uy = (uint32_t)fy, uz = (uint32_t)fz;
    uint32_t x0 = p[ux & 0xff] + uy, x1 = p[(ux + 1) & 0xff] + uy;
    uint32_t xy00 = p[x0 & 0xff] + uz, xy01 = p[(x0 + 1) & 0xff] + uz;
    uint32_t xy10 = p[x1 & 0xff] + uz, xy11 = p[(x1 + 1) & 0xff] + uz;
    float rx1 = (float)(rx - 1), ry1 = (float)(ry - 1), rz1 = (float)(rz - 1);
    float d000 = dot(p[xy00 & 0xff] & 15, rx, ry, rz);
    float d100 = dot(p[xy10 & 0xff] & 15, rx1, ry, rz);
    float d010 = dot(p[xy01 & 0xff] & 15, rx, ry1, rz);
    float d110 = dot(p[xy11 & 0xff] & 15, rx1, ry1, rz);
    float d001 = dot(p[(xy00 + 1) & 0xff] & 15, rx, ry, rz1);
    float d101 = dot(p[(xy10 + 1) & 0xff] & 15, rx1, ry, rz1);
    float d011 = dot(p[(xy01 + 1) & 0xff] & 15, rx, ry1, rz1);
    float d111 = dot(p[(xy11 + 1) & 0xff] & 15, rx1, ry1, rz1);
    float ax = smoothstep(rx), ay = smoothstep(ry), az = smoothstep(rz);
    float q0 = lerpf(ay, lerpf(ax, d000, d100), lerpf(ax, d010, d110));
    float q1 = lerpf(ay, lerpf(ax, d001, d101), lerpf(ax, d011, d111));
    return lerpf(az, q0, q1);
}

static inline const Stack *stack_of(double handle) { return (const Stack *)(uintptr_t)handle; }

int32_t jwg_abi_version(void) { return JWG_ABI_VERSION; }

double jwg_stack_create(const uint8_t *perms, const double *params, int32_t count) {
    if (count < 0) return 0;
    Stack *s = malloc(sizeof(Stack) + sizeof(Layer) * (size_t)count);
    if (s == NULL) return 0;
    if ((double)(uintptr_t)s >= HANDLE_LIMIT) {
        free(s);
        return 0;
    }
    s->count = count;
    for (int32_t i = 0; i < count; i++) {
        const double *layer = params + (size_t)i * JWG_LAYER_PARAMS;
        memcpy(s->layers[i].perm, perms + (size_t)i * 256, 256);
        s->layers[i].ox = layer[0];
        s->layers[i].oy = layer[1];
        s->layers[i].oz = layer[2];
        s->layers[i].freq = layer[3];
        s->layers[i].amp = (float)layer[4];
    }
    return (double)(uintptr_t)s;
}

void jwg_stack_destroy(double handle) {
    if (handle != 0) free((void *)(uintptr_t)handle);
}

double jwg_stack_get3(double handle, double x, double y, double z) {
    const Stack *s = stack_of(handle);
    float value = 0;
    for (int32_t i = 0; i < s->count; i++) {
        const Layer *l = &s->layers[i];
        float v = sample(l, x * l->freq, y * l->freq, z * l->freq);
        value = (float)(value + (float)(l->amp * v));
    }
    return value;
}

void jwg_stack_fill(double handle, const double *xyz, double *out, int32_t count) {
    for (int32_t i = 0; i < count; i++) out[i] = jwg_stack_get3(handle, xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2]);
}
