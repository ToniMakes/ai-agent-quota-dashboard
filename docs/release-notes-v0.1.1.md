# v0.1.1 Unsigned Windows Preview

This preview contains the latest quota-window UI, data-quality safeguards,
local HTTP hardening, and release-process improvements.

The Windows x64 installer is intentionally unsigned while SignPath Foundation
review is pending. Windows may show an unknown-publisher or SmartScreen warning.
Verify the SHA256 checksum asset attached to the GitHub Release before running it.

This release remains a preview for technically curious early users. AIQD reads
local provider files and statusline data only; it does not read browser cookies,
passwords, prompts, responses, source code, or hidden provider APIs.
