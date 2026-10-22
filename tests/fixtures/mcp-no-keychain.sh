#!/bin/sh
# Never read or change the user's macOS Keychain in disposable CLI tests.
# 44 is errSecItemNotFound. Claude then uses its scratch plaintext fallback.
exit 44
