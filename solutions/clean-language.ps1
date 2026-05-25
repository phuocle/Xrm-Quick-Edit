<#
.SYNOPSIS
    Removes all non-base-language entries from unpacked Dataverse solution XML files and stamps the About dialog version.

.DESCRIPTION
    Processes all XML files in an unpacked solution folder and:
    1. Removes elements with languagecode attribute != BaseLanguageCode
    2. Removes elements with LCID attribute != BaseLanguageCode (SiteMap)
    3. Cleans <Languages> block to keep only BaseLanguageCode
    4. Replaces the About dialog version placeholder in the unpacked XrmTranslator.js with the solution version.

.PARAMETER Path
    Path to the unpacked solution folder.

.PARAMETER BaseLanguageCode
    Dataverse organization base language LCID to keep, for example 1033 or 1041.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 999999)]
    [int]$BaseLanguageCode
)

$ErrorActionPreference = "Stop"
$baseLanguageCodeText = [string]$BaseLanguageCode

if (-not (Test-Path $Path)) {
    Write-Error "Path not found: $Path"
    exit 1
}

$solutionXmlPath = Join-Path $Path "Other\Solution.xml"
if (-not (Test-Path $solutionXmlPath)) {
    Write-Error "Solution.xml not found: $solutionXmlPath"
    exit 1
}

[xml]$solutionXml = Get-Content -Path $solutionXmlPath -Raw -Encoding UTF8
$solutionVersion = [string]$solutionXml.ImportExportXml.SolutionManifest.Version
if ([string]::IsNullOrWhiteSpace($solutionVersion)) {
    Write-Error "Solution version not found in: $solutionXmlPath"
    exit 1
}

$xmlFiles = Get-ChildItem -Path $Path -Recurse -Filter "*.xml"
$totalCleaned = 0

foreach ($file in $xmlFiles) {
    $modified = $false
    [xml]$xml = Get-Content -Path $file.FullName -Raw -Encoding UTF8

    # 1. Remove elements with languagecode != base language
    $langNodes = $xml.SelectNodes("//*[@languagecode and @languagecode!='$baseLanguageCodeText']")
    if ($langNodes -and $langNodes.Count -gt 0) {
        foreach ($node in $langNodes) {
            $node.ParentNode.RemoveChild($node) | Out-Null
        }
        $modified = $true
    }

    # 2. Remove elements with LCID != base language (SiteMap)
    $lcidNodes = $xml.SelectNodes("//*[@LCID and @LCID!='$baseLanguageCodeText']")
    if ($lcidNodes -and $lcidNodes.Count -gt 0) {
        foreach ($node in $lcidNodes) {
            $node.ParentNode.RemoveChild($node) | Out-Null
        }
        $modified = $true
    }

    # 3. Clean <Languages> block: keep only base language
    $languageNodes = $xml.SelectNodes("//Languages/Language")
    if ($languageNodes -and $languageNodes.Count -gt 0) {
        foreach ($node in $languageNodes) {
            if ($node.InnerText.Trim() -ne $baseLanguageCodeText) {
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
Write-Host "Done. Cleaned $totalCleaned file(s). Only base language ($baseLanguageCodeText) remains."

$versionPlaceholder = "Version: x.xx.xx.xx"
$webResourcesPath = Join-Path $Path "WebResources"
$versionFiles = Get-ChildItem -Path $webResourcesPath -Recurse -Filter "*.js" |
    Where-Object {
        $content = Get-Content -Path $_.FullName -Raw -Encoding UTF8
        $content.Contains($versionPlaceholder)
    }

if (-not $versionFiles -or $versionFiles.Count -eq 0) {
    Write-Error "About dialog version placeholder '$versionPlaceholder' not found under: $webResourcesPath"
    exit 1
}

foreach ($file in $versionFiles) {
    $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8
    $content = $content.Replace($versionPlaceholder, "Version: $solutionVersion")
    [System.IO.File]::WriteAllText($file.FullName, $content, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "  Stamped version $solutionVersion in: $($file.FullName)"
}
