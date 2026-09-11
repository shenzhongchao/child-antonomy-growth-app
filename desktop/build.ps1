param([switch]$Shortcut)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$project   = Split-Path -Parent $scriptDir
$out       = Join-Path $scriptDir 'GrowthApp'
$www       = Join-Path $out 'www'
$pkg       = Join-Path $scriptDir 'packages'
$dist      = Join-Path $project 'dist'
$ver       = '1.0.992.28'
$id        = 'microsoft.web.webview2'

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw 'csc.exe not found (.NET Framework 4.x required)' }

New-Item -ItemType Directory -Force -Path $out, $www, $pkg | Out-Null

Write-Host '1/5 copying dist -> GrowthApp\www'
Copy-Item (Join-Path $dist '*') $www -Force

Write-Host '2/5 preparing WebView2 SDK (' $ver ')'
$zip = Join-Path $pkg 'webview2.zip'
if (-not (Test-Path $zip)) {
    Invoke-WebRequest ('https://api.nuget.org/v3-flatcontainer/' + $id + '/' + $ver + '/' + $id + '.' + $ver + '.nupkg') -OutFile $zip -UseBasicParsing
}
$extract = Join-Path $pkg 'core'
if (-not (Test-Path (Join-Path $extract 'lib\net45\Microsoft.Web.WebView2.Core.dll'))) {
    if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
    Expand-Archive $zip $extract -Force
}
foreach ($f in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll')) {
    Copy-Item (Join-Path $extract ('lib\net45\' + $f)) $out -Force
}
Copy-Item (Join-Path $extract 'runtimes\win-x64\native\WebView2Loader.dll') $out -Force

Write-Host '3/5 generating icon'
$pngSrc = Join-Path $dist 'star-friend.png'
$ico    = Join-Path $scriptDir 'app.ico'
if (Test-Path $pngSrc) {
    Add-Type -AssemblyName System.Drawing
    $src = [System.Drawing.Image]::FromFile($pngSrc)
    $sizes = @(16, 32, 48, 256)
    $blobs = @()
    foreach ($s in $sizes) {
        # render frame
        $bmp = New-Object System.Drawing.Bitmap($s, $s)
        $gfx = [System.Drawing.Graphics]::FromImage($bmp)
        $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $gfx.DrawImage($src, 0, 0, $s, $s)
        $gfx.Dispose()
        $rect = New-Object System.Drawing.Rectangle(0, 0, $s, $s)
        $bd = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $pixels = New-Object byte[] ($s * $s * 4)
        [System.Runtime.InteropServices.Marshal]::Copy($bd.Scan0, $pixels, 0, $pixels.Length)
        $bmp.UnlockBits($bd)
        $bmp.Dispose()
        # flip to bottom-up (BMP-in-ICO requires it)
        $stride = $s * 4
        $xor = New-Object byte[] $pixels.Length
        for ($y = 0; $y -lt $s; $y++) {
            [Array]::Copy($pixels, ($y * $stride), $xor, (($s - 1 - $y) * $stride), $stride)
        }
        $pixels = $null
        # AND mask (all zeros, alpha does the transparency)
        $andStride = [int]([Math]::Ceiling($s / 32.0) * 4)
        $andSize = $andStride * $s
        # BITMAPINFOHEADER
        $hdr = New-Object byte[] 40
        [BitConverter]::GetBytes([UInt32]40).CopyTo($hdr, 0)
        [BitConverter]::GetBytes([Int32]$s).CopyTo($hdr, 4)
        [BitConverter]::GetBytes([Int32]($s * 2)).CopyTo($hdr, 8)
        [BitConverter]::GetBytes([UInt16]1).CopyTo($hdr, 12)
        [BitConverter]::GetBytes([UInt16]32).CopyTo($hdr, 14)
        [BitConverter]::GetBytes([UInt32]($xor.Length + $andSize)).CopyTo($hdr, 20)
        $blob = New-Object byte[] (40 + $xor.Length + $andSize)
        $hdr.CopyTo($blob, 0)
        $xor.CopyTo($blob, 40)
        $blobs += , $blob
        $xor = $null; $blob = $null
    }
    $src.Dispose()
    # pack ICO
    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)
    $bw.Write([UInt16]0)   # reserved
    $bw.Write([UInt16]1)   # type: icon
    $bw.Write([UInt16]$blobs.Count)
    $offset = 6 + 16 * $blobs.Count
    $i = 0
    foreach ($blob in $blobs) {
        $dim = if ($sizes[$i] -eq 256) { [byte]0 } else { [byte]$sizes[$i] }
        $bw.Write($dim)          # width  (0 = 256)
        $bw.Write($dim)          # height (0 = 256)
        $bw.Write([byte]0)       # colors
        $bw.Write([byte]0)       # reserved
        $bw.Write([UInt16]1)     # planes
        $bw.Write([UInt16]32)    # bit depth
        $bw.Write([UInt32]$blob.Length)
        $bw.Write([UInt32]$offset)
        $offset += $blob.Length
        $i++
    }
    foreach ($blob in $blobs) { $bw.Write($blob) }
    $bw.Flush()
    [IO.File]::WriteAllBytes($ico, $ms.ToArray())
    $bw.Dispose(); $ms.Dispose()
}

Write-Host '4/5 compiling'
$compileArgs = @(
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    ('/out:'    + (Join-Path $out 'GrowthApp.exe')),
    ('/r:'      + (Join-Path $out 'Microsoft.Web.WebView2.Core.dll')),
    ('/r:'      + (Join-Path $out 'Microsoft.Web.WebView2.WinForms.dll')),
    '/r:System.dll',
    '/r:System.Core.dll',
    '/r:System.Drawing.dll',
    '/r:System.Windows.Forms.dll',
    '/r:System.Web.Extensions.dll',
    ('/win32manifest:' + (Join-Path $scriptDir 'app.manifest'))
)
if (Test-Path $ico) { $compileArgs += ('/win32icon:' + $ico) }
$compileArgs += (Join-Path $scriptDir 'Program.cs')
& $csc $compileArgs
if ($LASTEXITCODE -ne 0) { throw 'compilation failed' }

if ($Shortcut) {
    $name = -join @([char]0x4eca, [char]0x5929, [char]0x6211, [char]0x505a, [char]0x4e3b)
    $exe  = Join-Path $out 'GrowthApp.exe'
    $ws   = New-Object -ComObject WScript.Shell
    $sc   = $ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) ($name + '.lnk')))
    $sc.TargetPath       = $exe
    $sc.WorkingDirectory = $out
    $sc.IconLocation     = ($exe + ',0')
    $sc.Save()
    Write-Host 'Desktop shortcut created.'
}

Write-Host ''
Write-Host 'Build OK. App folder:'
Write-Host $out
Write-Host 'Double-click GrowthApp.exe to open. Data stored in %USERPROFILE%\.growth'
