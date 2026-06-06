# fix(uiblocks): prevent leading spaces on wrapped lines in TextWithEmoji

- Automatically groups space segments with their preceding words by appending spaces directly to the word's Text value.
- Groups space segments with their preceding emojis by applying calculated spaces as marginRight on the emoji's Image component.
- Retains explicit spaces following newlines or at the start of text as standalone space segments.
- Updates and expands Vitest suite with comprehensive space-grouping layout assertions.

<img width="1580" height="1700" alt="image" src="https://github.com/user-attachments/assets/2218d09a-6dc6-4072-b3ab-3551407e367f" />
