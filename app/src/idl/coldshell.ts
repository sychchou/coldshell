/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/coldshell.json`.
 */
export type Coldshell = {
  "address": "GLt8XkwvvViMEy5x9xXRMXMdi6Lq96bT2xknRbqottud",
  "metadata": {
    "name": "coldshell",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "docs": [
    "coldshell — stake on a run of weeks, record a minute a day, get each finished week back whole.",
    "",
    "The program never judges a recording. It holds the money, timestamps what the participant",
    "says they did, and refunds week by week; the day's hash travels in the instruction data, so",
    "the ledger carries a commitment nobody can backdate."
  ],
  "instructions": [
    {
      "name": "claim",
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true,
          "relations": [
            "run"
          ]
        },
        {
          "name": "run",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  117,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "mint",
          "address": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "run"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "shell",
          "type": "u8"
        }
      ]
    },
    {
      "name": "close",
      "discriminator": [
        98,
        165,
        201,
        177,
        108,
        65,
        206,
        96
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "rentDestination",
          "writable": true,
          "address": "Gda3akHfzA74Dyz7qJhrj2EsFYX8AqH8s2Za41XpQMNf"
        },
        {
          "name": "run",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  117,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "run.user",
                "account": "run"
              }
            ]
          }
        },
        {
          "name": "mint",
          "address": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  232,
                  61,
                  147,
                  154,
                  82,
                  40,
                  30,
                  131,
                  58,
                  243,
                  106,
                  74,
                  61,
                  130,
                  165,
                  105,
                  39,
                  105,
                  53,
                  30,
                  226,
                  213,
                  76,
                  104,
                  253,
                  175,
                  80,
                  110,
                  57,
                  231,
                  248,
                  128
                ]
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "run"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "enter",
      "discriminator": [
        139,
        49,
        209,
        114,
        88,
        91,
        77,
        134
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "run",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  117,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "mint",
          "address": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "run"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "shells",
          "type": "u8"
        },
        {
          "name": "stake",
          "type": "u64"
        }
      ]
    },
    {
      "name": "recordDay",
      "discriminator": [
        21,
        69,
        138,
        56,
        95,
        139,
        121,
        204
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true,
          "relations": [
            "run"
          ]
        },
        {
          "name": "run",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  117,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "day",
          "type": "u16"
        },
        {
          "name": "hash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "sweep",
      "discriminator": [
        40,
        23,
        234,
        175,
        14,
        61,
        154,
        177
      ],
      "accounts": [
        {
          "name": "run",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  117,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "run.user",
                "account": "run"
              }
            ]
          }
        },
        {
          "name": "mint",
          "address": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  232,
                  61,
                  147,
                  154,
                  82,
                  40,
                  30,
                  131,
                  58,
                  243,
                  106,
                  74,
                  61,
                  130,
                  165,
                  105,
                  39,
                  105,
                  53,
                  30,
                  226,
                  213,
                  76,
                  104,
                  253,
                  175,
                  80,
                  110,
                  57,
                  231,
                  248,
                  128
                ]
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "run"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "shell",
          "type": "u8"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "run",
      "discriminator": [
        199,
        54,
        155,
        86,
        235,
        115,
        246,
        189
      ]
    }
  ],
  "events": [
    {
      "name": "dayRecorded",
      "discriminator": [
        65,
        62,
        166,
        104,
        108,
        221,
        163,
        182
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidShells",
      "msg": "A run is between 1 and 10 shells."
    },
    {
      "code": 6001,
      "name": "invalidStake",
      "msg": "A stake is between 10 and 200 USDC."
    },
    {
      "code": 6002,
      "name": "invalidDay",
      "msg": "That day is not part of this run."
    },
    {
      "code": 6003,
      "name": "dayNotStarted",
      "msg": "That day has not started yet."
    },
    {
      "code": 6004,
      "name": "recordingClosed",
      "msg": "That day can no longer be recorded."
    },
    {
      "code": 6005,
      "name": "invalidShell",
      "msg": "That shell is not part of this run."
    },
    {
      "code": 6006,
      "name": "shellNotOver",
      "msg": "That shell is still running."
    },
    {
      "code": 6007,
      "name": "weekIncomplete",
      "msg": "A day of that shell is missing."
    },
    {
      "code": 6008,
      "name": "alreadyClaimed",
      "msg": "That shell has already been claimed."
    },
    {
      "code": 6009,
      "name": "alreadySwept",
      "msg": "That shell has already been swept."
    },
    {
      "code": 6010,
      "name": "claimWindowClosed",
      "msg": "The four weeks to claim that shell have passed."
    },
    {
      "code": 6011,
      "name": "claimsPending",
      "msg": "That shell was finished and can still be claimed."
    },
    {
      "code": 6012,
      "name": "shellsPending",
      "msg": "Every shell has to be settled before the run can be closed."
    },
    {
      "code": 6013,
      "name": "unauthorized",
      "msg": "Only the participant or the treasury can do that."
    },
    {
      "code": 6014,
      "name": "mathOverflow",
      "msg": "Arithmetic overflowed."
    }
  ],
  "types": [
    {
      "name": "dayRecorded",
      "docs": [
        "A day of a run, marked by the participant themselves.",
        "",
        "Nothing here judges the recording — the program cannot see it and does not want to. What it",
        "does is put the moment and the clip's hash in the ledger, where neither the participant nor",
        "the platform can move them afterwards. A day may be recorded more than once; the bit is the",
        "promise kept, and each hash is a minute of it."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "day",
            "type": "u16"
          },
          {
            "name": "hash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "run",
      "docs": [
        "One commitment: a stake, the weeks it covers, and which of their days have been recorded.",
        "",
        "A wallet has one of these at a time. Closing it frees the seed, so finishing a run and",
        "starting another is the same thing as starting the first."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "firstShell",
            "docs": [
              "The shell this run began in. Shell 1 starts at `SHELL_EPOCH_TS`."
            ],
            "type": "u32"
          },
          {
            "name": "shells",
            "docs": [
              "How many consecutive shells were committed to, 1 to `MAX_SHELLS`."
            ],
            "type": "u8"
          },
          {
            "name": "stake",
            "docs": [
              "Everything staked, in mint base units."
            ],
            "type": "u64"
          },
          {
            "name": "days",
            "docs": [
              "One bit per day of the run; ten shells of seven days needs seventy."
            ],
            "type": "u128"
          },
          {
            "name": "claimed",
            "docs": [
              "One bit per shell, set when its share went back to the participant."
            ],
            "type": "u16"
          },
          {
            "name": "swept",
            "docs": [
              "One bit per shell, set when its share went to the treasury instead. Kept apart from",
              "`claimed` because two bytes is a cheap price for being able to answer, forever, whether",
              "a week came back or was forfeited."
            ],
            "type": "u16"
          },
          {
            "name": "startedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "claimWindowSeconds",
      "type": "i64",
      "value": "2419200"
    },
    {
      "name": "daysPerShell",
      "type": "u16",
      "value": "7"
    },
    {
      "name": "daySeconds",
      "type": "i64",
      "value": "86400"
    },
    {
      "name": "maxShells",
      "docs": [
        "Shells are 1 to 10 weeks, so ten bits of `claimed` and `swept` and seventy of `days`."
      ],
      "type": "u8",
      "value": "10"
    },
    {
      "name": "maxStake",
      "docs": [
        "$200. The ceiling protects people from themselves, not the platform from them."
      ],
      "type": "u64",
      "value": "200000000"
    },
    {
      "name": "minStake",
      "docs": [
        "$10, in USDC base units. Below this nothing is really at stake."
      ],
      "type": "u64",
      "value": "10000000"
    },
    {
      "name": "recordEarlySeconds",
      "type": "i64",
      "value": "50400"
    },
    {
      "name": "recordLateSeconds",
      "type": "i64",
      "value": "172800"
    },
    {
      "name": "runSeed",
      "docs": [
        "One run per wallet at a time; closing it frees the seed for the next one."
      ],
      "type": "bytes",
      "value": "[114, 117, 110]"
    },
    {
      "name": "shellEpochTs",
      "type": "i64",
      "value": "1789344000"
    },
    {
      "name": "treasury",
      "docs": [
        "Receives forfeited stakes, and the rent back when a run is closed."
      ],
      "type": "pubkey",
      "value": "Gda3akHfzA74Dyz7qJhrj2EsFYX8AqH8s2Za41XpQMNf"
    },
    {
      "name": "usdcMint",
      "docs": [
        "Circle devnet USDC."
      ],
      "type": "pubkey",
      "value": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
    },
    {
      "name": "weekSeconds",
      "type": "i64",
      "value": "604800"
    }
  ]
};
