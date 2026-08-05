param([string]$OutputDirectory = "public/icons")

Add-Type -AssemblyName System.Drawing
$resolvedRoot = (Resolve-Path -LiteralPath ".").Path
$target = Join-Path $resolvedRoot $OutputDirectory
New-Item -ItemType Directory -Path $target -Force | Out-Null

function New-RoundedRectanglePath([single]$X, [single]$Y, [single]$Width, [single]$Height, [single]$Radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = [single]($Radius * 2)
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-AppIcon([int]$Size, [string]$Name, [bool]$Maskable = $false) {
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#173F35"))
  $padding = if ($Maskable) { [int]($Size * 0.21) } else { [int]($Size * 0.12) }
  $lime = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#C8EE67"))
  $cream = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#F4F1EA"))
  $graphics.FillEllipse($lime, $padding, $padding, $Size - 2 * $padding, $Size - 2 * $padding)

  $pillWidth = [single]($Size * 0.31)
  $pillHeight = [single]($Size * 0.57)
  $pillX = [single](($Size - $pillWidth) / 2)
  $pillY = [single](($Size - $pillHeight) / 2)
  $pillPath = New-RoundedRectanglePath $pillX $pillY $pillWidth $pillHeight ([single]($pillWidth / 2))
  $outline = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml("#173F35"), [single]($Size * 0.04))
  $outline.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $outline.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.TranslateTransform([single]($Size / 2), [single]($Size / 2))
  $graphics.RotateTransform(-42)
  $graphics.TranslateTransform([single](-$Size / 2), [single](-$Size / 2))
  $graphics.FillPath($cream, $pillPath)
  $graphics.DrawPath($outline, $pillPath)
  $graphics.DrawLine($outline, $pillX, [single]($Size / 2), [single]($pillX + $pillWidth), [single]($Size / 2))
  $graphics.ResetTransform()

  $path = Join-Path $target $Name
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $outline.Dispose(); $pillPath.Dispose(); $cream.Dispose(); $lime.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

New-AppIcon 180 "apple-touch-icon.png"
New-AppIcon 192 "icon-192.png"
New-AppIcon 512 "icon-512.png"
New-AppIcon 512 "maskable-512.png" $true
New-AppIcon 96 "badge-96.png" $true
