import { cpSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const publicOCRDir = path.join(root, 'public', 'ocr')
const publicLangDir = path.join(publicOCRDir, 'lang')

const copyPairs = [
  {
    from: path.join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'),
    to: path.join(publicOCRDir, 'worker.min.js'),
  },
  {
    from: path.join(root, 'node_modules', 'tesseract.js-core', 'tesseract-core-lstm.wasm.js'),
    to: path.join(publicOCRDir, 'tesseract-core-lstm.wasm.js'),
  },
  {
    from: path.join(root, 'node_modules', 'tesseract.js-core', 'tesseract-core-lstm.wasm'),
    to: path.join(publicOCRDir, 'tesseract-core-lstm.wasm'),
  },
  {
    from: path.join(root, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'),
    to: path.join(publicLangDir, 'eng.traineddata.gz'),
  },
  {
    from: path.join(root, 'node_modules', '@tesseract.js-data', 'chi_sim', '4.0.0_best_int', 'chi_sim.traineddata.gz'),
    to: path.join(publicLangDir, 'chi_sim.traineddata.gz'),
  },
  {
    from: path.join(root, 'node_modules', '@tesseract.js-data', 'chi_tra', '4.0.0_best_int', 'chi_tra.traineddata.gz'),
    to: path.join(publicLangDir, 'chi_tra.traineddata.gz'),
  },
]

mkdirSync(publicLangDir, { recursive: true })

for (const pair of copyPairs) {
  if (!existsSync(pair.from)) {
    throw new Error(`Missing OCR asset: ${pair.from}`)
  }
  cpSync(pair.from, pair.to)
}

console.log(`Prepared OCR assets in ${path.relative(root, publicOCRDir)}`)
