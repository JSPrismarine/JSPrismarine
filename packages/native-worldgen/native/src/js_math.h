/*
 * The arithmetic of packages/worldgen/src/math.ts and density/arithmetic.ts, which the density
 * interpreters share. F() is that code's f32(): every value is a double, rounded to float exactly
 * where the TypeScript rounds, and the build compiles with -ffp-contract=off, so the bits match.
 */
#ifndef JSP_JS_MATH_H
#define JSP_JS_MATH_H

#include <math.h>

#define F(v) ((double)(float)(v))

/* JavaScript's Math.min: NaN wins, and -0 is below +0. */
static inline double js_min(double a, double b) {
    if (a != a || b != b) return NAN;
    if (a == 0 && b == 0) return signbit(a) ? a : b;
    return a < b ? a : b;
}

/* JavaScript's Math.max: NaN wins, and +0 is above -0. */
static inline double js_max(double a, double b) {
    if (a != a || b != b) return NAN;
    if (a == 0 && b == 0) return signbit(a) ? b : a;
    return a > b ? a : b;
}

/* worldgen's clamp: value < min ? min : value > max ? max : value. */
static inline double clampd(double value, double min, double max) {
    return value < min ? min : value > max ? max : value;
}

static inline double square_f(double v) { return F(v * v); }
static inline double cube_f(double v) { return F(F(v * v) * v); }

/* worldgen's squeeze. */
static inline double squeeze_f(double v) {
    double c = clampd(v, -1, 1);
    return F(F(c / 2) - F(cube_f(c) / 24));
}

#endif
