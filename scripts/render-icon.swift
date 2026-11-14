import AppKit
import Foundation

// App icon that matches Dock / taskbar neighbors.
// Tauri and unsigned local .app bundles often skip the system squircle mask,
// so a full-bleed opaque square shows as a large sharp tile. Bake Apple's
// ~22.37% continuous rounded square into the alpha channel instead.

func render(size: Int) -> NSBitmapImageRep {
  let s = CGFloat(size)
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: size,
    pixelsHigh: size,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  )!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  let ctx = NSGraphicsContext.current!.cgContext
  ctx.setShouldAntialias(true)
  ctx.setAllowsAntialiasing(true)
  ctx.clear(CGRect(x: 0, y: 0, width: s, height: s))

  // iOS/macOS app-icon corner radius: 22.37% of width.
  let radius = max(s * 0.2237, 1)
  let squircle = NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: s, height: s), xRadius: radius, yRadius: radius)
  squircle.addClip()

  NSColor(srgbRed: 47 / 255, green: 61 / 255, blue: 74 / 255, alpha: 1).setFill()
  squircle.fill()

  let gradient = CGGradient(
    colorsSpace: CGColorSpaceCreateDeviceRGB(),
    colors: [
      NSColor(srgbRed: 58 / 255, green: 74 / 255, blue: 88 / 255, alpha: 0.45).cgColor,
      NSColor(srgbRed: 47 / 255, green: 61 / 255, blue: 74 / 255, alpha: 0).cgColor,
    ] as CFArray,
    locations: [0, 1]
  )!
  ctx.drawLinearGradient(
    gradient,
    start: CGPoint(x: s * 0.5, y: s),
    end: CGPoint(x: s * 0.5, y: s * 0.38),
    options: []
  )

  let boltHeight = s * (size <= 32 ? 0.50 : 0.44)
  let boltWidth = boltHeight * 0.58
  let cx = s * 0.50
  let cy = s * 0.51
  let top = cy + boltHeight / 2
  let bottom = cy - boltHeight / 2
  let left = cx - boltWidth / 2
  let right = cx + boltWidth / 2
  let midY = cy + boltHeight * 0.04
  let notch = boltWidth * 0.18

  let bp = NSBezierPath()
  bp.move(to: CGPoint(x: cx + boltWidth * 0.10, y: top))
  bp.line(to: CGPoint(x: cx - notch * 0.4, y: midY + boltHeight * 0.07))
  bp.line(to: CGPoint(x: right - s * 0.01, y: midY + boltHeight * 0.07))
  bp.line(to: CGPoint(x: cx - boltWidth * 0.08, y: bottom))
  bp.line(to: CGPoint(x: cx + notch * 0.5, y: midY - boltHeight * 0.01))
  bp.line(to: CGPoint(x: left + s * 0.01, y: midY - boltHeight * 0.01))
  bp.close()
  bp.lineJoinStyle = .round
  bp.lineCapStyle = .round

  NSColor(srgbRed: 244 / 255, green: 243 / 255, blue: 239 / 255, alpha: 1).setFill()
  bp.fill()

  NSGraphicsContext.restoreGraphicsState()
  return rep
}

let outDir = URL(fileURLWithPath: "/tmp/fc-icon.iconset")
try? FileManager.default.removeItem(at: outDir)
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

let sizes: [(String, Int)] = [
  ("icon_16x16.png", 16),
  ("icon_16x16@2x.png", 32),
  ("icon_32x32.png", 32),
  ("icon_32x32@2x.png", 64),
  ("icon_128x128.png", 128),
  ("icon_128x128@2x.png", 256),
  ("icon_256x256.png", 256),
  ("icon_256x256@2x.png", 512),
  ("icon_512x512.png", 512),
  ("icon_512x512@2x.png", 1024),
]

for (name, px) in sizes {
  let data = render(size: px).representation(using: .png, properties: [:])!
  try data.write(to: outDir.appendingPathComponent(name))
}

let master = render(size: 1024).representation(using: .png, properties: [:])!
try master.write(to: URL(fileURLWithPath: "/tmp/fc-icon-rgba.png"))
print("rendered")
