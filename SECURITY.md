# Security reports

Before public publication, maintainers must add a private reporting contact or enable GitHub private vulnerability reporting. Avoid placing credentials, session transcripts, private source code, or exploits against real accounts in public issues.

MuseCode's renderer is sandboxed and uses a narrow preload interface. Native agent permissions and sandboxing belong to the installed Muse Code runtime. A project opened for a coding session can be modified by that agent according to its configured policy. MuseCode's own file browser and Git review paths are read-only.
