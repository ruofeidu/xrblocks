# Add newlines support in TextWithEmoji

- Updates WORD_EMOJI_REGEX to separate newlines from standard spacing.
- Renders newlines as 100% width flex Containers.
- Assigns zero height to single newlines (forces clean wrap) and full line-height to consecutive newlines (renders empty vertical spacing).
- Adds unit tests validating newline layout configurations.
