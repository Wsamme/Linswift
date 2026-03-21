;(() => {
  if (window.__LINSWIFT_YOUTUBE_PAGE_BRIDGE__) return
  window.__LINSWIFT_YOUTUBE_PAGE_BRIDGE__ = true

  const REQUEST_SOURCE = 'linswift-content-script'
  const REQUEST_TYPE = 'linswift-youtube-page-request'
  const RESPONSE_SOURCE = 'linswift-youtube-page-bridge'
  const RESPONSE_TYPE = 'linswift-youtube-page-response'
  const DEFAULT_CUE_DURATION_MS = 2600

  function postResponse(requestId, ok, payload = null, error = '') {
    window.postMessage(
      {
        source: RESPONSE_SOURCE,
        type: RESPONSE_TYPE,
        requestId,
        ok,
        payload,
        error,
      },
      window.location.origin
    )
  }

  function cloneJson(value) {
    if (!value || typeof value !== 'object') return null
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return null
    }
  }

  function getConfigValue(key) {
    try {
      return window.ytcfg?.get?.(key) ?? window.ytcfg?.data_?.[key] ?? null
    } catch {
      return null
    }
  }

  function getPlayerResponse() {
    const rawPlayerResponse =
      window.ytInitialPlayerResponse ||
      window.ytplayer?.config?.args?.raw_player_response ||
      window.ytplayer?.config?.args?.player_response ||
      null

    if (!rawPlayerResponse) return null
    if (typeof rawPlayerResponse === 'string') {
      try {
        return JSON.parse(rawPlayerResponse)
      } catch {
        return null
      }
    }

    return rawPlayerResponse
  }

  function walkObjects(root, visit) {
    if (!root || typeof root !== 'object') return

    const stack = [root]
    const seen = new WeakSet()

    while (stack.length > 0) {
      const current = stack.pop()
      if (!current || typeof current !== 'object') continue
      if (seen.has(current)) continue
      seen.add(current)
      visit(current)

      if (Array.isArray(current)) {
        for (let index = current.length - 1; index >= 0; index -= 1) {
          stack.push(current[index])
        }
        continue
      }

      const values = Object.values(current)
      for (let index = values.length - 1; index >= 0; index -= 1) {
        stack.push(values[index])
      }
    }
  }

  function findNestedObject(root, predicate) {
    let matched = null
    walkObjects(root, (value) => {
      if (!matched && predicate(value)) {
        matched = value
      }
    })
    return matched
  }

  function collectNestedObjects(root, selector) {
    const matches = []
    walkObjects(root, (value) => {
      const selected = selector(value)
      if (selected) {
        matches.push(selected)
      }
    })
    return matches
  }

  function readText(value) {
    if (!value) return ''
    if (typeof value === 'string') {
      return value.replace(/\s+/g, ' ').trim()
    }
    if (typeof value.simpleText === 'string') {
      return value.simpleText.replace(/\s+/g, ' ').trim()
    }
    if (Array.isArray(value.runs)) {
      return value.runs
        .map((item) => String(item?.text || ''))
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
    }
    return ''
  }

  function buildTrackKey(track) {
    if (!track) return ''
    return [
      String(track.vssId || '').trim(),
      String(track.languageCode || '').trim(),
      String(track.kind || '').trim(),
    ]
      .filter(Boolean)
      .join('::')
  }

  function chooseTrack(tracklist) {
    const tracks = Array.isArray(tracklist?.captionTracks) ? tracklist.captionTracks : []
    if (tracks.length === 0) return null

    const scoreTrack = (track) => {
      const languageCode = String(track?.languageCode || '').toLowerCase()
      const vssId = String(track?.vssId || '').toLowerCase()
      const kind = String(track?.kind || '').toLowerCase()
      let score = 0

      if (!kind || kind !== 'asr') score += 3
      if (languageCode.startsWith('en')) score += 5
      if (vssId.includes('.en')) score += 3
      if (track?.isTranslatable) score += 1

      return score
    }

    return tracks
      .slice()
      .sort((left, right) => scoreTrack(right) - scoreTrack(left))[0]
  }

  function normalizeCues(cues) {
    const normalized = Array.isArray(cues)
      ? cues
          .map((cue) => {
            const text = String(cue?.text || '')
              .replace(/\s+/g, ' ')
              .trim()
            if (!text) return null

            const lines = Array.isArray(cue?.lines)
              ? cue.lines
                  .map((line) => String(line || '').replace(/\s+/g, ' ').trim())
                  .filter(Boolean)
              : [text]
            const startMs = Math.max(0, Math.round(Number(cue?.startMs || 0)))
            const rawEndMs = Math.max(0, Math.round(Number(cue?.endMs || 0)))
            const rawDurationMs = Math.max(0, Math.round(Number(cue?.durationMs || 0)))
            const endMs = rawEndMs > startMs ? rawEndMs : startMs + rawDurationMs

            return {
              text,
              lines: lines.length > 0 ? lines : [text],
              startMs,
              endMs,
              durationMs: Math.max(0, endMs - startMs),
            }
          })
          .filter(Boolean)
      : []

    normalized.sort((left, right) => left.startMs - right.startMs)

    const deduped = []
    const seen = new Set()

    normalized.forEach((cue, index) => {
      const nextCue = normalized[index + 1] || null
      let endMs = cue.endMs

      if (endMs <= cue.startMs) {
        const nextStartMs = Number(nextCue?.startMs || 0)
        const fallbackDurationMs =
          nextStartMs > cue.startMs
            ? Math.max(900, nextStartMs - cue.startMs - 40)
            : Math.max(
                1800,
                Math.min(
                  5200,
                  Math.round(cue.text.split(/\s+/).filter(Boolean).length * 420)
                )
              )
        endMs = cue.startMs + fallbackDurationMs
      }

      const key = `${cue.startMs}::${cue.text}`
      if (seen.has(key)) return
      seen.add(key)
      deduped.push({
        ...cue,
        endMs,
        durationMs: Math.max(DEFAULT_CUE_DURATION_MS, Math.round(endMs - cue.startMs)),
      })
    })

    return deduped
  }

  function parseCaptionPayload(payload) {
    const events = Array.isArray(payload?.events) ? payload.events : []
    return normalizeCues(
      events
        .map((event) => {
          const lines = Array.isArray(event?.segs)
            ? event.segs
                .map((segment) => String(segment?.utf8 || '').replace(/\u200b/g, '').trim())
                .join('')
                .split('\n')
                .map((line) => line.replace(/\s+/g, ' ').trim())
                .filter(Boolean)
            : []
          const text = lines.join(' ').trim()
          if (!text) return null
          const startMs = Number(event?.tStartMs || 0)
          const durationMs = Number(event?.dDurationMs || 0)
          return {
            text,
            lines,
            startMs,
            durationMs,
            endMs: startMs + durationMs,
          }
        })
        .filter(Boolean)
    )
  }

  function parseTranscriptPayload(payload) {
    const renderers = collectNestedObjects(
      payload,
      (value) => value?.transcriptSegmentRenderer || null
    )

    return normalizeCues(
      renderers
        .map((renderer) => {
          const text = readText(renderer.snippet || renderer.content)
          if (!text) return null

          const startMs = Number(
            renderer.startMs ||
              renderer.startTimeMs ||
              renderer.startTimeMsec ||
              renderer.startTimeMilliseconds ||
              0
          )
          const endMs = Number(
            renderer.endMs ||
              renderer.endTimeMs ||
              renderer.endTimeMsec ||
              renderer.endTimeMilliseconds ||
              0
          )

          return {
            text,
            lines: [text],
            startMs,
            endMs,
            durationMs: Math.max(0, endMs - startMs),
          }
        })
        .filter(Boolean)
    )
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return response.json()
  }

  async function fetchTranscriptFromTrack() {
    const playerResponse = getPlayerResponse()
    const tracklist = playerResponse?.captions?.playerCaptionsTracklistRenderer || null
    const selectedTrack = chooseTrack(tracklist)
    if (!selectedTrack?.baseUrl) return null

    const url = new URL(selectedTrack.baseUrl, window.location.origin)
    if (!url.searchParams.has('fmt')) {
      url.searchParams.set('fmt', 'json3')
    }

    const payload = await fetchJson(url.toString())
    const cues = parseCaptionPayload(payload)
    if (cues.length === 0) return null

    return {
      cues,
      trackKey: buildTrackKey(selectedTrack),
      languageCode: String(selectedTrack.languageCode || '').trim(),
      provider: '页面字幕轨',
    }
  }

  function getTranscriptEndpoint() {
    const roots = [
      window.ytInitialData,
      document.querySelector('ytd-watch-flexy')?.data,
      document.querySelector('ytd-app')?.data,
    ]

    for (const root of roots) {
      const matched = findNestedObject(
        root,
        (value) => Boolean(value?.getTranscriptEndpoint?.params)
      )
      if (matched?.getTranscriptEndpoint?.params) {
        return matched.getTranscriptEndpoint
      }
    }

    return null
  }

  function buildTranscriptContext() {
    const context = cloneJson(getConfigValue('INNERTUBE_CONTEXT')) || { client: {} }
    context.client = { ...(context.client || {}) }
    context.request = { ...(context.request || {}), useSsl: true }

    if (!context.client.clientName) {
      context.client.clientName = getConfigValue('INNERTUBE_CLIENT_NAME') || 'WEB'
    }
    if (!context.client.clientVersion) {
      context.client.clientVersion = getConfigValue('INNERTUBE_CLIENT_VERSION') || ''
    }
    if (!context.client.hl) {
      context.client.hl = getConfigValue('HL') || document.documentElement.lang || 'en'
    }
    if (!context.client.gl) {
      context.client.gl = getConfigValue('GL') || 'US'
    }
    if (!context.client.visitorData) {
      context.client.visitorData = getConfigValue('VISITOR_DATA') || ''
    }
    if (typeof context.client.utcOffsetMinutes !== 'number') {
      context.client.utcOffsetMinutes = -new Date().getTimezoneOffset()
    }
    if (!context.client.originalUrl) {
      context.client.originalUrl = window.location.href
    }

    return context
  }

  async function requestTranscriptWithParams(params) {
    const apiKey = String(getConfigValue('INNERTUBE_API_KEY') || '').trim()
    if (!apiKey || !params) {
      throw new Error('missing transcript api params')
    }

    const headers = {
      'content-type': 'application/json',
    }
    const visitorData = String(getConfigValue('VISITOR_DATA') || '').trim()
    const clientNameHeader = String(getConfigValue('INNERTUBE_CONTEXT_CLIENT_NAME') || '').trim()
    const clientVersionHeader = String(
      getConfigValue('INNERTUBE_CONTEXT_CLIENT_VERSION') ||
        getConfigValue('INNERTUBE_CLIENT_VERSION') ||
        ''
    ).trim()

    if (visitorData) {
      headers['x-goog-visitor-id'] = visitorData
    }
    if (clientNameHeader) {
      headers['x-youtube-client-name'] = clientNameHeader
    }
    if (clientVersionHeader) {
      headers['x-youtube-client-version'] = clientVersionHeader
    }

    headers['x-youtube-bootstrap-logged-in'] = getConfigValue('LOGGED_IN') ? 'true' : 'false'

    return fetchJson(
      `${window.location.origin}/youtubei/v1/get_transcript?prettyPrint=false&key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          context: buildTranscriptContext(),
          params,
        }),
      }
    )
  }

  async function fetchTranscriptFromEndpoint() {
    const endpoint = getTranscriptEndpoint()
    if (!endpoint?.params) return null

    const playerResponse = getPlayerResponse()
    const selectedTrack = chooseTrack(playerResponse?.captions?.playerCaptionsTracklistRenderer || null)
    const candidateParams = [String(endpoint.params || '').trim()]

    try {
      const decoded = decodeURIComponent(candidateParams[0])
      if (decoded && decoded !== candidateParams[0]) {
        candidateParams.push(decoded)
      }
    } catch {}

    let lastError = null

    for (const params of candidateParams.filter(Boolean)) {
      try {
        const payload = await requestTranscriptWithParams(params)
        const cues = parseTranscriptPayload(payload)
        if (cues.length === 0) continue

        return {
          cues,
          trackKey:
            buildTrackKey(selectedTrack) ||
            `page-transcript::${window.location.pathname}`,
          languageCode: String(selectedTrack?.languageCode || '').trim(),
          provider: '页面 transcript',
        }
      } catch (error) {
        lastError = error
      }
    }

    if (lastError) {
      throw lastError
    }

    return null
  }

  async function fetchYouTubeTranscript() {
    const transcriptResult = await fetchTranscriptFromEndpoint().catch(() => null)
    if (transcriptResult?.cues?.length) {
      return transcriptResult
    }

    const trackResult = await fetchTranscriptFromTrack().catch(() => null)
    if (trackResult?.cues?.length) {
      return trackResult
    }

    return {
      cues: [],
      trackKey: '',
      languageCode: '',
      provider: '',
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return

    const data = event.data
    if (data?.source !== REQUEST_SOURCE || data?.type !== REQUEST_TYPE) {
      return
    }

    const requestId = String(data.requestId || '').trim()
    if (!requestId) return

    if (data.action !== 'get-transcript') {
      postResponse(requestId, false, null, 'unsupported youtube bridge action')
      return
    }

    fetchYouTubeTranscript()
      .then((payload) => {
        postResponse(requestId, true, payload)
      })
      .catch((error) => {
        postResponse(
          requestId,
          false,
          null,
          error instanceof Error ? error.message : 'unknown youtube bridge error'
        )
      })
  })
})()
