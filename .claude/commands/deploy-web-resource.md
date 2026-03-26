# Deploy Web Resource

Deploy a single web resource file to Dataverse CRM.

## Input

$ARGUMENTS — the local file path to deploy (REQUIRED)

## Instructions

**Step 1: Validate input**

If `$ARGUMENTS` is empty or not provided, STOP immediately and tell the user:

> You must provide the local file path to deploy. Example: `/deploy-web-resource src/js/Translator/TranslationHandler.js`

Do NOT proceed further without a valid file path.

**Step 2: Verify the file exists**

Check that the file at `$ARGUMENTS` actually exists in the project. If it does not exist, tell the user:

> File `$ARGUMENTS` not found. Please check the path and try again.

**Step 3: Read environment variables**

Read the `.env` file at the project root. Parse the following variables:

- `DEVKIT_AUTH_TYPE`
- `DEVKIT_URL`
- `DEVKIT_CLIENT_ID`
- `DEVKIT_CLIENT_SECRET`

If `.env` is missing or any of these variables are not set, tell the user:

> Missing `.env` file or required environment variables. Please create a `.env` file at the project root with: `DEVKIT_AUTH_TYPE`, `DEVKIT_URL`, `DEVKIT_CLIENT_ID`, `DEVKIT_CLIENT_SECRET`.

**Step 4: Find the CRM unique name from the mapping file**

Read the mapping file at `.claude/mapping.xml` in the project root. This file contains `<File>` entries mapping `LocalPath` to `UniqueName`.

Find the entry where `LocalPath` matches `$ARGUMENTS`. Extract the `UniqueName` attribute value.

If no mapping is found, tell the user:

> No CRM mapping found for `$ARGUMENTS`. Check `.claude/mapping.xml` to ensure this file is mapped to a web resource.

**Step 5: Deploy using devkit CLI**

Run the following command and WAIT for it to complete (do NOT run in background):

```
devkit webresource --auth <DEVKIT_AUTH_TYPE> --url <DEVKIT_URL> --clientid <DEVKIT_CLIENT_ID> --clientsecret "<DEVKIT_CLIENT_SECRET>" -f "$ARGUMENTS" -w "<UniqueName>"
```

Replace placeholders with values from `.env` (Step 3) and `<UniqueName>` from Step 4.

**Step 6: Report result**

- If the command succeeds, tell the user: **Deployed `$ARGUMENTS`** as `<UniqueName>` successfully.
- If the command fails, show the full error output and tell the user the deployment failed.
