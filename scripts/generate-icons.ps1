param([string]$OutputDirectory = "public/icons")

Add-Type -AssemblyName System.Drawing
$resolvedRoot = (Resolve-Path -LiteralPath ".").Path
$target = Join-Path $resolvedRoot $OutputDirectory
New-Item -ItemType Directory -Path $target -Force | Out-Null

function New-AppIcon([int]$Size, [string]$Name, [bool]$Maskable = $false) {
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#173F35"))
  $padding = if ($Maskable) { [int]($Size * 0.21) } else { [int]($Size * 0.12) }
  $lime = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#C8EE67"))
  $cream = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#F4F1EA"))
  $graphics.FillEllipse($lime, $padding, $padding, $Size - 2 * $padding, $Size - 2 * $padding)
  $font = [System.Drawing.Font]::new("Georgia", [single]($Size * 0.44), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $graphics.DrawString("T", $font, [System.Drawing.Brushes]::DarkSlateGray, [System.Drawing.RectangleF]::new(0, -[single]($Size * 0.025), $Size, $Size), $format)
  $dot = [single]($Size * 0.035)
  $graphics.FillEllipse($cream, [single]($Size * 0.74), [single]($Size * 0.74), $dot, $dot)
  $path = Join-Path $target $Name
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $format.Dispose(); $font.Dispose(); $cream.Dispose(); $lime.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

New-AppIcon 180 "apple-touch-icon.png"
New-AppIcon 192 "icon-192.png"
New-AppIcon 512 "icon-512.png"
New-AppIcon 512 "maskable-512.png" $true
New-AppIcon 96 "badge-96.png" $true
