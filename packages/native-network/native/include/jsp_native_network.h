/*
 * The flat C interface of @jsprismarine/native-network.
 *
 * Every function takes and returns fixed-width scalars, pointers and NUL-terminated strings, so
 * node:ffi, bun:ffi and scriptc's FFI can all bind it. Nothing here calls back into the runtime:
 * libdatachannel's events and RakNet's datagrams queue in native memory, and the runtime is woken
 * by a one-byte UDP datagram on the loopback interface, once per batch (see README.md).
 *
 * Functions that return int32_t return 0 or a positive value on success and a negative JSP_ERR_*
 * code on failure, unless their comment says otherwise.
 */
#ifndef JSP_NATIVE_NETWORK_H
#define JSP_NATIVE_NETWORK_H

#include <stdint.h>

#ifdef _WIN32
#define JSP_EXPORT __declspec(dllexport)
#else
#define JSP_EXPORT __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* The interface's version. The TypeScript side refuses a library whose version differs. */
#define JSP_ABI_VERSION 1

#define JSP_ERR_INVALID -1   /* an argument is invalid */
#define JSP_ERR_FAILURE -2   /* the operation failed */
#define JSP_ERR_NOT_AVAIL -3 /* the value is not available yet */
#define JSP_ERR_TOO_SMALL -4 /* the buffer is too small */
#define JSP_ERR_BIND -5      /* the port could not be bound */

/* The classes of a datagram on a port RakNet shares with NetherNet, in ADR 0008's order. */
#define JSP_CLASS_RAKNET 1         /* first byte 0x80 or above: connected RakNet, or query */
#define JSP_CLASS_RAKNET_OFFLINE 2 /* an unconnected ping or open connection request */
#define JSP_CLASS_STUN 3
#define JSP_CLASS_DTLS 4
#define JSP_CLASS_UNSURE 5 /* libjuice looks it up; what it claims for no peer goes to RakNet */

/* Event kinds, the first byte of each event jsp_events_read writes. */
#define JSP_EVENT_DESCRIPTION 1   /* pc; value 0 offer, 1 answer; payload the SDP */
#define JSP_EVENT_CANDIDATE 2     /* pc; payload "mid\ncandidate" */
#define JSP_EVENT_STATE 3         /* pc; value an rtcState */
#define JSP_EVENT_GATHERING 4     /* pc; value an rtcGatheringState */
#define JSP_EVENT_DATA_CHANNEL 5  /* pc; value the channel; payload: one byte open, the label */
#define JSP_EVENT_OPEN 6          /* channel */
#define JSP_EVENT_CLOSED 7        /* channel */
#define JSP_EVENT_ERROR 8         /* channel or pc; payload the message */
#define JSP_EVENT_MESSAGE 9       /* channel; value 1 binary, 0 text; payload the message */
#define JSP_EVENT_BUFFERED_LOW 10 /* channel */
#define JSP_EVENT_ICE_STATE 11    /* pc; value an rtcIceState */
#define JSP_EVENT_LOG 12          /* value an rtcLogLevel; payload the line */

/* The bytes before each event's payload: u32 length, u8 kind, three reserved, i32 id, i32 value. */
#define JSP_EVENT_HEADER_BYTES 16

/* Library */

/* Returns JSP_ABI_VERSION. */
JSP_EXPORT int32_t jsp_abi_version(void);

/*
 * Opens an event queue for one runtime thread and returns its handle. The peer connections
 * created on it send their events there, and the queue wakes 127.0.0.1:wake_port with a datagram
 * when it goes from empty to not empty. log_level is an rtcLogLevel; 0 logs nothing. The first
 * call sets the level for the process, and the last queue to ask for logs receives them.
 */
JSP_EXPORT int32_t jsp_events_open(int32_t wake_port, int32_t log_level);

/*
 * Moves as many whole events as fit into buffer and returns the bytes written. Returns 0 once the
 * queue is empty, which also rearms the wake. Returns -n when the oldest event needs n bytes.
 */
JSP_EXPORT int32_t jsp_events_read(int32_t queue, uint8_t *buffer, int32_t size);

/* Closes and deletes a queue's peer connections, then the queue. */
JSP_EXPORT void jsp_events_close(int32_t queue);

/* Closes every peer connection, shared port and queue, and cleans libdatachannel up, at exit. */
JSP_EXPORT void jsp_cleanup(void);

/* Classifies one datagram as JSP_CLASS_*. */
JSP_EXPORT int32_t jsp_classify(const uint8_t *data, int32_t size);

/* Peer connections and data channels */

/*
 * Creates a peer connection whose events go to queue, and returns its id. bind_address is empty for every interface.
 * ice_servers is newline-separated, or empty. port_begin and port_end of 0 let the system choose.
 */
JSP_EXPORT int32_t jsp_pc_create(int32_t queue, const char *bind_address, const char *ice_servers,
                                 int32_t port_begin, int32_t port_end, int32_t enable_ice_udp_mux,
                                 int32_t max_message_size);
JSP_EXPORT int32_t jsp_pc_set_remote_description(int32_t pc, const char *sdp, const char *type);
JSP_EXPORT int32_t jsp_pc_set_local_description(int32_t pc, const char *type);
JSP_EXPORT int32_t jsp_pc_add_remote_candidate(int32_t pc, const char *candidate, const char *mid);
JSP_EXPORT int32_t jsp_pc_local_description(int32_t pc, uint8_t *buffer, int32_t size);
/* Writes "local\0remote\0" and returns the bytes written, or JSP_ERR_NOT_AVAIL. */
JSP_EXPORT int32_t jsp_pc_selected_pair(int32_t pc, uint8_t *buffer, int32_t size);
JSP_EXPORT int32_t jsp_pc_close(int32_t pc);
JSP_EXPORT int32_t jsp_pc_delete(int32_t pc);

/* Creates a data channel on pc. max_retransmits below 0 makes it reliable. */
JSP_EXPORT int32_t jsp_dc_create(int32_t pc, const char *label, int32_t unordered,
                                 int32_t max_retransmits);
JSP_EXPORT int32_t jsp_dc_send(int32_t dc, const uint8_t *data, int32_t size);
JSP_EXPORT int32_t jsp_dc_buffered_amount(int32_t dc);
JSP_EXPORT int32_t jsp_dc_set_buffered_amount_low_threshold(int32_t dc, int32_t amount);
JSP_EXPORT int32_t jsp_dc_close(int32_t dc);
JSP_EXPORT int32_t jsp_dc_delete(int32_t dc);

/* A UDP port RakNet shares with NetherNet (ADR 0008) */

/*
 * Binds libjuice's mux socket on port and keeps it open with no peer on it, classifying each
 * datagram before libjuice's lookup. bind_address is empty for every interface, which binds one
 * dual-stack socket. Returns a handle, or JSP_ERR_BIND.
 */
JSP_EXPORT int32_t jsp_mux_open(const char *bind_address, int32_t port);

/*
 * Hands RakNet's datagrams of one address family (4 or 6) to a pair of rings in the layout of
 * SharedByteRing in @jsprismarine/raknet: inbound, which this library writes and wakes
 * 127.0.0.1:wake_port for, and outbound, which the consumer writes and wakes the returned port
 * for. The memory must stay valid until jsp_mux_detach or jsp_mux_close. Returns the port of the
 * outbound wake socket.
 */
JSP_EXPORT int32_t jsp_mux_attach(int32_t handle, int32_t family, uint8_t *inbound,
                                  int32_t inbound_size, uint8_t *outbound, int32_t outbound_size,
                                  int32_t wake_port);
JSP_EXPORT int32_t jsp_mux_detach(int32_t handle, int32_t family);
JSP_EXPORT int32_t jsp_mux_close(int32_t handle);

/* The counters of a shared port, in this order, written as int32 values. */
#define JSP_MUX_STAT_RAKNET 0           /* datagrams the classifier gave RakNet */
#define JSP_MUX_STAT_PASSED 1           /* datagrams it let through to libjuice's lookup */
#define JSP_MUX_STAT_UNHANDLED_RAKNET 2 /* unsure datagrams no peer claimed, given RakNet */
#define JSP_MUX_STAT_UNHANDLED_DROPPED 3
#define JSP_MUX_STAT_RING_FULL 4  /* datagrams dropped because the inbound ring was full */
#define JSP_MUX_STAT_NO_RING 5    /* RakNet datagrams of a family with no ring attached */
#define JSP_MUX_STAT_WAKES 6      /* inbound wakes sent */
#define JSP_MUX_STAT_SENT 7       /* outbound datagrams sent from the mux socket */
#define JSP_MUX_STAT_SEND_FAILED 8
#define JSP_MUX_STAT_COUNT 9
JSP_EXPORT int32_t jsp_mux_stats(int32_t handle, int32_t *out, int32_t count);

#ifdef __cplusplus
}
#endif

#endif
