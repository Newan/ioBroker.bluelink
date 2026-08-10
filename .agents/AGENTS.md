# ioBroker Development Rules for ioBroker.bluelink

This file defines style guidelines, constraints, and general instructions for AI agents working on the `iobroker.bluelink` codebase to ensure 100% ioBroker conformity, safety, and stability.

## 1. Asynchronous Error Handling & Logging Rules (Crash Prevention & Compliance)
- **Constraint:** All asynchronous API calls, network requests (e.g., Axios, Bluelinky), and database operations must be wrapped in `try/catch` blocks or have `.catch()` handlers. Unhandled promise rejections must be avoided at all costs to prevent crash loops.
- **Event Handlers:** Ensure main entry points like `onReady`, `onStateChange`, and `onUnload` capture all internal errors and log them cleanly instead of crashing the process.
- **Sensitive Data Logging:** Sensitive information MUST NOT be written to log files under any circumstances (including `info`, `warn`, or `debug`). Sensitive data includes any values configured in `io-package.json` under `protectedNative` or `encryptedNative` (e.g., passwords, API tokens, secret keys, PINs).
- **Log Message Language:** All log messages must be written strictly in pure English text and MUST NOT use any translation mechanism (e.g. `this.t()`).

## 2. Object & State Management
- **Rule:** Never call `this.setState()` or `this.setStateAsync()` on states that do not exist in the ioBroker object database.
- **Static States:** If a state is static, it must be defined in `io-package.json` under `instanceObjects` first.
- **Dynamic States:** If states are created dynamically (e.g., during polling or vehicle discovery), you MUST call `this.setObjectNotExistsAsync()` before calling `this.setStateAsync()`.
- **Strict Metadata:** Every new object configuration must contain a valid `common` section specifying:
  - `type` (e.g., `'string'`, `'number'`, `'boolean'`)
  - `role` (must be a standard ioBroker role like `'value.temperature'`, `'switch.power'`, `'value.gps.latitude'`, etc.)
  - `read` and `write` flags
  - `def` (default value corresponding to the data type)
  - `name` / `desc`: `common.name` and `common.desc` must use either English wording or an i18n multilanguage setup.
- **Object ID Validation & Character Filtering:** Object IDs must not contain special characters, spaces, or non-ASCII characters. At minimum, characters defined by the ioBroker constant `FORBIDDEN_CHARS` must be removed or sanitized. Spaces should be converted to underscores (`_`) or removed. Strictly allow only `A-Za-z0-9-_` (and `.` as separator).
- **State ID Naming:** All `stateId`s must be named using English wording unless the raw data key is directly received from an external API/source.
- **Explicit Hierarchy:** When creating an object tree dynamically (e.g., `vehicle.channel.state`), you must explicitly create every parent object in the hierarchy (i.e., first the `device` object, then the `channel` object, and finally the `state` object).

## 3. The `ack` Flag Protocol
- **Sensor/Cloud Updates (`ack: true`):** When updating states with values received from Hyundai/Kia API status, always set `ack: true` to indicate that the state represents the confirmed current value.
- **User Commands (`ack: false`):** When reacting to state changes triggered by the user (where `state.ack === false` in `onStateChange`), perform the required API action. Upon success, update the state with `ack: true` to confirm the command execution.

## 4. Resource Lifecycle Management (Memory Cleanups)
- **Constraint:** All active intervals, timeouts, and event listeners must be properly cleaned up in the `onUnload` method of the adapter.
- **Timers:** **NEVER** use Node.js global functions `setTimeout` or `setInterval`. You must always use the adapter-safe methods `this.setTimeout()` or `this.setInterval()`, or store references and clear them explicitly during unload.

## 5. Process Lifecycle Constraints
- **Constraint:** **NEVER** call `process.exit()` within the adapter code. If the adapter needs to be terminated or stopped due to a fatal error, you must call `this.terminate()` (or `this.terminate(reason, exitCode)`) instead.

## 6. Config UI & Internationalization (i18n)
- **Constraint:** Do not create manual HTML panels (`admin/index_m.html`). Always use **JSONConfig** (`admin/jsonConfig.json` or `admin/jsonConfig.json5`).
- **Translation:** Never write direct/hardcoded translations in `jsonConfig`. Always configure `"i18n": true` and use standard language translation keys corresponding to files in the `admin/i18n` directory.
- **User Text Output:** All text output displayed to users must either use pure English text or support at least English and German text (via i18n).
- **News & Metadata Translations (`io-package.json`):** Every entry under `common.news` in `io-package.json` MUST be fully translated into all supported languages (`en`, `de`, `ru`, `pt`, `nl`, `fr`, `it`, `es`, `pl`, `uk`, `zh-cn`). Never leave non-English keys identical to English text, as ioBroker repochecker flags untranslated `common.news` entries as error `[E1144]`.

## 7. Local Code Verification
- **Workflow:** Before finishing any code modification or pushing, run:
  ```bash
  npm run test:package
  ```
  And verify that package and lint checks pass cleanly.

## 8. Node.js Built-in Module Imports
- **Constraint:** When requiring or importing Node.js built-in modules (e.g., `fs`, `path`, `os`, `crypto`), prefer using the `node:` protocol prefix (`require('node:path')`).

## 9. Documentation & Changelog Guidelines (README & WIP Check)
- **Strict README Language Separation:** `README.md` MUST be written using pure English text and must not mix languages. German text is strictly confined to `README_de.md` (or `README.de.md`).
- **WIP Changelog Constraint:** Whenever changes are made to source code, documentation, or scripts, add a descriptive bullet point under the `### **WORK IN PROGRESS**` section in both `README.md` and `README_de.md`.

## 10. Git Commit & Push Authorization
- **Constraint:** AI agents MUST NEVER perform `git commit` or `git push` operations automatically without explicit, prior user approval in the chat.
- **Workflow:** Always prepare code modifications locally and ask the user for explicit confirmation before staging, committing, or pushing changes to remote repositories.
