{
  "targets": [
    {
      "target_name": "vault_core",
      "sources": [
        "src/vault_core.cc"
      ],
      "defines": [
        "NAPI_VERSION=8",
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "conditions": [
        ["OS=='linux'", {
          "cflags_cc": [
            "-O3",
            "-std=c++17",
            "-fvisibility=hidden",
            "-fno-rtti",
            "-fno-exceptions",
            "-fPIC"
          ],
          "ldflags": [
            "-Wl,-s"
          ]
        }],
        ["OS=='mac'", {
          "xcode_settings": {
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "GCC_OPTIMIZATION_LEVEL": "3",
            "GCC_ENABLE_CPP_EXCEPTIONS": "NO",
            "GCC_ENABLE_CPP_RTTI": "NO",
            "GCC_SYMBOLS_PRIVATE_EXTERN": "YES",
            "DEPLOYMENT_POSTPROCESSING": "YES",
            "STRIP_INSTALLED_PRODUCT": "YES",
            "OTHER_LDFLAGS": [ "-Wl,-x" ]
          }
        }],
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "Optimization": 2,
              "RuntimeTypeInfo": "false",
              "ExceptionHandling": 0,
              "AdditionalOptions": [ "/std:c++17" ]
            },
            "VCLinkerTool": {
              "GenerateDebugInformation": "false"
            }
          }
        }]
      ]
    }
  ]
}
