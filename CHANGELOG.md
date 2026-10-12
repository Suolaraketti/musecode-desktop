# Changelog

## 0.3.0 alpha — 2026-10-12

- Display live account usage windows and reset times in Settings and the status bar using Muse's native subscription response. Live percentages were confirmed by the maintainer.
- Keep reminders and background-agent/workflow updates in a collapsed notice tray, with dismissal and 30-minute snooze.
- Batch streamed updates and initially display the latest 80 messages, with earlier history available on demand.
- Add native approval-mode selection for the current conversation and future ones. Save preferences after the host confirms a change; rejected changes preserve the previous preference.
- Verify native usage, reminder routing, snooze expiry, approval refusal and workspace restoration in desktop acceptance tests.

## 0.2.1 alpha — 2026-10-12

- Align both themes with Muse's blue actions and neutral surfaces.
- Replace the green tile emblem with an original handwritten M, including the native app and installer icons.
- Use rounded primary buttons and Meta's typography stack with local system-font fallbacks.
- Keep added/removed code colors distinct from the product's blue accent.

## 0.2.0 alpha — 2026-10-12

- Replace executable-path setup with guided Meta sign-in and automatic Windows runtime preparation.
- Keep account authorization, credential storage and refresh in the official Muse host.
- Restore the last project, native conversation and unsent draft after restart.
- Reconnect interrupted transport without resubmitting prompts, and focus the existing window on repeated launches.
- Check for app-managed runtime updates in the background and load the model catalog before the first prompt.
- Move custom runtime configuration into collapsed Advanced settings.
- Verify fresh official runtime installation, real native login initiation/cancellation, and automated onboarding/restoration.

Completed account authorization and live Wonder coding remain pending user-account validation.

## 0.1.0 alpha — 2026-10-12

- Initial desktop workspace with the official SDK, streaming conversations, explicit approvals, native sessions, file previews and Git diffs.
