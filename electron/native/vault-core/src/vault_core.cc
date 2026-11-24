#include <node_api.h>
#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>

#if defined(_WIN32)
  #ifndef WIN32_LEAN_AND_MEAN
    #define WIN32_LEAN_AND_MEAN
  #endif
  #include <windows.h>
#elif defined(__APPLE__)
  #include <sys/types.h>
  #include <sys/sysctl.h>
  #include <unistd.h>
#elif defined(__linux__)
  #include <stdio.h>
  #include <unistd.h>
#endif

#include "vault_key_gen.h"

namespace {

// Volatile zeroing that the compiler cannot optimize away
void secure_zero(void* ptr, size_t len) {
    volatile uint8_t* p = reinterpret_cast<volatile uint8_t*>(ptr);
    while (len--) {
        *p++ = 0;
    }
}

// Reassemble the 256-bit vault key exclusively on the C++ stack
void reconstruct_vault_key(uint8_t out[32]) {
    for (int i = 0; i < 32; ++i) {
        const uint8_t idx = VAULT_K_PERM[i];
        const uint8_t s = static_cast<uint8_t>((i * 73 + 0x5A) & 0xFF);
        const uint8_t a = static_cast<uint8_t>(VAULT_K_M0[idx] ^ VAULT_K_M1[idx]);
        const uint8_t b = static_cast<uint8_t>((a - VAULT_K_M2[idx]) & 0xFF);
        out[i] = static_cast<uint8_t>(b ^ VAULT_K_M3[idx] ^ s);
    }
}

// Native OS-level debugger detection
bool detect_debugger() {
#if defined(_WIN32)
    if (IsDebuggerPresent()) {
        return true;
    }
    BOOL remote = FALSE;
    if (CheckRemoteDebuggerPresent(GetCurrentProcess(), &remote) && remote) {
        return true;
    }
    return false;
#elif defined(__APPLE__)
    int mib[4] = { CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid() };
    struct kinfo_proc info;
    memset(&info, 0, sizeof(info));
    size_t size = sizeof(info);
    if (sysctl(mib, 4, &info, &size, NULL, 0) == 0) {
        return (info.kp_proc.p_flag & P_TRACED) != 0;
    }
    return false;
#elif defined(__linux__)
    FILE* f = fopen("/proc/self/status", "r");
    if (!f) return false;
    char line[256];
    bool traced = false;
    while (fgets(line, sizeof(line), f)) {
        if (strncmp(line, "TracerPid:", 10) == 0) {
            int pid = atoi(line + 10);
            if (pid != 0) traced = true;
            break;
        }
    }
    fclose(f);
    return traced;
#else
    return false;
#endif
}

bool detect_tampered_env() {
    const char* runAsNode = getenv("ELECTRON_RUN_AS_NODE");
    if (runAsNode && runAsNode[0] != '\0' && strcmp(runAsNode, "0") != 0) {
        return true;
    }
    const char* nodeOpts = getenv("NODE_OPTIONS");
    if (nodeOpts && (strstr(nodeOpts, "--inspect") != NULL || strstr(nodeOpts, "--require") != NULL || strstr(nodeOpts, "-r ") != NULL)) {
        return true;
    }
    return false;
}

// ==================== FIPS-197 AES-256 ====================

static const uint8_t AES_SBOX[256] = {
    0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
    0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
    0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
    0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
    0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
    0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
    0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
    0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
    0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
    0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
    0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
    0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
    0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
    0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
    0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
    0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
};

static const uint8_t AES_RCON[10] = {
    0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36
};

inline uint8_t xtime(uint8_t x) {
    return static_cast<uint8_t>((x << 1) ^ ((x & 0x80) ? 0x1b : 0x00));
}

void aes256_expand_key(const uint8_t key[32], uint8_t rk[240]) {
    memcpy(rk, key, 32);
    int bytesGenerated = 32;
    int rconIdx = 0;
    uint8_t temp[4];

    while (bytesGenerated < 240) {
        memcpy(temp, rk + bytesGenerated - 4, 4);
        if ((bytesGenerated % 32) == 0) {
            uint8_t t = temp[0];
            temp[0] = static_cast<uint8_t>(AES_SBOX[temp[1]] ^ AES_RCON[rconIdx++]);
            temp[1] = AES_SBOX[temp[2]];
            temp[2] = AES_SBOX[temp[3]];
            temp[3] = AES_SBOX[t];
        } else if ((bytesGenerated % 32) == 16) {
            temp[0] = AES_SBOX[temp[0]];
            temp[1] = AES_SBOX[temp[1]];
            temp[2] = AES_SBOX[temp[2]];
            temp[3] = AES_SBOX[temp[3]];
        }
        for (int i = 0; i < 4; ++i) {
            rk[bytesGenerated] = static_cast<uint8_t>(rk[bytesGenerated - 32] ^ temp[i]);
            ++bytesGenerated;
        }
    }
    secure_zero(temp, sizeof(temp));
}

void aes256_encrypt_block(const uint8_t rk[240], const uint8_t in[16], uint8_t out[16]) {
    uint8_t s[16];
    for (int i = 0; i < 16; ++i) s[i] = static_cast<uint8_t>(in[i] ^ rk[i]);

    for (int round = 1; round <= 14; ++round) {
        // SubBytes
        for (int i = 0; i < 16; ++i) s[i] = AES_SBOX[s[i]];

        // ShiftRows (column-major layout)
        uint8_t t;
        t = s[1];  s[1] = s[5];  s[5] = s[9];   s[9] = s[13];  s[13] = t;
        t = s[2];  s[2] = s[10]; s[10] = t;
        t = s[6];  s[6] = s[14]; s[14] = t;
        t = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = s[3];   s[3] = t;

        // MixColumns (skip on final round 14)
        if (round < 14) {
            for (int c = 0; c < 4; ++c) {
                int idx = c * 4;
                uint8_t a0 = s[idx], a1 = s[idx + 1], a2 = s[idx + 2], a3 = s[idx + 3];
                uint8_t xr = static_cast<uint8_t>(a0 ^ a1 ^ a2 ^ a3);
                s[idx]     = static_cast<uint8_t>(a0 ^ xr ^ xtime(static_cast<uint8_t>(a0 ^ a1)));
                s[idx + 1] = static_cast<uint8_t>(a1 ^ xr ^ xtime(static_cast<uint8_t>(a1 ^ a2)));
                s[idx + 2] = static_cast<uint8_t>(a2 ^ xr ^ xtime(static_cast<uint8_t>(a2 ^ a3)));
                s[idx + 3] = static_cast<uint8_t>(a3 ^ xr ^ xtime(static_cast<uint8_t>(a3 ^ a0)));
            }
        }

        // AddRoundKey
        const uint8_t* rkp = rk + (round * 16);
        for (int i = 0; i < 16; ++i) s[i] = static_cast<uint8_t>(s[i] ^ rkp[i]);
    }

    memcpy(out, s, 16);
    secure_zero(s, sizeof(s));
}

// ==================== NIST SP 800-38D AES-256-GCM ====================

// Constant-time multiplication in GF(2^128)
void gf128_mul(const uint8_t X[16], const uint8_t Y[16], uint8_t out[16]) {
    uint8_t Z[16];
    uint8_t V[16];
    memset(Z, 0, 16);
    memcpy(V, Y, 16);

    for (int i = 0; i < 128; ++i) {
        uint8_t bit = static_cast<uint8_t>((X[i >> 3] >> (7 - (i & 7))) & 1u);
        uint8_t mask = static_cast<uint8_t>(0u - bit);
        for (int j = 0; j < 16; ++j) {
            Z[j] = static_cast<uint8_t>(Z[j] ^ (V[j] & mask));
        }
        uint8_t lsb = static_cast<uint8_t>(V[15] & 1u);
        uint8_t rmask = static_cast<uint8_t>(0u - lsb);
        for (int j = 15; j > 0; --j) {
            V[j] = static_cast<uint8_t>((V[j] >> 1) | ((V[j - 1] & 1u) << 7));
        }
        V[0] = static_cast<uint8_t>((V[0] >> 1) ^ (0xE1u & rmask));
    }

    memcpy(out, Z, 16);
    secure_zero(Z, sizeof(Z));
    secure_zero(V, sizeof(V));
}

void inc32(uint8_t counter[16]) {
    uint32_t c = (static_cast<uint32_t>(counter[12]) << 24) |
                 (static_cast<uint32_t>(counter[13]) << 16) |
                 (static_cast<uint32_t>(counter[14]) << 8)  |
                 (static_cast<uint32_t>(counter[15]));
    c += 1u;
    counter[12] = static_cast<uint8_t>((c >> 24) & 0xFF);
    counter[13] = static_cast<uint8_t>((c >> 16) & 0xFF);
    counter[14] = static_cast<uint8_t>((c >> 8) & 0xFF);
    counter[15] = static_cast<uint8_t>(c & 0xFF);
}

bool aes256_gcm_decrypt(
    const uint8_t key[32],
    const uint8_t iv[12],
    const uint8_t* ciphertext,
    size_t ct_len,
    const uint8_t expected_tag[16],
    uint8_t* plaintext_out
) {
    uint8_t rk[240];
    uint8_t H[16];
    uint8_t zeros[16];
    uint8_t J0[16];
    uint8_t S[16];
    uint8_t Y[16];
    uint8_t block[16];
    uint8_t computed_tag[16];

    memset(zeros, 0, 16);
    memset(Y, 0, 16);

    aes256_expand_key(key, rk);
    aes256_encrypt_block(rk, zeros, H);

    memcpy(J0, iv, 12);
    J0[12] = 0; J0[13] = 0; J0[14] = 0; J0[15] = 1;
    aes256_encrypt_block(rk, J0, S);

    // 1. Compute GHASH over ciphertext (AAD is empty)
    size_t offset = 0;
    while (offset < ct_len) {
        size_t chunk = (ct_len - offset >= 16) ? 16 : (ct_len - offset);
        memset(block, 0, 16);
        memcpy(block, ciphertext + offset, chunk);
        for (int i = 0; i < 16; ++i) Y[i] = static_cast<uint8_t>(Y[i] ^ block[i]);
        gf128_mul(Y, H, Y);
        offset += chunk;
    }

    // Length block: 64-bit bitlen(AAD)=0 || 64-bit bitlen(C)
    memset(block, 0, 16);
    uint64_t bitlen = static_cast<uint64_t>(ct_len) * 8ULL;
    for (int i = 0; i < 8; ++i) {
        block[15 - i] = static_cast<uint8_t>((bitlen >> (i * 8)) & 0xFF);
    }
    for (int i = 0; i < 16; ++i) Y[i] = static_cast<uint8_t>(Y[i] ^ block[i]);
    gf128_mul(Y, H, Y);

    for (int i = 0; i < 16; ++i) computed_tag[i] = static_cast<uint8_t>(Y[i] ^ S[i]);

    // 2. Constant-time AuthTag verification BEFORE producing any plaintext
    volatile uint8_t diff = 0;
    for (int i = 0; i < 16; ++i) {
        diff = static_cast<uint8_t>(diff | (computed_tag[i] ^ expected_tag[i]));
    }
    if (diff != 0) {
        secure_zero(rk, sizeof(rk));
        secure_zero(H, sizeof(H));
        secure_zero(J0, sizeof(J0));
        secure_zero(S, sizeof(S));
        secure_zero(Y, sizeof(Y));
        secure_zero(block, sizeof(block));
        secure_zero(computed_tag, sizeof(computed_tag));
        return false;
    }

    // 3. GCTR decryption
    uint8_t ctr[16];
    uint8_t keystream[16];
    memcpy(ctr, J0, 16);
    offset = 0;
    while (offset < ct_len) {
        inc32(ctr);
        aes256_encrypt_block(rk, ctr, keystream);
        size_t chunk = (ct_len - offset >= 16) ? 16 : (ct_len - offset);
        for (size_t i = 0; i < chunk; ++i) {
            plaintext_out[offset + i] = static_cast<uint8_t>(ciphertext[offset + i] ^ keystream[i]);
        }
        offset += chunk;
    }

    secure_zero(rk, sizeof(rk));
    secure_zero(H, sizeof(H));
    secure_zero(J0, sizeof(J0));
    secure_zero(S, sizeof(S));
    secure_zero(Y, sizeof(Y));
    secure_zero(block, sizeof(block));
    secure_zero(computed_tag, sizeof(computed_tag));
    secure_zero(ctr, sizeof(ctr));
    secure_zero(keystream, sizeof(keystream));
    return true;
}

// ==================== N-API EXPORTS ====================

napi_value DecryptChunk(napi_env env, napi_callback_info info) {
    size_t argc = 4;
    napi_value args[4];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    if (argc < 3) {
        napi_throw_type_error(env, nullptr, "Expected (ciphertext, iv, tag[, enforceAntiDebug])");
        return nullptr;
    }

    bool enforceAntiDebug = false;
    if (argc >= 4) {
        napi_get_value_bool(env, args[3], &enforceAntiDebug);
    }

    if (enforceAntiDebug && (detect_debugger() || detect_tampered_env())) {
        napi_throw_error(env, "E_RUNTIME_GUARD", "Runtime integrity verification failed");
        return nullptr;
    }

    bool isCtBuf = false, isIvBuf = false, isTagBuf = false;
    napi_is_buffer(env, args[0], &isCtBuf);
    napi_is_buffer(env, args[1], &isIvBuf);
    napi_is_buffer(env, args[2], &isTagBuf);
    if (!isCtBuf || !isIvBuf || !isTagBuf) {
        napi_throw_type_error(env, nullptr, "ciphertext, iv and tag must be Buffers");
        return nullptr;
    }

    void* ctPtr = nullptr; size_t ctLen = 0;
    void* ivPtr = nullptr; size_t ivLen = 0;
    void* tagPtr = nullptr; size_t tagLen = 0;
    napi_get_buffer_info(env, args[0], &ctPtr, &ctLen);
    napi_get_buffer_info(env, args[1], &ivPtr, &ivLen);
    napi_get_buffer_info(env, args[2], &tagPtr, &tagLen);

    if (ivLen != 12 || tagLen != 16) {
        napi_throw_range_error(env, nullptr, "Invalid AES-256-GCM IV or AuthTag length");
        return nullptr;
    }

    void* outPtr = nullptr;
    napi_value outBuf = nullptr;
    napi_status st = napi_create_buffer(env, ctLen, &outPtr, &outBuf);
    if (st != napi_ok) {
        napi_throw_error(env, nullptr, "Failed to allocate output buffer");
        return nullptr;
    }

    uint8_t key[32];
    reconstruct_vault_key(key);

    bool ok = aes256_gcm_decrypt(
        key,
        reinterpret_cast<const uint8_t*>(ivPtr),
        reinterpret_cast<const uint8_t*>(ctPtr),
        ctLen,
        reinterpret_cast<const uint8_t*>(tagPtr),
        reinterpret_cast<uint8_t*>(outPtr)
    );
    secure_zero(key, sizeof(key));

    if (!ok) {
        if (outPtr && ctLen > 0) secure_zero(outPtr, ctLen);
        napi_throw_error(env, "E_AUTH_TAG", "Vault authentication tag mismatch");
        return nullptr;
    }

    return outBuf;
}

napi_value IsDebuggerAttached(napi_env env, napi_callback_info /*info*/) {
    napi_value result;
    napi_get_boolean(env, detect_debugger() || detect_tampered_env(), &result);
    return result;
}

napi_value GetCoreInfo(napi_env env, napi_callback_info /*info*/) {
    napi_value obj;
    napi_create_object(env, &obj);

    napi_value vTrue, vAbi, vPlat;
    napi_get_boolean(env, true, &vTrue);
    napi_create_int32(env, 8, &vAbi);
#if defined(_WIN32)
    napi_create_string_utf8(env, "win32", NAPI_AUTO_LENGTH, &vPlat);
#elif defined(__APPLE__)
    napi_create_string_utf8(env, "darwin", NAPI_AUTO_LENGTH, &vPlat);
#elif defined(__linux__)
    napi_create_string_utf8(env, "linux", NAPI_AUTO_LENGTH, &vPlat);
#else
    napi_create_string_utf8(env, "unknown", NAPI_AUTO_LENGTH, &vPlat);
#endif

    napi_set_named_property(env, obj, "native", vTrue);
    napi_set_named_property(env, obj, "hardened", vTrue);
    napi_set_named_property(env, obj, "abi", vAbi);
    napi_set_named_property(env, obj, "platform", vPlat);
    return obj;
}

napi_value Init(napi_env env, napi_value exports) {
    napi_property_descriptor props[] = {
        { "decryptChunk", nullptr, DecryptChunk, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "isDebuggerAttached", nullptr, IsDebuggerAttached, nullptr, nullptr, nullptr, napi_default, nullptr },
        { "getCoreInfo", nullptr, GetCoreInfo, nullptr, nullptr, nullptr, napi_default, nullptr },
    };
    napi_define_properties(env, exports, sizeof(props) / sizeof(props[0]), props);
    return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
