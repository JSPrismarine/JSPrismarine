// Spike: Java's ImprovedNoise / PerlinNoise octave stack, in the rounding of
// packages/worldgen/src/noise/{PerlinNoise,NoiseStack,GradientNoise}.ts. Build with
// -ffp-contract=off so no multiply-add fuses.
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

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
    int count;
    Layer layers[];
} Stack;

static inline double wrap(double v) {
    const double half = 16777216.0 - 0x1p-29;
    if (v >= -half && v < half) return v;
    return v - floor(v / 33554432.0 + 0.5) * 33554432.0;
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
    int fx = (int)floor(wx), fy = (int)floor(wy), fz = (int)floor(wz);
    float rx = (float)(wx - fx), ry = (float)(wy - fy), rz = (float)(wz - fz);
    const uint8_t *p = l->perm;
    int x0 = p[fx & 0xff] + fy, x1 = p[(fx + 1) & 0xff] + fy;
    int xy00 = p[x0 & 0xff] + fz, xy01 = p[(x0 + 1) & 0xff] + fz;
    int xy10 = p[x1 & 0xff] + fz, xy11 = p[(x1 + 1) & 0xff] + fz;
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

/* perms: count*256 bytes; params: count*5 doubles (ox, oy, oz, freq, amp). */
void *jsp_stack_create(const uint8_t *perms, const double *params, int count) {
    Stack *s = malloc(sizeof(Stack) + sizeof(Layer) * count);
    s->count = count;
    for (int i = 0; i < count; i++) {
        memcpy(s->layers[i].perm, perms + i * 256, 256);
        s->layers[i].ox = params[i * 5];
        s->layers[i].oy = params[i * 5 + 1];
        s->layers[i].oz = params[i * 5 + 2];
        s->layers[i].freq = params[i * 5 + 3];
        s->layers[i].amp = (float)params[i * 5 + 4];
    }
    return s;
}

double jsp_stack_get3(const void *handle, double x, double y, double z) {
    const Stack *s = handle;
    float value = 0;
    for (int i = 0; i < s->count; i++) {
        const Layer *l = &s->layers[i];
        float v = sample(l, x * l->freq, y * l->freq, z * l->freq);
        value = (float)(value + (float)(l->amp * v));
    }
    return value;
}

/* Fills out[i] for positions xyz[3i..3i+2]; both buffers registered by pointer. */
void jsp_stack_fill(const void *handle, const double *xyz, double *out, int count) {
    for (int i = 0; i < count; i++) out[i] = jsp_stack_get3(handle, xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2]);
}
