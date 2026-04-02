import { describe, it, expect, vi } from 'vitest'

// Mock pdfjs-dist to avoid DOMMatrix error in jsdom
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }))

import {
  OCRServiceError,
  type OCRStage,
  type OCRProgressUpdate,
  type OverlayModel,
} from './ocr'

describe('ocr', () => {
  describe('OCRServiceError', () => {
    it('creates error with default values', () => {
      const err = new OCRServiceError('test error')
      expect(err.message).toBe('test error')
      expect(err.stage).toBe('error')
      expect(err.code).toBe('ocr_failed')
      expect(err.name).toBe('OCRServiceError')
      expect(err instanceof Error).toBe(true)
    })

    it('creates warning with custom stage and code', () => {
      const err = new OCRServiceError('low confidence', 'warning', 'low_confidence')
      expect(err.stage).toBe('warning')
      expect(err.code).toBe('low_confidence')
    })
  })

  describe('OCRStage type', () => {
    it('accepts all valid stage values', () => {
      const stages: OCRStage[] = [
        'idle', 'initializing-worker', 'loading-language-data',
        'rendering-page', 'recognizing', 'completed', 'warning', 'error',
      ]
      expect(stages).toHaveLength(8)
    })
  })

  describe('type contracts', () => {
    it('OCRProgressUpdate has expected shape', () => {
      const update: OCRProgressUpdate = {
        stage: 'recognizing',
        statusText: 'Processing page 1',
        progress: 50,
        page: 1,
        totalPages: 3,
      }
      expect(update.stage).toBe('recognizing')
      expect(update.progress).toBe(50)
    })

    it('OverlayModel has expected fields', () => {
      const model: OverlayModel = {
        words: [],
        coverBoxes: [],
        lines: [],
        regions: [],
        translationRegions: [],
        imageWidth: 800,
        imageHeight: 600,
      }
      expect(model.imageWidth).toBe(800)
      expect(model.words).toEqual([])
    })
  })
})
