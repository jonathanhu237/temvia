# 语言与外观偏好：官方资料调研

Status: research; preference scope not decided

## Evidence and limits

Research used web-search excerpts from official help pages. Direct page fetches were blocked by this environment's fake-IP/SSRF handling, so no claim of full-page inspection or live multi-device testing is made. Search results are sufficient for the explicit statements quoted below, not unspecified persistence behavior.

### Slack

- https://slack.com/help/articles/360019434914-Use-dark-mode-in-Slack
- Explicit statement: “The dark mode preference is device specific, so setting it on the desktop app won’t apply to the mobile app.” Supports per-device dark/light preference and OS appearance following.
- https://slack.com/help/articles/205166337-Change-your-Slack-theme
- Explicit statement about workspace color theme: “Your new theme will appear whenever you open Slack on any device or in your browser.” This is not a contradiction: workspace color theme differs from dark/light mode. Do not conflate them under the ambiguous word theme.

### ChatGPT

- https://help.openai.com/en/articles/11958281-updating-your-visual-experience-on-chatgpt
- Explicit statements: “Appearance is device- or platform-specific, so you may need to choose it separately on the web and in each mobile app.” “Your Accent color is saved to your account and can carry across supported devices”.
- Demonstrates separate scope for dark/light appearance versus accent color. Does not establish an exact per-browser storage implementation.

### Google

- https://support.google.com/accounts/answer/32047
- Official instructions distinguish preferred language for Google services on the web (set in the Google Account) from mobile app language (device settings).
- https://support.google.com/a/answer/43212?hl=en
- Explicit statement: Google Account preferred language is used across Google services on the web, including the Admin console.

### Notion

- https://www.notion.com/help/change-your-language
- Official instructions place desktop display language under Settings → Preferences → Language & Time; “On mobile, your Notion app language will follow the language ranking in your system preferences.”
- https://www.notion.com/help/account-settings
- Documents Use system setting / Light / Dark choices. Available official excerpts did not explicitly establish cross-device persistence, so do not claim Notion syncs (or does not sync) appearance between devices. Third-party descriptions were not used to fill that gap.

## Interpretation for this project (recommendation, not accepted decision)

- These examples do not establish a universal industry rule that all personal settings belong to the account.
- Separating cross-device identity/preferences from device/platform appearance is supported by explicit examples.
- Recommend account-level interface language for this web admin; recommend browser-local light/dark/system appearance with system as default, regardless of the consolidated Personal settings location.
- Native mobile app distinctions in the sources should not be mechanically equated with this responsive web application's mobile browser behavior. Browser-local appearance is a proposed product choice for Temvia, not a directly verified implementation fact about all referenced products.
- No preference persistence change is yet confirmed by the user; keep Q7 open.
