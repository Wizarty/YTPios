# Project instructions

Read REQUIREMENTS.md and docs/GOOGLE_INTEGRATION.md before changing integration scope. The user's goal includes full integration; never describe the local-library prototype or mocked API tests as completion of that goal.

Use the existing checkout. Do not introduce credentials into source, build artifacts or commits. OAuth access tokens stay in memory, never localStorage. Google API writes must follow an explicit UI action and granted write scope.

After integration changes run `npm run build`, `npm test`, `npm run test:browser`, and `npm run test:integration`. Browser checks require Chromium; set CHROMIUM_PATH where needed. Distinguish provider stubs from real Google/iPhone validation.

For Invidious, feed or native-player changes also run `npm run test:invidious`. Never forward Google tokens, cookies or API keys to the media backend. Read docs/INVIDIOUS.md for the configured-server boundary and live-validation limitations.
