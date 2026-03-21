# Open-source vocab source

- File: `30k.txt`
- Source: https://github.com/arstgit/high-frequency-vocabulary
- License: MIT (see `LICENSE.arstgit.txt`)
- Usage:
  - Clean the raw source before testing.
  - Remove abbreviations, brand names, person names, place names, and other proper nouns.
  - Keep the first 20,000 cleaned high-frequency words as the shared public-core vocabulary.
  - Split the public core into L1-L10 by cumulative targets: `500 / 1,000 / 2,000 / 3,500 / 5,000 / 7,000 / 9,500 / 12,500 / 16,000 / 20,000`.
- Product rule:
  - Public-core mastery is tracked separately from `user_vocabulary`.
  - Only failed or explicitly collected words from the test should enter the personal vocabulary table.
