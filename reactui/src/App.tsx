import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from '@/components/Layout'
import LoginPage from '@/pages/Login'
import OverviewPage from '@/pages/Overview'
import CpeListPage from '@/pages/CpeList'
import CpeDetailPage from '@/pages/CpeDetail'
import SystemStatusPage from '@/pages/SystemStatus'
import SettingsPage from '@/pages/Settings'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/reactui">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/cpe" element={<CpeListPage />} />
            <Route path="/cpe/:id" element={<CpeDetailPage />} />
            <Route path="/system" element={<SystemStatusPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/" element={<Navigate to="/overview" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
