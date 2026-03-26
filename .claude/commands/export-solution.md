# Export Solution

Export the XrmQuickEdit solution from Dataverse as both managed and unmanaged ZIP files.

## Instructions

**Step 1: Ensure the output folder exists**

Check if the `solutions` folder exists at the project root. If not, create it.

**Step 2: Check for PAC profile "XrmQuickEdit"**

Run:

```
pac auth list
```

Look for a profile with the name **XrmQuickEdit** in the output. The name column must match exactly.

If the profile does NOT exist, STOP immediately and tell the user:

> PAC auth profile **XrmQuickEdit** not found. Please create it first using:
> `pac auth create --name XrmQuickEdit --url <your-environment-url>`

Do NOT proceed further.

**Step 3: Select the PAC profile**

Run:

```
pac auth select --name XrmQuickEdit
```

If this fails, show the error and stop.

**Step 4: Export unmanaged solution**

Run:

```
pac solution export --name XrmQuickEdit --path solutions/XrmQuickEdit.zip --overwrite
```

If this fails, show the full error output and stop.

**Step 5: Export managed solution**

Run:

```
pac solution export --name XrmQuickEdit --path solutions/XrmQuickEdit_managed.zip --managed --overwrite
```

If this fails, show the full error output and stop.

**Step 6: Report result**

Tell the user both exports succeeded and list the output files:

- `solutions/XrmQuickEdit.zip` (unmanaged)
- `solutions/XrmQuickEdit_managed.zip` (managed)
