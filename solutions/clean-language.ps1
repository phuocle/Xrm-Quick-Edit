<#
.SYNOPSIS
    Removes all non-English (non-1033) language entries from unpacked Dataverse solution XML files.

.DESCRIPTION
    Processes all XML files in an unpacked solution folder and:
    1. Removes elements with languagecode attribute != 1033
    2. Removes elements with LCID attribute != 1033 (SiteMap)
    3. Cleans <Languages> block to keep only 1033

.PARAMETER Path
    Path to the unpacked solution folder.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Path)) {
    Write-Error "Path not found: $Path"
    exit 1
}

$xmlFiles = Get-ChildItem -Path $Path -Recurse -Filter "*.xml"
$totalCleaned = 0

foreach ($file in $xmlFiles) {
    $modified = $false
    [xml]$xml = Get-Content -Path $file.FullName -Raw -Encoding UTF8

    # 1. Remove elements with languagecode != 1033
    $langNodes = $xml.SelectNodes("//*[@languagecode and @languagecode!='1033']")
    if ($langNodes -and $langNodes.Count -gt 0) {
        foreach ($node in $langNodes) {
            $node.ParentNode.RemoveChild($node) | Out-Null
        }
        $modified = $true
    }

    # 2. Remove elements with LCID != 1033 (SiteMap)
    $lcidNodes = $xml.SelectNodes("//*[@LCID and @LCID!='1033']")
    if ($lcidNodes -and $lcidNodes.Count -gt 0) {
        foreach ($node in $lcidNodes) {
            $node.ParentNode.RemoveChild($node) | Out-Null
        }
        $modified = $true
    }

    # 3. Clean <Languages> block — keep only 1033
    $languageNodes = $xml.SelectNodes("//Languages/Language")
    if ($languageNodes -and $languageNodes.Count -gt 0) {
        foreach ($node in $languageNodes) {
            if ($node.InnerText.Trim() -ne "1033") {
                $node.ParentNode.RemoveChild($node) | Out-Null
                $modified = $true
            }
        }
    }

    if ($modified) {
        $settings = New-Object System.Xml.XmlWriterSettings
        $settings.Indent = $true
        $settings.Encoding = New-Object System.Text.UTF8Encoding($false)
        $settings.OmitXmlDeclaration = $false

        $writer = [System.Xml.XmlWriter]::Create($file.FullName, $settings)
        $xml.Save($writer)
        $writer.Close()

        $totalCleaned++
        Write-Host "  Cleaned: $($file.FullName)"
    }
}

Write-Host ""
Write-Host "Done. Cleaned $totalCleaned file(s). Only English (1033) remains."
