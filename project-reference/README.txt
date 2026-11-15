ZEHRA PLAST REFERENCE FILES

Start with ../README.md for the current implemented React frontend and
../docs/SCOPE_COVERAGE.md for scope mapping and business decisions.
../ZEHRA_PLUS_PROJECT_MEMORY.txt preserves the original document review under its
historical filename, including scope boundaries, caveats and discovery questions.

catalog.json: All 317 catalog entries with source page/serial, exact source fields
(whitespace normalized), numeric readings and notes. Unavailable rates are null.
The file records PKR and selling-unit/carton semantics from the scope separately
from what the catalog header itself states. It is not a production import.

catalog-counts.json: Counts by brand/category, missing values and all page ranges.
source-manifest.json: Source identities, page counts and SHA-256 file fingerprints.
source-text/: Complete extracted text and page-indexed JSON from both original PDFs.

The PDFs in the workspace root remain authoritative for layout, images and exact
source wording. Extraction may represent bullet glyphs imperfectly. No customer
names, real discount agreements, permanent SKUs or corrected prices were supplied
or invented in this source transcription. The application created afterward uses
clearly labeled sample customers and locally assigned product identifiers.
