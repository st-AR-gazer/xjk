# Shared tool backend runtime

This package contains small infrastructure primitives shared by the standalone tool backends:

- `filesystem.js` handles path discovery and best-effort cleanup.
- `capacity.js` rejects excess native jobs without queueing them and applies both service-wide and per-client caps.
- `http.js` configures the common frontend shell, API limiter, upload errors, and listener.
- `lifecycle.js` creates idempotent request cleanup functions for temporary files and directories.
- `native-runtime.js` composes the shared HTTP shell, runtime config, admission policy, upload budget, and process runner.
- `process.js` runs native tools with consistent output capture, timeouts, and exit handling.
- `responses.js` owns JSON tool execution responses and sends files or archives with consistent download headers.
- `runtime.js` resolves the common environment, bundled executable, and data-directory defaults.
- `uploads.js` owns Multer disk-storage wiring while each tool supplies its fields and validators.
- `values.js` contains request-value and download-name normalization with matching contracts.
- `zip.js` builds the uncompressed ZIP responses used by tools that return multiple files.

HTTP routes, upload fields, output schemas, and format-specific behavior remain in each tool backend. Add a helper here only when at least two tools share the same contract.

## Public resource budgets

Every route that can invoke a native tool acquires capacity before parsing its upload. Capacity exhaustion returns `503`,
`Retry-After`, and the stable `TOOL_CAPACITY_EXHAUSTED` code; requests are never placed in an unbounded queue. The
shared defaults are four active jobs per backend and two per client. Underwater conversion is intentionally lower at
two per backend and one per client because a batch can generate multiple maps.

The common environment overrides are:

- `TOOL_MAX_ACTIVE_JOBS` and `TOOL_MAX_ACTIVE_JOBS_PER_CLIENT`
- `TOOL_BUSY_RETRY_AFTER_SECONDS`
- `MAX_FILE_MB` for each file and `MAX_UPLOAD_MB` for all files in one request
- `TOOL_TIMEOUT_MS` and `TOOL_MAX_OUTPUT_MB` for native-process time, captured stdout/stderr, and generated JSON

Defaults are 64 MB per file, 96 MB combined per request, an eight MB process-output budget, and a three-minute
process timeout. Invalid or excessive multipart requests are cleaned before a route handler can invoke its tool.
Overrides remain bounded by hard ceilings: 256 MB per file, 512 MB combined, 16 active jobs, 15 minutes of process
time, and 64 MB of captured process output.
