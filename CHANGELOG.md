# Changelog

## Unreleased

### New Features

- **Normalize diacritics in filenames** — A new toggle in plugin settings strips accents and diacritical marks from contact names when generating Obsidian file names (e.g. `Østen Andreassen` → `Osten Andreassen.md`). The display name inside the note is unchanged. Handles standard combining diacritics via Unicode NFD decomposition, plus explicit replacements for non-decomposing characters: Ø/ø, Æ/æ, Ð/ð, Þ/þ, ß, Ł/ł. When enabled, any existing files with un-normalized names are automatically renamed on the next sync rather than creating duplicates. Disabled by default.

### Bug Fixes

- **Fix macOS 26 compatibility** — The JXA (JavaScript for Automation) API broke in macOS 26 (Darwin 25) in two ways: `Contacts.groups.whose()` is no longer a valid function, and the ObjC bridge used to write vCard data to stdout fails with error -1741. Both `getNumberOfContacts` and `getVCards` have been rewritten to use AppleScript instead of JXA. The `osascript` invocation no longer passes `-l JavaScript`. This fixes the symptom where the plugin correctly reported a contact count but imported zero files. (Relates to issues #18 and #19.)
