# @doclo/core

Core types, utilities, and runtime features for the Doclo SDK.

## Installation

```bash
pnpm add @doclo/core
```

## Features

- Core type definitions (DocumentIR, FlowInput, providers)
- Validation utilities (JSON schema validation, node compatibility)
- Security utilities (SSRF protection, safe JSON parsing)
- Runtime utilities (crypto, base64, environment detection)
- PDF utilities (page counting, splitting)
- Observability helpers (tracing, metrics)

## Exports

| Export Path | Description |
|-------------|-------------|
| `.` | Core types, validation, file utilities |
| `./validation` | Input validation utilities |
| `./security` | SSRF protection, fetchWithTimeout, safeJsonParse |
| `./observability` | Tracing and metrics hooks |
| `./runtime/crypto` | Cryptographic utilities |
| `./runtime/base64` | Base64 encoding/decoding |
| `./runtime/env` | Environment detection |
| `./pdf-utils` | PDF manipulation utilities |

## License

MIT
