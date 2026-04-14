# Changelog

## Unreleased

### Bug Fixes

- **Fix macOS 26 compatibility** — The JXA (JavaScript for Automation) API broke in macOS 26 (Darwin 25) in two ways: `Contacts.groups.whose()` is no longer a valid function, and the ObjC bridge used to write vCard data to stdout fails with error -1741. Both `getNumberOfContacts` and `getVCards` have been rewritten to use AppleScript instead of JXA. The `osascript` invocation no longer passes `-l JavaScript`. This fixes the symptom where the plugin correctly reported a contact count but imported zero files. (Relates to issues #18 and #19.)
