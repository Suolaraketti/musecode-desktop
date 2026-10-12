# Alpha validation — October 12, 2026

Validated on Windows x64 with Node.js 24.14.1, Electron 44.7.0 and the pinned Meta Muse Code SDK 1.4.6.

| Check | Result |
| --- | --- |
| TypeScript renderer (`npm run check`) | Passed |
| Production frontend build (`npm run build`) | Passed |
| MSP initialization, streaming and final-revision authority | Passed against deterministic fixture host |
| Explicit native approval choice/stage round trip | Passed against deterministic fixture host |
| Session resume and history restoration | Passed against deterministic fixture host |
| Missing agent binary and unsupported commands | Passed |
| Path traversal, symlink escape, binary/size preview limits | Passed |
| Git status with spaces/renames; staged, unstaged, untracked diffs | Passed |
| Source Electron desktop acceptance suite | Passed |
| Packaged Windows executable desktop acceptance suite | Passed |
| Unsigned Windows NSIS installer build | Passed |
| Full dependency audit (`npm audit`) | Zero reported vulnerabilities |

The five Node tests and one desktop acceptance test passed. The desktop acceptance test also passed when launched against `release/win-unpacked/MuseCode.exe`.

The desktop acceptance test covers onboarding, a labeled offline preview, activity rendering, theme switching, command palette, native picker and preload IPC, actual local file previews, actual Git diffs, missing-binary errors, renderer isolation and a compact window size. Screenshots were captured and visually reviewed from the source desktop build. Packaged acceptance verifies interaction and IPC without screenshot capture because hidden-window capture did not complete reliably in that build.

Not validated: real Meta authentication, a live Muse/Wonder coding session, real model entitlement changes, native sandbox behavior, macOS/Linux packaging, signed installation, or full TUI feature parity. The fixture simulates transport semantics and never calls a model. The installer was generated, not installed on the user's machine.
