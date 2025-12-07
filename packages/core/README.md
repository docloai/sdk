# @doclo/core

Core types, utilities, and security features for the Doclo SDK.

## Installation

```bash
npm install @doclo/core
# or
pnpm add @doclo/core
```

## Features

- Core type definitions for document processing
- Security utilities (SSRF protection, input validation)
- Runtime utilities (crypto, base64, environment detection)
- Observability helpers for tracing and metrics
- PDF utilities for document manipulation

## Exports

- `.` - Main entry point with core types and utilities
- `./validation` - Input validation utilities
- `./security` - Security helpers (fetchWithTimeout, validateUrl, safeJsonParse)
- `./observability` - Tracing and metrics helpers
- `./runtime/crypto` - Cryptographic utilities
- `./runtime/base64` - Base64 encoding/decoding
- `./runtime/env` - Environment detection
- `./pdf-utils` - PDF manipulation utilities

## License

MIT
