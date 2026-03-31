# Export Solution

Export the XrmQuickEdit solution from Dataverse, unpack it, clean non-English languages, and repack.

## Instructions

**Step 1: Check for PAC profile "XrmQuickEdit"**

Run:

```
pac auth list
```

Look for a profile with the name **XrmQuickEdit** in the output. The name column must match exactly.

If the profile does NOT exist, STOP immediately and tell the user:

> PAC auth profile **XrmQuickEdit** not found. Please create it first using:
> `pac auth create --name XrmQuickEdit --url <your-environment-url>`

Do NOT proceed further.

**Step 2: Select the PAC profile**

Run:

```
pac auth select --name XrmQuickEdit
```

If this fails, show the error and stop.

**Step 3: Export to `solutions/1.before/`**

Ensure the folder `solutions/1.before` exists (create if needed). Then export both managed and unmanaged:

```bash
pac solution export --name XrmQuickEdit --path solutions/1.before/XrmQuickEdit.zip --overwrite
pac solution export --name XrmQuickEdit --path solutions/1.before/XrmQuickEdit_managed.zip --managed --overwrite
```

If either fails, show the full error output and stop.

**Step 4: Unpack to `solutions/2.unpack/`**

Delete `solutions/2.unpack` if it exists, then unpack both:

```bash
pac solution unpack --zipfile solutions/1.before/XrmQuickEdit.zip --folder solutions/2.unpack --packagetype Both --allowWrite true --clobber true
```

Using `--packagetype Both` unpacks both managed and unmanaged into the same folder.

**Step 5: Clean non-English languages**

Run the PowerShell script to remove all non-1033 language entries:

```bash
powershell -ExecutionPolicy Bypass -File solutions/clean-language.ps1 -Path solutions/2.unpack
```

**Step 6: Repack to `solutions/3.after/`**

Ensure the folder `solutions/3.after` exists (create if needed). Then pack both:

```bash
pac solution pack --zipfile solutions/3.after/XrmQuickEdit.zip --folder solutions/2.unpack --packagetype Unmanaged
pac solution pack --zipfile solutions/3.after/XrmQuickEdit_managed.zip --folder solutions/2.unpack --packagetype Managed
```

**Step 7: Report result**

Tell the user the pipeline succeeded and list the output files:

- `solutions/1.before/XrmQuickEdit.zip` (original unmanaged)
- `solutions/1.before/XrmQuickEdit_managed.zip` (original managed)
- `solutions/3.after/XrmQuickEdit.zip` (English-only unmanaged)
- `solutions/3.after/XrmQuickEdit_managed.zip` (English-only managed)
