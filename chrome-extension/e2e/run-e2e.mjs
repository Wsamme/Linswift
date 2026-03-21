import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const extensionPath = '/Users/wangzhijie/Documents/GitHub/DeepL/Linswift/chrome-extension'
const articlePath = '/Users/wangzhijie/Documents/GitHub/DeepL/Linswift/chrome-extension/e2e/article.html'

async function serveFixture() {
  const html = await fs.readFile(articlePath, 'utf8')

  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      if (request.url === '/article.html') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        response.end(html)
        return
      }

      response.writeHead(404)
      response.end('not found')
    })

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/article.html`,
      })
    })
  })
}

const { server, url } = await serveFixture()
const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'linswift-ext-e2e-'))
const browserExecutable = process.env.LINSWIFT_E2E_BROWSER === 'system-chrome'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : chromium.executablePath()

let context

try {
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: browserExecutable,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  })

  const articlePage = await context.newPage()
  articlePage.on('console', (message) => {
    console.log(`[page:${message.type()}] ${message.text()}`)
  })
  articlePage.on('pageerror', (error) => {
    console.log(`[pageerror] ${error.message}`)
  })
  await articlePage.goto(url, { waitUntil: 'networkidle' })

  const panelRoot = articlePage.locator('#linswift-floating-root')
  const panel = articlePage.locator('#linswift-floating-root .linswift-panel')
  const bubble = articlePage.locator('#linswift-floating-root .linswift-bubble')
  const scanButton = articlePage.locator('#linswift-floating-root [data-scan-button]')
  const inlineToggle = articlePage.locator('#linswift-floating-root [data-inline-toggle]')
  const resultsList = articlePage.locator('#linswift-floating-root [data-results-list]')
  const savedToggle = articlePage.locator('#linswift-floating-root [data-view-saved]')
  const savedList = articlePage.locator('#linswift-floating-root [data-saved-list]')
  const minimizeButton = articlePage.locator('#linswift-floating-root .linswift-minimize')

  try {
    await panelRoot.waitFor({ state: 'visible', timeout: 15000 })
  } catch (error) {
    const diagnostics = await articlePage.evaluate(() => ({
      hasContentScriptFlag: Boolean(window.__LINSWIFT_CONTENT_SCRIPT__),
      hasRoot: Boolean(document.getElementById('linswift-floating-root')),
      rootMarkup: document.getElementById('linswift-floating-root')?.outerHTML || null,
      bodyPreview: document.body.innerText.slice(0, 200),
    }))
    console.log(JSON.stringify({ diagnostics }, null, 2))
    throw error
  }
  await panel.waitFor({ state: 'visible', timeout: 15000 })

  await articlePage.evaluate(() => {
    const paragraph = document.querySelector('p.lede')
    const textNode = paragraph?.firstChild
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      throw new Error('missing lede text node')
    }

    const rawText = textNode.textContent || ''
    const start = rawText.indexOf('meticulous')
    if (start < 0) {
      throw new Error('missing target word')
    }

    const selection = window.getSelection()
    const range = document.createRange()
    range.setStart(textNode, start)
    range.setEnd(textNode, start + 'meticulous'.length)
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }))
  })
  await articlePage.locator('.linswift-selection-highlight').first().waitFor({ timeout: 15000 })
  await articlePage.locator('.linswift-word-tooltip:not(.linswift-hidden)').waitFor({ timeout: 15000 })
  const selectionHighlightText = await articlePage.locator('.linswift-selection-highlight').first().innerText()
  const selectionTooltipText = await articlePage.locator('.linswift-word-tooltip').innerText()

  await inlineToggle.click()
  await scanButton.click()
  await resultsList.locator('.linswift-card').first().waitFor({ timeout: 15000 })
  await articlePage.locator('.linswift-inline-translation').first().waitFor({ timeout: 15000 })
  await articlePage.waitForFunction(() => {
    const cards = Array.from(document.querySelectorAll('#linswift-floating-root [data-results-list] .linswift-card'))
    return cards.some((card) => card.textContent?.includes('meticulous'))
      && cards.some((card) => card.textContent?.includes('convoluted'))
  }, { timeout: 15000 })

  const statusText = await articlePage.locator('#linswift-floating-root [data-status]').innerText()
  const scanResultsText = await resultsList.innerText()
  const inlineAnnotationCount = await articlePage.locator('.linswift-inline-annotation').count()

  await resultsList.locator('.linswift-card [data-action="locate"]').first().click()
  await articlePage.waitForTimeout(500)
  const highlightCount = await articlePage.locator('mark.linswift-word-highlight').count()

  await resultsList.locator('.linswift-card [data-action="save"]').first().click()
  await savedToggle.click()
  await savedList.locator('.linswift-card').first().waitFor({ timeout: 10000 })
  const savedCount = await savedList.locator('.linswift-card').count()
  const savedText = await savedList.innerText()

  await minimizeButton.click()
  await bubble.waitFor({ state: 'visible', timeout: 5000 })
  await bubble.click()
  await panel.waitFor({ state: 'visible', timeout: 5000 })

  const summary = {
    browserExecutable,
    pageUrl: url,
    statusText,
    selectionHighlightText,
    selectionTooltipContainsMeticulous: selectionTooltipText.toLowerCase().includes('meticulous'),
    highlightCount,
    savedCount,
    inlineAnnotationCount,
    resultsContainMeticulous: scanResultsText.includes('meticulous'),
    resultsContainConvoluted: scanResultsText.includes('convoluted'),
    savedViewText: savedText,
    minimizeRestoreWorked: await bubble.isHidden(),
  }

  console.log(JSON.stringify(summary, null, 2))
} finally {
  await context?.close()
  server.close()
}
