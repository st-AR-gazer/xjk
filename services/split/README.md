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

## Publish One Folder to a Separate Remote

```powershell
powershell -File services/split/push-subtree.ps1 `
  -Prefix services/tracker `
  -Remote tracker-origin `
  -RemoteBranch main `
  -Force
```

This keeps the monorepo approach while publishing selected services to their own repos.
