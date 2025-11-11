# Error Handling Architecture

DocImp uses a three-layer error handling pattern for CLI commands that separates business logic from process lifecycle management.

## Layer 1: Core Functions (Business Logic)

Core functions (`analyzeCore`, `auditCore`, `planCore`, `improveCore`) throw errors for exceptional conditions:
- File not found
- Invalid configuration
- Python subprocess failures
- Missing required environment variables

Core functions don't know about exit codes or process lifecycle - they're pure business logic that can be tested in isolation.

**Testing**: Core functions are tested by expecting thrown errors.

## Layer 2: Command Wrappers (CLI Interface)

Command functions (`analyzeCommand`, `auditCommand`, etc.) wrap Core functions and convert errors to exit codes:
- Return `EXIT_CODE.SUCCESS` (0) for successful completion
- Return `EXIT_CODE.ERROR` (1) for errors
- Display errors using `display.showError()` before returning

Command wrappers bridge business logic and CLI concerns, making commands usable as library functions.

**Testing**: Command wrappers are tested by checking returned exit codes (no process.exit mocking needed).

## Layer 3: Entry Point (Process Lifecycle)

The CLI entry point (`index.ts`) checks exit codes from Command wrappers:
- Calls `process.exit(exitCode)` only when `exitCode !== EXIT_CODE.SUCCESS`
- Catches unexpected errors defensively (commands should not throw)
- Manages process lifecycle

This is the only place in the codebase where `process.exit()` is called.

## Special Case: UserCancellationError

The `improve` command has interactive prompts where users can cancel (ESC, Ctrl+C). User cancellations are not errors, so they exit with code 0:

1. `improveCore()` throws `UserCancellationError` when user cancels a prompt
2. `improveCommand()` catches it and returns `EXIT_CODE.USER_CANCELLED` (0)
3. `index.ts` sees exit code 0 and doesn't call `process.exit()`

This follows Unix conventions where user-initiated cancellations are not failures.

## Exit Code Constants

Exit codes are defined in `cli/src/constants/exitCodes.ts`:

```typescript
export const EXIT_CODE = {
  SUCCESS: 0,          // Command completed successfully
  ERROR: 1,            // Command encountered an error
  USER_CANCELLED: 0,   // User cancelled (not an error)
} as const;

export type ExitCode = typeof EXIT_CODE[keyof typeof EXIT_CODE];
```

All command functions return `Promise<ExitCode>` for type safety.

## Testing Benefits

This architecture eliminates the need to mock `process.exit()` in tests:
- Unit tests call Core functions and expect thrown errors
- Integration tests call Command wrappers and check exit codes
- No brittle process.exit mocking required
- Tests are more maintainable and easier to understand
