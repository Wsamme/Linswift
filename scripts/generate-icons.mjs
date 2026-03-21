import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const projectRoot = process.cwd()
const sourceLogoPng = path.join(projectRoot, 'src', 'assets', 'brand-logo.png')
const brandingDir = path.join(projectRoot, 'branding')
const publicDir = path.join(projectRoot, 'public')
const buildDir = path.join(projectRoot, 'build')
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

fs.mkdirSync(publicDir, { recursive: true })
fs.mkdirSync(buildDir, { recursive: true })
fs.mkdirSync(brandingDir, { recursive: true })

if (!fs.existsSync(sourceLogoPng)) {
  throw new Error(`Missing brand logo source: ${sourceLogoPng}`)
}

function resizePng(size, outputPath) {
  execFileSync('sips', ['-z', String(size), String(size), sourceLogoPng, '--out', outputPath], {
    stdio: 'ignore',
  })
}

const canGenerateMacIcons = process.platform === 'darwin'

if (canGenerateMacIcons) {
  resizePng(256, brandingFavicon)
  resizePng(192, brandingPwa192)
  resizePng(512, brandingPwa512)

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
    resizePng(size, path.join(iconsetDir, fileName))
  }

  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', brandingIcns], {
    stdio: 'ignore',
  })
}

if (!fs.existsSync(brandingFavicon) || !fs.existsSync(brandingPwa192) || !fs.existsSync(brandingPwa512)) {
  throw new Error('Missing rasterized brand assets in branding/.')
}

fs.copyFileSync(sourceLogoPng, publicLogo)
fs.copyFileSync(brandingFavicon, favicon)
fs.copyFileSync(brandingPwa192, pwa192)
fs.copyFileSync(brandingPwa512, pwa512)
fs.copyFileSync(brandingPwa512, buildIcon)

if (fs.existsSync(brandingIcns)) {
  fs.copyFileSync(brandingIcns, buildIcns)
}

console.log('Synced brand logo assets to public/ and build/.')
