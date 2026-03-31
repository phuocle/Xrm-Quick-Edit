---
name: deploy-web-resource
description: Deploy one local Dataverse web resource file using devkit CLI and mapping metadata. Use when the user asks to deploy a specific file.
---

# Deploy Web Resource

Deploy a single local file to the mapped Dataverse web resource.

## Input

- Required: local file path (for example: `src/js/Translator/TranslationHandler.js`).

## Steps

1. Validate input path exists.
2. Read `.env` at project root and require:
   - `DEVKIT_AUTH_TYPE`
   - `DEVKIT_URL`
   - `DEVKIT_CLIENT_ID`
   - `DEVKIT_CLIENT_SECRET`
3. Read `.codex/mapping.xml` and find the `<File>` with matching `LocalPath`.
4. Extract `UniqueName` from the match.
5. Run deploy command and wait for completion:

```bash
devkit webresource --auth <DEVKIT_AUTH_TYPE> --url <DEVKIT_URL> --clientid <DEVKIT_CLIENT_ID> --clientsecret "<DEVKIT_CLIENT_SECRET>" -f "<LOCAL_PATH>" -w "<UNIQUE_NAME>" --plain
```

## Failure conditions

- Missing input path: stop and ask for a file path.
- Missing file: stop and report path not found.
- Missing `.env` or required keys: stop and report required keys.
- Missing mapping entry: stop and report no CRM mapping found.
- CLI failure: show full error output.
