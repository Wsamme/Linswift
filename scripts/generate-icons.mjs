import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const projectRoot = process.cwd()
const sourceLogoSvg = path.join(projectRoot, 'src', 'assets', 'brand-logo.svg')
const sourceLogoPng = path.join(projectRoot, 'src', 'assets', 'brand-logo.png')
const sourceLogoAsset = fs.existsSync(sourceLogoSvg) ? sourceLogoSvg : sourceLogoPng
const sourceIsSvg = sourceLogoAsset.endsWith('.svg')
const brandingDir = path.join(projectRoot, 'branding')
const publicDir = path.join(projectRoot, 'public')
const buildDir = path.join(projectRoot, 'build')
const extensionIconsDir = path.join(projectRoot, 'chrome-extension', 'icons')
const favicon = path.join(publicDir, 'favicon.png')
const publicLogo = path.join(publicDir, 'logo-cutout.png')
const pwa192 = path.join(publicDir, 'pwa-192x192.png')
const pwa512 = path.join(publicDir, 'pwa-512x512.png')
const buildIcon = path.join(buildDir, 'icon.png')
const buildIcns = path.join(buildDir, 'icon.icns')
const brandingFavicon = path.join(brandingDir, 'favicon.png')
const brandingPwa192 = path.join(brandingDir, 'pwa-192x192.png')
const brandingPwa512 = path.join(brandingDir, 'pwa-512x512.png')
const brandingIcns = path.join(brandingDir, 'icon.icns')
const iconsetDir = path.join(buildDir, 'icon.iconset')
const extensionIcon16 = path.join(extensionIconsDir, 'icon-16.png')
const extensionIcon32 = path.join(extensionIconsDir, 'icon-32.png')
const extensionIcon48 = path.join(extensionIconsDir, 'icon-48.png')
const extensionIcon128 = path.join(extensionIconsDir, 'icon-128.png')

function commandExists(command) {
  try {
    execFileSync('which', [command], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

fs.mkdirSync(publicDir, { recursive: true })
fs.mkdirSync(buildDir, { recursive: true })
fs.mkdirSync(brandingDir, { recursive: true })
fs.mkdirSync(extensionIconsDir, { recursive: true })

if (!fs.existsSync(sourceLogoAsset)) {
  throw new Error(`Missing brand logo source: ${sourceLogoAsset}`)
}

const canRasterizeSvg = !sourceIsSvg || commandExists('rsvg-convert')

function resizePng(size, outputPath) {
  execFileSync('sips', ['-z', String(size), String(size), sourceLogoPng, '--out', outputPath], {
    stdio: 'ignore',
  })
}

function rasterizeSvg(size, outputPath) {
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', outputPath, sourceLogoSvg], {
    stdio: 'ignore',
  })
}

function renderSquare(size, outputPath) {
  if (sourceIsSvg) {
    rasterizeSvg(size, outputPath)
    return
  }
  resizePng(size, outputPath)
}

function seedPrebuiltRasterAssets() {
  const requiredPrebuiltAssets = [
    [favicon, brandingFavicon],
    [pwa192, brandingPwa192],
    [pwa512, brandingPwa512],
  ]

  const missing = requiredPrebuiltAssets
    .map(([existingSource]) => existingSource)
    .filter((existingSource) => !fs.existsSync(existingSource))

  if (missing.length > 0) {
    throw new Error(
      `Missing prebuilt raster assets for ${sourceLogoSvg}: ${missing.join(', ')}`
    )
  }

  requiredPrebuiltAssets.forEach(([existingSource, targetPath]) => {
    fs.copyFileSync(existingSource, targetPath)
  })

  ;[extensionIcon16, extensionIcon32, extensionIcon48, extensionIcon128].forEach((iconPath) => {
    if (!fs.existsSync(iconPath)) {
      fs.copyFileSync(brandingPwa512, iconPath)
    }
  })
}

const canGenerateMacIcons = process.platform === 'darwin'

if (canRasterizeSvg) {
  renderSquare(256, brandingFavicon)
  renderSquare(192, brandingPwa192)
  renderSquare(512, brandingPwa512)
  renderSquare(16, extensionIcon16)
  renderSquare(32, extensionIcon32)
  renderSquare(48, extensionIcon48)
  renderSquare(128, extensionIcon128)
} else {
  seedPrebuiltRasterAssets()
}

if (canGenerateMacIcons && canRasterizeSvg) {
  fs.rmSync(iconsetDir, { recursive: true, force: true })
  fs.mkdirSync(iconsetDir, { recursive: true })

  const iconsetSizes = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png'],
  ]

  for (const [size, fileName] of iconsetSizes) {
    renderSquare(size, path.join(iconsetDir, fileName))
  }

  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', brandingIcns], {
    stdio: 'ignore',
  })
}

if (!fs.existsSync(brandingFavicon) || !fs.existsSync(brandingPwa192) || !fs.existsSync(brandingPwa512)) {
  throw new Error('Missing rasterized brand assets in branding/.')
}

fs.copyFileSync(brandingPwa512, publicLogo)
fs.copyFileSync(brandingFavicon, favicon)
fs.copyFileSync(brandingPwa192, pwa192)
fs.copyFileSync(brandingPwa512, pwa512)
fs.copyFileSync(brandingPwa512, buildIcon)

if (fs.existsSync(brandingIcns)) {
  fs.copyFileSync(brandingIcns, buildIcns)
}

console.log('Synced brand logo assets to public/ and build/.')
