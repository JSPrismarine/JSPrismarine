/*
 * Mbed TLS settings beyond its defaults. libdatachannel's DTLS transport registers SRTP
 * protection profiles whether or not media is built in, so the DTLS-SRTP extension must exist.
 */
#define MBEDTLS_SSL_DTLS_SRTP
