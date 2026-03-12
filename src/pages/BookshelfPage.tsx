import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Upload, Clock, Search, MoreVertical, Loader2, Trash2,
  BookOpen,
} from 'lucide-react'
import { supabase, uploadFile, type UserBook } from '../lib/supabase'
import { extractTextFromPDF, getPDFMetadata, sanitizeText } from '../lib/pdf'
import { useAuth } from '../contexts/AuthContext'
import { SAMPLE_BOOKS } from '../data/sampleBooks'

/**
 * 书架页 —— 阅读器模块入口（V3：支持 OCR 导入 + PDF 阅读器）
 *
 * 功能：
 *   1. 从文件选择器导入 PDF（标准 + OCR 扫描版）
 *   2. 自动检测扫描版 PDF → OCR 提取文本
 *   3. 上传 PDF 到 Supabase Storage
 *   4. 保存书籍元数据 + 提取文本到数据库
 *   5. 展示真实书籍列表（来自数据库）
 *   6. 点击书籍 → PDF 阅读器（有 PDF 文件）或阅读准备页
 *   7. 直接打开 PDF 文件阅读入口
 */

// 封面 emoji 随机池
const COVER_EMOJIS = ['📘', '📗', '📙', '📕', '📒', '📓', '📔', '📚']

export default function BookshelfPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ===== 状态 =====
  const [books, setBooks] = useState<UserBook[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // ===== 加载用户书架 =====
  const fetchBooks = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('user_books')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (!error && data) {
      setBooks(data)
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchBooks()
  }, [fetchBooks])

  // ===== 合并“示例书籍” + 用户真实书架 =====
  // 示例书籍用于演示阅读器，不依赖数据库
  const allBooks = [...SAMPLE_BOOKS, ...books]

  // ===== 搜索过滤 =====
  const filteredBooks = allBooks.filter(b =>
    b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.author || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  // ===== 最近阅读（有进度的书，按更新时间排序） =====
  const recentReads = books
    .filter(b => b.progress > 0)
    .slice(0, 5)

  // ===== 导入 PDF（支持自动检测扫描版 + OCR） =====
  const handleImportPDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    // 验证文件类型
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('请选择 PDF 文件')
      return
    }

    // 限制文件大小（50MB）
    if (file.size > 50 * 1024 * 1024) {
      alert('文件大小不能超过 50MB')
      return
    }

    setImporting(true)
    try {
      // 第 1 步：提取 PDF 元数据
      setImportStatus('正在读取 PDF 信息...')
      let meta
      try {
        meta = await getPDFMetadata(file)
      } catch {
        // 元数据读取失败时，仍允许继续导入
        meta = {
          title: file.name.replace(/\.pdf$/i, ''),
          author: '未知作者',
          numPages: 0,
          fileSize: file.size,
        }
      }

      // 第 2 步：提取文本（快速模式，超时自动跳过，避免“长期加载”）
      let fullText = ''
      try {
        setImportStatus(`正在提取文本（共 ${meta.numPages} 页）...`)
        const textTask = extractTextFromPDF(file)
        const timeoutTask = new Promise<string>((resolve) =>
          setTimeout(() => resolve(''), 12000)
        )
        fullText = await Promise.race([textTask, timeoutTask])
      } catch {
        // 文本提取失败时不阻塞导入，后续可在阅读器里 OCR
        fullText = ''
      }

      // 第 4 步：上传 PDF 到 Supabase Storage
      setImportStatus('正在上传文件...')
      // 文件名做安全清洗，避免特殊字符导致 storage 路径异常
      const safeName = file.name
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `${user.id}/${Date.now()}_${safeName}`
      let storedFilePath = ''
      try {
        const uploadTask = uploadFile('books', filePath, file)
        const uploadTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('PDF 上传超时，请检查网络或稍后重试')), 45000)
        )
        await Promise.race([uploadTask, uploadTimeout])
        // 存路径而非 URL，后续在阅读器里用签名 URL 读取，更稳定也兼容私有桶
        storedFilePath = `books:${filePath}`
      } catch (e: any) {
        // 强约束：必须成功上传 PDF 文件，才允许入库
        const detail = String(e?.message || '')
        if (detail.includes('not found') || detail.includes('Bucket')) {
          throw new Error('PDF 存储桶 books 不存在，请先在 Supabase Storage 创建 books 桶')
        }
        if (detail.includes('row-level security') || detail.includes('policy') || detail.includes('Unauthorized')) {
          throw new Error('PDF 上传权限不足（Storage RLS），请在 Supabase 配置 books 桶的上传策略')
        }
        if (detail.includes('Payload too large') || detail.includes('413')) {
          throw new Error('PDF 文件过大，超出 Supabase 上传限制')
        }
        throw new Error(`PDF 上传失败：${detail || '未知错误'}`)
      }

      // 到这里表示 PDF 本体已成功上传；文本提取是否成功不影响文件阅读

      // 第 5 步：保存到数据库（对所有用户输入做 sanitize，防止无效 Unicode 导致入库失败）
      setImportStatus('正在保存书籍...')
      const randomEmoji = COVER_EMOJIS[Math.floor(Math.random() * COVER_EMOJIS.length)]
      const safeTitle = sanitizeText(meta.title) || file.name.replace(/\.pdf$/i, '')
      const safeAuthor = sanitizeText(meta.author) || '未知作者'
      const safeText = sanitizeText(fullText).slice(0, 500000)
      const { error } = await supabase.from('user_books').insert({
        user_id: user.id,
        title: safeTitle,
        author: safeAuthor,
        cover_emoji: randomEmoji,
        file_path: storedFilePath,
        content_text: safeText,
        total_pages: meta.numPages,
        current_page: 0,
        progress: 0,
        unfamiliar_words_count: 0,
      })

      if (error) {
        throw new Error(error.message)
      }

      // 成功！刷新书架（非阻塞，避免卡在刷新阶段导致“一直加载”）
      setImportStatus(fullText ? '导入成功！' : '导入成功（可在阅读器里 OCR）')
      fetchBooks().catch(() => {})
    } catch (err: any) {
      alert(`导入失败: ${err.message || '未知错误'}`)
    } finally {
      setImporting(false)
      setImportStatus('')
      // 清空 input，允许再次选择同一文件
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ===== 删除书籍 =====
  const handleDeleteBook = async (bookId: number) => {
    if (!confirm('确认删除这本书？')) return
    await supabase.from('user_books').delete().eq('id', bookId)
    setBooks(prev => prev.filter(b => b.id !== bookId))
  }

  return (
    <div className="h-full min-h-screen bg-[var(--color-background)] overflow-y-auto">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">书架</h1>
        <button className="p-1">
          <MoreVertical size={20} className="text-[var(--color-muted)]" />
        </button>
      </div>

      {/* ===== 搜索栏 ===== */}
      <div className="px-5 mb-4">
        <div className="flex items-center gap-3 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] px-4 py-2.5">
          <Search size={18} className="text-[var(--color-muted)] shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索书籍..."
            className="flex-1 bg-transparent text-[14px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-light)] outline-none"
          />
        </div>
      </div>

      {/* ===== 导入 PDF 按钮 ===== */}
      <div className="px-5 mb-4">
        {/* 隐藏的文件选择器 */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleImportPDF}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="w-full flex items-center justify-center gap-2 py-3.5 border-2 border-dashed border-[var(--color-primary)]/30 rounded-[var(--radius-md)] text-[var(--color-primary)] active:bg-[var(--color-primary-light)] transition-colors disabled:opacity-50"
        >
          {importing ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span className="text-[14px] font-semibold">{importStatus || '正在导入...'}</span>
            </>
          ) : (
            <>
              <Upload size={18} />
              <span className="text-[14px] font-semibold">导入 PDF 书籍</span>
            </>
          )}
        </button>
      </div>

      {/* ===== 直接打开 PDF 阅读器 ===== */}
      <div className="px-5 mb-5">
        <button
          onClick={() => navigate('/pdf-reader')}
          className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--color-card)] rounded-[var(--radius-sm)] text-[var(--color-foreground)] active:bg-[var(--color-background-secondary)] transition-colors"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <BookOpen size={16} className="text-[var(--color-primary)]" />
          <span className="text-[13px] font-medium">直接打开 PDF 阅读器</span>
          <span className="text-[10px] text-[var(--color-muted)] ml-1">支持 OCR 扫描版</span>
        </button>
      </div>

      {/* ===== 最近阅读 ===== */}
      {recentReads.length > 0 && (
        <div className="px-5 mb-5">
          <h3 className="text-[16px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">最近阅读</h3>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5">
            {recentReads.map((book) => (
              <div
                key={book.id}
                className="shrink-0 w-[220px] p-3.5 bg-[var(--color-card)] rounded-[var(--radius-md)] cursor-pointer active:scale-[0.98] transition-transform"
                style={{ boxShadow: 'var(--shadow-card)' }}
                onClick={() => navigate(book.file_path ? `/pdf-reader?bookId=${book.id}` : `/reading-prep?bookId=${book.id}`)}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={14} className="text-[var(--color-muted)]" />
                  <span className="text-[11px] text-[var(--color-muted)]">
                    {new Date(book.updated_at).toLocaleDateString('zh-CN')}
                  </span>
                </div>
                <p className="text-[14px] font-semibold text-[var(--color-foreground)] line-clamp-1">{book.title}</p>
                <p className="text-[12px] text-[var(--color-muted)] mt-0.5">{book.author}</p>
                {/* 进度条 */}
                <div className="mt-2 h-1.5 bg-[var(--color-background-secondary)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${book.progress}%`,
                      backgroundColor: book.progress === 100 ? '#22C55E' : '#FF8400',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== 书架网格 ===== */}
      <div className="px-5 pb-8">
        <h3 className="text-[16px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">
          全部书籍 {allBooks.length > 0 && `(${allBooks.length})`}
        </h3>

        {/* 加载中 */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="text-[var(--color-primary)] animate-spin" />
          </div>
        )}

        {/* 空状态 */}
        {!loading && allBooks.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[48px] mb-3">📚</p>
            <p className="text-[14px] text-[var(--color-muted)]">书架还是空的</p>
            <p className="text-[12px] text-[var(--color-muted-light)] mt-1">点击上方按钮导入你的第一本 PDF 书籍</p>
          </div>
        )}

        {/* 书籍网格 */}
        {!loading && filteredBooks.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {filteredBooks.map((book) => (
              <div
                key={book.id}
                className="flex flex-col items-center cursor-pointer active:scale-[0.96] transition-transform relative group"
                onClick={() => navigate(book.file_path ? `/pdf-reader?bookId=${book.id}` : `/reading-prep?bookId=${book.id}`)}
              >
                {/* 封面 */}
                <div
                  className="w-full aspect-[3/4] rounded-[var(--radius-sm)] bg-[var(--color-primary-light)] flex items-center justify-center mb-2 relative overflow-hidden"
                  style={{ boxShadow: 'var(--shadow-card)' }}
                >
                  <span className="text-[36px]">{book.cover_emoji}</span>
                  {/* 进度指示 */}
                  {book.progress > 0 && book.progress < 100 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--color-background-secondary)]">
                      <div className="h-full bg-[var(--color-primary)]" style={{ width: `${book.progress}%` }} />
                    </div>
                  )}
                  {book.progress === 100 && (
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-[var(--color-success)] rounded text-[9px] text-white font-bold">
                      已读完
                    </div>
                  )}
                  {/* 页数 */}
                  {book.total_pages && (
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/30 rounded text-[9px] text-white">
                      {book.total_pages}页
                    </div>
                  )}
                </div>
                {/* 信息 */}
                <p className="text-[12px] font-medium text-[var(--color-foreground)] text-center line-clamp-1 w-full">{book.title}</p>
                <p className="text-[10px] text-[var(--color-muted)] text-center line-clamp-1 w-full">{book.author}</p>
                {/* 删除按钮（仅真实书籍允许删除；示例书籍不显示删除） */}
                {book.id > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteBook(book.id) }}
                    className="absolute top-1 right-1 p-1 bg-white/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={12} className="text-[var(--color-error)]" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
