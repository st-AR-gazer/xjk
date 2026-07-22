# Split Helpers

Tools for exporting one service into a standalone repo scaffold.

## Export One Service

```powershell
powershell -File services/split/export-service.ps1 -Service tracker -DestinationRoot C:\temp
```

## Options

- `-Service altered|tracker|tracker-displayname|tracker-club|aggregator`
- `-DestinationRoot <path>`
- `-IncludeNodeModules` (optional)

The export includes the selected service folder, `.env.example` (if present), and `services/contracts/`.
