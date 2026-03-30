import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Upload, Clock, Search, MoreVertical, Loader2, Trash2,
  BookOpen, Download, LayoutGrid, Rows3,
} from 'lucide-react'
import { supabase, uploadFile, type UserBook } from '../lib/supabase'
import { extractTextFromPDF, generatePDFThumbnail, getPDFMetadata, sanitizeText } from '../lib/pdf'
import { useAuth } from '../contexts/AuthContext'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { CLASSIC_BOOKS, getClassicBookBySlug, type ClassicBookCatalogItem } from '../data/classicBooks'
import { resolveUserBookMetadata } from '../lib/books'
import ClassicBookCover from '../components/books/ClassicBookCover'
import { navigateSafely } from '../lib/navigation'

/**
 * 书架页 —— 阅读器模块入口（V3：PDF 阅读器）
 *
 * 功能：
 *   1. 从文件选择器导入 PDF
 *   2. 上传 PDF 到 Supabase Storage
 *   3. 保存书籍元数据 + 提取文本到数据库
 *   4. 展示真实书籍列表（来自数据库，无静态示例数据）
 *   5. 点击书籍 → PDF 阅读器（有 PDF 文件）或阅读准备页
 *   6. 直接打开 PDF 文件阅读入口
 */

// 封面 emoji 随机池
const COVER_EMOJIS = ['📘', '📗', '📙', '📕', '📒', '📓', '📔', '📚']
const CLASSIC_LIBRARY_VIEW_KEY = 'linswift_classic_library_view'

type ClassicLibraryView = 'cover' | 'list'

export default function BookshelfPage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/app/learn')
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ===== 状态 =====
  const [books, setBooks] = useState<UserBook[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [addingClassicSlug, setAddingClassicSlug] = useState<string | null>(null)
  const [classicLibraryView, setClassicLibraryView] = useState<ClassicLibraryView>(() => {
    const saved = localStorage.getItem(CLASSIC_LIBRARY_VIEW_KEY)
    return saved === 'list' ? 'list' : 'cover'
  })

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
      setBooks(data.map(resolveUserBookMetadata))
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchBooks()
  }, [fetchBooks])

  useEffect(() => {
    localStorage.setItem(CLASSIC_LIBRARY_VIEW_KEY, classicLibraryView)
  }, [classicLibraryView])

  const allBooks = books
  const classicBookMap = books.reduce<Record<string, UserBook>>((acc, book) => {
    if (book.shared_book_slug) {
      acc[book.shared_book_slug] = book
    }
    return acc
  }, {})

  // ===== 搜索过滤 =====
  const filteredBooks = allBooks.filter(b =>
    b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.author || '').toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredClassicBooks = CLASSIC_BOOKS
    .filter((book) => (
      book.title.toLowerCase().includes(searchQuery.toLowerCase())
      || book.author.toLowerCase().includes(searchQuery.toLowerCase())
    ))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // ===== 最近阅读（有进度的书，按更新时间排序） =====
  const recentReads = books
    .filter(b => b.progress > 0)
    .slice(0, 5)

  const openBook = useCallback((book: UserBook) => {
    if (book.file_path) {
      navigateSafely(navigate, `/pdf-reader?bookId=${book.id}`)
      return
    }

    navigateSafely(navigate, book.shared_book_slug ? `/reading?bookId=${book.id}` : `/reading-prep?bookId=${book.id}`)
  }, [navigate])

  const getClassicCoverBook = useCallback((book: UserBook) => {
    return getClassicBookBySlug(book.shared_book_slug)
  }, [])

  // ===== 导入 PDF =====
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

      // 第 3 步：生成封面缩略图（从 PDF 第一页截图）
      let coverData = ''
      try {
        setImportStatus('正在生成封面...')
        const thumb = await generatePDFThumbnail(file)
        if (thumb) coverData = thumb
      } catch {
        // 封面生成失败不阻塞导入
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
        cover_emoji: coverData || randomEmoji,
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
      setImportStatus('导入成功！')
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

  const handleAddClassicBook = async (classicBook: ClassicBookCatalogItem) => {
    if (!user) return

    const existingBook = classicBookMap[classicBook.slug]
    if (existingBook) {
      openBook(existingBook)
      return
    }

    setAddingClassicSlug(classicBook.slug)
    try {
      const { data, error } = await supabase
        .from('user_books')
        .insert({
          user_id: user.id,
          title: classicBook.title,
          author: classicBook.author,
          cover_emoji: classicBook.coverEmoji,
          shared_book_slug: classicBook.slug,
          file_path: null,
          content_text: null,
          total_pages: null,
          current_page: 0,
          progress: 0,
          unfamiliar_words_count: 0,
        })
        .select('*')
        .single()

      if (error || !data) {
        throw new Error(error?.message || '加入书架失败')
      }

      const nextBook = resolveUserBookMetadata(data)
      setBooks((prev) => [nextBook, ...prev])
      openBook(nextBook)
    } catch (err: any) {
      alert(`加入失败: ${err.message || '未知错误'}`)
    } finally {
      setAddingClassicSlug(null)
    }
  }

  return (
    <div className="glass-page h-full min-h-screen overflow-y-auto">
      {/* ===== Header ===== */}
      <div className="px-5 pt-5">
        <div className="glass-card rounded-[28px] px-5 py-4 flex items-center justify-between">
          <button onClick={goBack} className="p-1">
            <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
          </button>
          <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">书架</h1>
          <button className="p-1">
            <MoreVertical size={20} className="text-[var(--color-muted)]" />
          </button>
        </div>
      </div>

      {/* ===== 搜索栏 ===== */}
      <div className="px-5 mt-4">
        <div className="glass-input-shell flex items-center gap-3 px-4 py-2.5">
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
      <div className="px-5 mt-4">
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
          className="glass-card-soft glass-card-interactive w-full flex items-center justify-center gap-2 rounded-[24px] border border-dashed border-[var(--color-primary)]/40 py-3.5 text-[var(--color-primary)] disabled:opacity-50"
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
      <div className="px-5 mt-4">
        <button
          onClick={() => navigateSafely(navigate, '/pdf-reader')}
          className="glass-card glass-card-interactive w-full flex items-center justify-center gap-2 rounded-[22px] py-3 text-[var(--color-foreground)]"
        >
          <BookOpen size={16} className="text-[var(--color-primary)]" />
          <span className="text-[13px] font-medium">直接打开 PDF 阅读器</span>
        </button>
      </div>

      {/* ===== 最近阅读 ===== */}
      {recentReads.length > 0 && (
        <div className="px-5 mt-5">
          <h3 className="text-[16px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">最近阅读</h3>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5">
            {recentReads.map((book) => {
              const classicCoverBook = getClassicCoverBook(book)

              return (
                <div
                  key={book.id}
                  className="glass-card glass-card-interactive shrink-0 w-[220px] rounded-[24px] p-3.5"
                  onClick={() => openBook(book)}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Clock size={14} className="text-[var(--color-muted)]" />
                    <span className="text-[11px] text-[var(--color-muted)]">
                      {new Date(book.updated_at).toLocaleDateString('zh-CN')}
                    </span>
                  </div>

                  <div className="mb-3 overflow-hidden rounded-[18px]">
                    {classicCoverBook ? (
                      <div className="aspect-[5/7]">
                        <ClassicBookCover book={classicCoverBook} compact />
                      </div>
                    ) : book.cover_emoji?.startsWith('data:') ? (
                      <div className="aspect-[5/7] overflow-hidden rounded-[18px]">
                        <img src={book.cover_emoji} alt={book.title} className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className="glass-card-soft flex aspect-[5/7] items-center justify-center rounded-[18px]">
                        <span className="text-[34px]">{book.cover_emoji}</span>
                      </div>
                    )}
                  </div>

                  <p className="text-[14px] font-semibold text-[var(--color-foreground)] line-clamp-1">{book.title}</p>
                  <p className="text-[12px] text-[var(--color-muted)] mt-0.5">{book.author}</p>
                  <div className="glass-card-soft mt-2 h-1.5 overflow-hidden rounded-full border-0 shadow-none">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${book.progress}%`,
                        backgroundColor: book.progress === 100 ? '#22C55E' : '#FF8400',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ===== 公共经典书库 ===== */}
      <div className="px-5 mt-5">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="font-secondary text-[16px] font-bold text-[var(--color-foreground)]">公共经典书库</h3>
            <p className="mt-1 text-[12px] text-[var(--color-muted)]">
              所有人共用同一份正文资源，你的书架只记录个人进度
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="glass-card-soft flex items-center rounded-full p-1">
              <button
                onClick={() => setClassicLibraryView('cover')}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  classicLibraryView === 'cover'
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-[var(--color-muted)]'
                }`}
                aria-label="封面视图"
                title="封面视图"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                onClick={() => setClassicLibraryView('list')}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  classicLibraryView === 'list'
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-[var(--color-muted)]'
                }`}
                aria-label="列表视图"
                title="列表视图"
              >
                <Rows3 size={15} />
              </button>
            </div>
            <span className="text-[11px] font-medium text-[var(--color-primary)]">{CLASSIC_BOOKS.length} 本</span>
          </div>
        </div>

        {classicLibraryView === 'cover' ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {filteredClassicBooks.map((classicBook) => {
              const linkedBook = classicBookMap[classicBook.slug]
              const isAdding = addingClassicSlug === classicBook.slug

              return (
                <div key={classicBook.slug} className="glass-card rounded-[24px] p-2.5">
                  <button
                    onClick={() => linkedBook ? openBook(linkedBook) : handleAddClassicBook(classicBook)}
                    className="w-full text-left"
                  >
                    <div className="mb-3 aspect-[5/7] overflow-hidden rounded-[18px]">
                      <ClassicBookCover book={classicBook} compact />
                    </div>
                    <p className="line-clamp-2 text-[12px] font-semibold text-[var(--color-foreground)]">{classicBook.title}</p>
                    <p className="mt-1 line-clamp-1 text-[10px] text-[var(--color-muted)]">{classicBook.author}</p>
                  </button>

                  <button
                    onClick={() => linkedBook ? openBook(linkedBook) : handleAddClassicBook(classicBook)}
                    disabled={isAdding}
                    className="glass-card-soft mt-3 flex w-full items-center justify-center gap-2 rounded-[14px] py-2 text-[11px] font-semibold text-[var(--color-foreground)] disabled:opacity-60"
                  >
                    {isAdding ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>加入中...</span>
                      </>
                    ) : linkedBook ? (
                      <>
                        <BookOpen size={13} className="text-[var(--color-primary)]" />
                        <span>{linkedBook.progress > 0 ? '继续阅读' : '打开书籍'}</span>
                      </>
                    ) : (
                      <>
                        <Download size={13} className="text-[var(--color-primary)]" />
                        <span>加入书架</span>
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredClassicBooks.map((classicBook) => {
              const linkedBook = classicBookMap[classicBook.slug]
              const isAdding = addingClassicSlug === classicBook.slug

              return (
                <div key={classicBook.slug} className="glass-card flex items-center gap-3 rounded-[24px] p-3">
                  <button
                    onClick={() => linkedBook ? openBook(linkedBook) : handleAddClassicBook(classicBook)}
                    className="shrink-0"
                  >
                    <div className="h-[112px] w-[82px] overflow-hidden rounded-[16px]">
                      <ClassicBookCover book={classicBook} />
                    </div>
                  </button>

                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => linkedBook ? openBook(linkedBook) : handleAddClassicBook(classicBook)}
                      className="block w-full text-left"
                    >
                      <p className="line-clamp-2 text-[14px] font-semibold text-[var(--color-foreground)]">{classicBook.title}</p>
                      <p className="mt-1 text-[12px] text-[var(--color-muted)]">{classicBook.author}</p>
                      <p className="mt-2 line-clamp-1 text-[11px] text-[var(--color-muted-light)]">{classicBook.coverTheme.tagline}</p>
                    </button>
                  </div>

                  <button
                    onClick={() => linkedBook ? openBook(linkedBook) : handleAddClassicBook(classicBook)}
                    disabled={isAdding}
                    className="glass-card-soft flex shrink-0 items-center justify-center gap-2 rounded-[16px] px-3 py-2 text-[11px] font-semibold text-[var(--color-foreground)] disabled:opacity-60"
                  >
                    {isAdding ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>加入中</span>
                      </>
                    ) : linkedBook ? (
                      <>
                        <BookOpen size={13} className="text-[var(--color-primary)]" />
                        <span>{linkedBook.progress > 0 ? '继续' : '打开'}</span>
                      </>
                    ) : (
                      <>
                        <Download size={13} className="text-[var(--color-primary)]" />
                        <span>加入</span>
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ===== 书架网格 ===== */}
      <div className="px-5 py-6">
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
          <div className="glass-card-soft text-center rounded-[24px] py-12">
            <p className="text-[48px] mb-3">📚</p>
            <p className="text-[14px] text-[var(--color-muted)]">书架还是空的</p>
            <p className="text-[12px] text-[var(--color-muted-light)] mt-1">你可以先导入 PDF，或从上方公共经典书库直接开始阅读</p>
          </div>
        )}

        {/* 书籍网格 */}
        {!loading && filteredBooks.length > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
            {filteredBooks.map((book) => {
              const classicCoverBook = getClassicCoverBook(book)

              return (
                <div
                  key={book.id}
                  className="glass-card glass-card-interactive relative mx-auto flex w-full max-w-[220px] flex-col items-center rounded-[24px] p-2.5 cursor-pointer group"
                  onClick={() => openBook(book)}
                >
                  <div className="relative mb-2 w-full overflow-hidden rounded-[20px]">
                    {classicCoverBook ? (
                      <div className="aspect-[5/7]">
                        <ClassicBookCover book={classicCoverBook} compact />
                      </div>
                    ) : book.cover_emoji?.startsWith('data:') ? (
                      <div className="aspect-[3/4] w-full overflow-hidden rounded-[20px]">
                        <img
                          src={book.cover_emoji}
                          alt={book.title}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="glass-card-soft relative flex aspect-[3/4] w-full items-center justify-center rounded-[20px]">
                        <span className="text-[36px]">{book.cover_emoji}</span>
                      </div>
                    )}

                    {book.progress > 0 && book.progress < 100 && (
                      <div className="glass-card-soft absolute bottom-0 left-0 right-0 h-1 rounded-none border-0 shadow-none">
                        <div className="h-full bg-[var(--color-primary)]" style={{ width: `${book.progress}%` }} />
                      </div>
                    )}
                    {book.progress === 100 && (
                      <div className="absolute top-2 right-2 rounded bg-[var(--color-success)] px-1.5 py-0.5 text-[9px] font-bold text-white">
                        已读完
                      </div>
                    )}
                    {book.total_pages && (
                      <div className="absolute top-2 left-2 rounded bg-black/30 px-1.5 py-0.5 text-[9px] text-white">
                        {book.total_pages}页
                      </div>
                    )}
                  </div>

                  <p className="w-full text-center text-[12px] font-medium text-[var(--color-foreground)] line-clamp-1">{book.title}</p>
                  <p className="w-full text-center text-[10px] text-[var(--color-muted)] line-clamp-1">{book.author}</p>
                  {book.id > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteBook(book.id) }}
                      className="glass-pill absolute top-1 right-1 rounded-full p-1 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 size={12} className="text-[var(--color-error)]" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
