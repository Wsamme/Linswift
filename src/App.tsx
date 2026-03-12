import { Routes, Route, Navigate } from 'react-router-dom'

// ===== 布局组件 =====
import AppShell from './components/layout/AppShell'
import ReaderShell from './components/layout/ReaderShell'
import ProtectedRoute from './components/auth/ProtectedRoute'

// ===== Phase 1: 核心页面 =====
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import LearnPage from './pages/LearnPage'
import TranslatePage from './pages/TranslatePage'
import VocabPage from './pages/VocabPage'
import ProfilePage from './pages/ProfilePage'

// ===== Phase 2: 阅读器模块 =====
import BookshelfPage from './pages/BookshelfPage'
import ReadingPrepPage from './pages/ReadingPrepPage'
import FlashcardPage from './pages/FlashcardPage'
import ReadingPage from './pages/ReadingPage'

// ===== Phase 2: 背单词模块 =====
import EbbinghausPage from './pages/EbbinghausPage'
import VocabGamePage from './pages/VocabGamePage'
import AIMemoPage from './pages/AIMemoPage'

// ===== Phase 3: 听力模块 =====
import ListeningHubPage from './pages/ListeningHubPage'
import ListenFillPage from './pages/ListenFillPage'
import ListenGoPage from './pages/ListenGoPage'
import ListenLibPage from './pages/ListenLibPage'

// ===== Phase 3: 口语模块 =====
import SpeakingHubPage from './pages/SpeakingHubPage'
import RetellPage from './pages/RetellPage'
import AIDialogPage from './pages/AIDialogPage'
import SceneSelectPage from './pages/SceneSelectPage'

// ===== Phase 4: 语法 + 词汇测试 =====
import GrammarTreePage from './pages/GrammarTreePage'
import ReadingTestPage from './pages/ReadingTestPage'
import VocabTestPage from './pages/VocabTestPage'
import AIClassifyPage from './pages/AIClassifyPage'
import ProfileEditPage from './pages/ProfileEditPage'

// ===== Phase 5: 个人中心子页面 =====
import LearningSettingsPage from './pages/LearningSettingsPage'
import PronunciationSettingsPage from './pages/PronunciationSettingsPage'
import NotificationSettingsPage from './pages/NotificationSettingsPage'
import ThemeSettingsPage from './pages/ThemeSettingsPage'
import AboutPage from './pages/AboutPage'

// ===== Phase 6 (V2): 词汇游戏 =====
import WordMatchGame from './pages/WordMatchGame'
import SpellingGame from './pages/SpellingGame'

// ===== Phase 7 (V3): PDF 阅读器 =====
import PDFReaderPage from './pages/PDFReaderPage'

// ===== Phase 8: 桌面端官网 =====
import LandingPage from './pages/LandingPage'

/**
 * 应用路由配置
 *
 * 路由分为两类：
 * 1. 公开路由（/login, /register）—— 不需要登录即可访问
 * 2. 受保护路由（其余所有页面）—— 必须登录，否则跳转到 /login
 *
 * <ProtectedRoute> 组件会检查 AuthContext 中的 user 状态：
 *   - loading → 显示加载动画
 *   - null   → 重定向到 /login
 *   - 已登录 → 正常渲染子组件
 */
export default function App() {
  return (
    <Routes>
      {/* ===== 公开路由（无需登录）===== */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* ===== 受保护路由 —— 主应用（带导航）===== */}
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/app/learn" replace />} />
        <Route path="learn" element={<LearnPage />} />
        <Route path="translate" element={<TranslatePage />} />
        <Route path="vocab" element={<VocabPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      {/* ===== 受保护路由 —— 桌面端带侧边导航的独立页面 ===== */}
      <Route element={<ProtectedRoute><ReaderShell /></ProtectedRoute>}>
        {/* 阅读器模块 */}
        <Route path="/bookshelf" element={<BookshelfPage />} />
        <Route path="/reading-prep" element={<ReadingPrepPage />} />
        <Route path="/flashcard" element={<FlashcardPage />} />
        <Route path="/reading" element={<ReadingPage />} />
        <Route path="/pdf-reader" element={<PDFReaderPage />} />

        {/* 背单词模块 */}
        <Route path="/ebbinghaus" element={<EbbinghausPage />} />
        <Route path="/vocab-game" element={<VocabGamePage />} />
        <Route path="/ai-memo" element={<AIMemoPage />} />

        {/* 听力模块 */}
        <Route path="/listening" element={<ListeningHubPage />} />
        <Route path="/listen-fill" element={<ListenFillPage />} />
        <Route path="/listen-go" element={<ListenGoPage />} />
        <Route path="/listen-lib" element={<ListenLibPage />} />

        {/* 口语模块 */}
        <Route path="/speaking" element={<SpeakingHubPage />} />
        <Route path="/retell" element={<RetellPage />} />
        <Route path="/ai-dialog" element={<AIDialogPage />} />
        <Route path="/scene-select" element={<SceneSelectPage />} />

        {/* 语法 + 测试 */}
        <Route path="/grammar" element={<GrammarTreePage />} />
        <Route path="/reading-test" element={<ReadingTestPage />} />
        <Route path="/vocab-test" element={<VocabTestPage />} />
        <Route path="/ai-classify" element={<AIClassifyPage />} />

        {/* 个人资料编辑 */}
        <Route path="/profile-edit" element={<ProfileEditPage />} />

        {/* 个人中心 - 设置子页面 */}
        <Route path="/learning-settings" element={<LearningSettingsPage />} />
        <Route path="/pronunciation-settings" element={<PronunciationSettingsPage />} />
        <Route path="/notification-settings" element={<NotificationSettingsPage />} />
        <Route path="/theme-settings" element={<ThemeSettingsPage />} />
        <Route path="/about" element={<AboutPage />} />

        {/* V2: 词汇游戏 */}
        <Route path="/word-match" element={<WordMatchGame />} />
        <Route path="/spelling-game" element={<SpellingGame />} />
      </Route>
    </Routes>
  )
}
