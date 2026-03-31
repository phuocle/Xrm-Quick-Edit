---
name: export-solution
description: Export XrmQuickEdit solution from Dataverse, unpack, clean languages, and repack managed/unmanaged packages.
---

# Export Solution Pipeline

Export solution artifacts and produce cleaned output packages.

## Steps

1. Confirm PAC profile exists:

```bash
pac auth list
```

Require profile name `XrmQuickEdit`. If missing, stop and ask user to create it.

2. Select profile:

```bash
pac auth select --name XrmQuickEdit
```

3. Export both packages to `solutions/1.before/`:

```bash
pac solution export --name XrmQuickEdit --path solutions/1.before/XrmQuickEdit.zip --overwrite
pac solution export --name XrmQuickEdit --path solutions/1.before/XrmQuickEdit_managed.zip --managed --overwrite
```

4. Recreate unpack folder and unpack:

```bash
pac solution unpack --zipfile solutions/1.before/XrmQuickEdit.zip --folder solutions/2.unpack --packagetype Both --allowWrite true --clobber true
```

5. Clean non-English language entries:

```bash
powershell -ExecutionPolicy Bypass -File solutions/clean-language.ps1 -Path solutions/2.unpack
```

6. Repack both variants to `solutions/3.after/`:

```bash
pac solution pack --zipfile solutions/3.after/XrmQuickEdit.zip --folder solutions/2.unpack --packagetype Unmanaged
pac solution pack --zipfile solutions/3.after/XrmQuickEdit_managed.zip --folder solutions/2.unpack --packagetype Managed
```

7. Report output artifacts:

- `solutions/1.before/XrmQuickEdit.zip`
- `solutions/1.before/XrmQuickEdit_managed.zip`
- `solutions/3.after/XrmQuickEdit.zip`
- `solutions/3.after/XrmQuickEdit_managed.zip`
