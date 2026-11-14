# Changelog

## v1.0.4 *2026-11-14*
- fix surrogate pair handling: now correctly handles emoji and other supplementary plane characters (code points > 65535)
- fix unicode flag detection: automatically set for non-ASCII substitution values
- fix control character escaping: use hex escapes (\x01, \x07, etc.) instead of raw characters for code points 1-8
- fix typos: correct "subtitutions" to "substitutions" in source, and "subsituted" to "substituted" in README
- add comprehensive tests for unicode handling: emoji, supplementary plane characters, zero-width characters, combined unicode, and control characters
- update README: note that higher number codepoints are now supported

## v1.0.3 *2025-7-30*
- change tsconfig.json to target es6 to unlock the 'u' regex modifier

## v1.0.2 *2022-2-19*
- added support for `\0` and `\v`
- improved efficiency of quotemeta slightly

## v1.0.1 *2022-2-13*
- fixed mistake in package.json

## v1.0.0 *2022-2-13*

- initial release
