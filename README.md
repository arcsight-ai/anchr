# ANCHR

ANCHR is a deterministic architectural certification engine.

## run.id — Repository State Identity

`run.id` is a deterministic architectural state identifier derived from the repository content. If `run.id` matches between environments (local, CI, any machine), the codebase is identical in structure and content.

- **Deterministic**: Same files and content → same `run.id` everywhere.
- **Content-based**: Uses file content hashes, not timestamps or git metadata.
- **Cross-platform**: Identical results on macOS, Linux, and CI.

## Usage

```bash
npm install
npm run build
npm start
```

## Output

```
ANCHR RUN
files: <count>
fingerprint: <64 hex>
run.id: <16 hex>
```
