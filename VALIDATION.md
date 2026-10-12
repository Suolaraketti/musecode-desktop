# Alpha validation — October 12, 2026

MuseCode 0.3.0 was validated on Windows x64 with Node.js 24.14.1, Electron 44.7.0 and Meta Muse Code SDK/runtime 1.4.6.

| Check | Result |
| --- | --- |
| TypeScript renderer (`npm run check`) | Passed |
| Production frontend build (`npm run build`) | Passed |
| Native handshake and experimental account capability | Passed with released Muse 1.4.6 |
| Native account status and device-login start/cancel | Passed with released Muse 1.4.6; no browser or model call |
| Fresh automatic Windows runtime installation | Passed using the app's installer module and official Meta downloads |
| MSP initialization, streaming and final-revision authority | Passed against deterministic fixture host |
| Explicit native approval choice/stage round trip | Passed against deterministic fixture host |
| Session resume and history restoration | Passed against deterministic fixture host |
| Live account usage percentages | Confirmed by the maintainer on October 12, 2026 |
| Native usage envelope, reset times, over-quota values and unknown shapes | Passed against SDK contract fixtures |
| Native reminder/workflow routing, dismissal and timed snooze | Passed in desktop acceptance |
| Approval mode confirmation, refusal and saved preference | Passed in desktop acceptance |
| First-run account confirmation and recovery states | Passed against deterministic fixture host |
| Returning account and bounded reconnect without prompt replay | Passed against deterministic fixture host |
| Startup cancellation shuts down the owned host | Passed |
| Active-version discovery and installer integrity/environment constraints | Passed |
| Path traversal, symlink escape, binary/size preview limits | Passed |
| Git status with spaces/renames; staged, unstaged, untracked diffs | Passed |
| Source Electron desktop acceptance suite | Passed |
| Packaged Windows executable desktop acceptance suite | Passed: both tests |
| Unsigned Windows NSIS installer build | Passed |
| Full dependency audit (`npm audit`) | Zero reported vulnerabilities |

All 17 Node tests and both source desktop acceptance tests passed. Desktop tests exercise native-process transport through an isolated fixture, rather than calling a model. They verify guided sign-in, browser-link handling, project selection, native approvals, saved drafts, conversation restoration after restart, offline preview labels, themes, command palette, filesystem/Git IPC, advanced settings, approval-mode refusal without saving a rejected preference, timed snooze expiry and renderer isolation. The app holds a single-instance lock. Source screenshots were captured and visually reviewed.

Both desktop tests also passed against `release/win-unpacked/MuseCode.exe`. Packaged acceptance verifies interaction and IPC without screenshot capture because hidden-window capture was unreliable in earlier checks. The Windows NSIS installer was generated from this packaged build.

The managed installer was tested against a fresh app-owned directory. It downloaded and verified Meta's actual runtime without changing PATH or starting login. A subsequent smoke test initialized that binary, read the logged-out account, started a native device-code login, and cancelled it. This validates real native integration through login initiation; it does not establish that a user completed authorization.

Not independently validated: fresh-account Meta authorization, a full live Muse/Wonder coding regression pass, real model entitlement changes, native sandbox behavior, macOS/Linux packaging, signed installation, or full TUI feature parity. The Windows installer is unsigned and was generated, not installed on the user's machine. Runtime installation and update checks require access to Meta's official download endpoints. Account access and model availability remain controlled by Meta.
