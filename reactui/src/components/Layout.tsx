import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
    LayoutDashboard,
    Activity,
    MonitorSmartphone,
    Settings,
    LogOut,
    Wifi,
    Menu,
    X,
    Moon,
    Sun,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/lib/theme'

const navItems = [
    { to: '/overview', label: 'Overview', icon: LayoutDashboard },
    { to: '/cpe', label: 'CPE Devices', icon: MonitorSmartphone },
    { to: '/system', label: 'System Status', icon: Activity },
    { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Layout() {
    const navigate = useNavigate()
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const { theme, toggleTheme } = useTheme()

    const handleLogout = () => {
        window.location.href = '/logout'
    }

    return (
        <div className="min-h-screen bg-page text-on-surface flex">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            {/* Sidebar */}
            <aside className={cn(
                "fixed inset-y-0 left-0 z-40 w-64 bg-surface-alt border-r border-surface-border backdrop-blur-xl flex flex-col transition-transform duration-200 lg:translate-x-0 lg:static",
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                {/* Logo */}
                <div className="h-16 flex items-center gap-3 px-6 border-b border-surface-border">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <Wifi className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <div className="font-bold text-lg leading-tight">TeamsACS</div>
                        <div className="text-[10px] text-on-surface-muted uppercase tracking-wider">Management</div>
                    </div>
                    <button className="ml-auto lg:hidden text-on-surface-secondary hover:text-on-surface" onClick={() => setSidebarOpen(false)}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={() => setSidebarOpen(false)}
                            className={({ isActive }) =>
                                cn(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                                    isActive
                                        ? "bg-blue-600/15 text-blue-500 shadow-sm"
                                        : "text-on-surface-secondary hover:bg-surface-hover hover:text-on-surface"
                                )
                            }
                        >
                            <item.icon className="w-4.5 h-4.5 shrink-0" />
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                {/* Footer */}
                <div className="p-3 border-t border-surface-border">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-on-surface-secondary hover:bg-red-500/10 hover:text-red-400 transition-all duration-150"
                    >
                        <LogOut className="w-4.5 h-4.5" />
                        Logout
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top bar */}
                <header className="h-16 flex items-center gap-4 px-6 border-b border-surface-border bg-surface-header backdrop-blur-sm sticky top-0 z-20">
                    <button className="lg:hidden text-on-surface-secondary hover:text-on-surface" onClick={() => setSidebarOpen(true)}>
                        <Menu className="w-5 h-5" />
                    </button>
                    <div className="flex-1" />
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-lg text-on-surface-secondary hover:text-on-surface hover:bg-surface-hover transition-colors"
                        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    >
                        {theme === 'dark' ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
                    </button>
                    <a
                        href="/admin/overview"
                        target="_blank"
                        className="text-xs text-on-surface-muted hover:text-on-surface-secondary transition-colors"
                    >
                        Legacy UI →
                    </a>
                </header>

                {/* Page content */}
                <main className="flex-1 p-6 overflow-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
