import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Cpu, HardDrive, MemoryStick, Clock, Server, Activity, Box } from 'lucide-react'

interface SysInfo {
    hostname: string
    os: string
    uptime: number
    cpu_usage: number
    cpu_cores: number
    mem_total: number
    mem_used: number
    mem_free: number
    mem_used_percent: number
    disk_total: number
    disk_used: number
    disk_free: number
    disk_percent: number
    process_mem: number
    process_cpu: number
    num_goroutine: number
    go_version: string
}

function formatBytes(bytes: number): string {
    if (!bytes) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatUptime(seconds: number): string {
    if (!seconds) return '—'
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const parts: string[] = []
    if (d > 0) parts.push(`${d}d`)
    if (h > 0) parts.push(`${h}h`)
    if (m > 0) parts.push(`${m}m`)
    return parts.join(' ') || '0m'
}

function UsageRing({ percent, color, size = 120 }: { percent: number; color: string; size?: number }) {
    const r = (size - 12) / 2
    const circ = 2 * Math.PI * r
    const offset = circ * (1 - percent / 100)

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform -rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(30 41 59)" strokeWidth={10} />
                <circle
                    cx={size / 2} cy={size / 2} r={r} fill="none"
                    stroke={color}
                    strokeWidth={10}
                    strokeDasharray={circ}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">{percent}%</span>
            </div>
        </div>
    )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex justify-between items-center py-2 border-b border-slate-800 last:border-0">
            <span className="text-slate-400 text-sm">{label}</span>
            <span className="text-white text-sm font-mono">{value || '—'}</span>
        </div>
    )
}

export default function SystemStatusPage() {
    const { data: sys, isLoading } = useQuery({
        queryKey: ['sysstatus'],
        queryFn: () => api.get<SysInfo>('/admin/sysstatus/data'),
        refetchInterval: 10_000,
    })

    if (isLoading || !sys) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">System Status</h1>
                    <p className="text-slate-400 text-sm mt-1">Loading...</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                        <Card key={i} className="bg-slate-900/50 border-slate-800">
                            <CardContent className="p-8 flex justify-center">
                                <div className="w-28 h-28 bg-slate-800 rounded-full animate-pulse" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">System Status</h1>
                <p className="text-slate-400 text-sm mt-1">
                    {sys.hostname} · {sys.os} · up {formatUptime(sys.uptime)}
                </p>
            </div>

            {/* Usage Rings */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
                            <Cpu className="w-4 h-4 text-blue-400" /> CPU Usage
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center pb-6">
                        <UsageRing
                            percent={sys.cpu_usage}
                            color={sys.cpu_usage > 80 ? '#ef4444' : sys.cpu_usage > 50 ? '#f59e0b' : '#10b981'}
                        />
                        <span className="text-xs text-slate-500 mt-2">{sys.cpu_cores} cores</span>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
                            <MemoryStick className="w-4 h-4 text-violet-400" /> Memory Usage
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center pb-6">
                        <UsageRing
                            percent={sys.mem_used_percent}
                            color={sys.mem_used_percent > 80 ? '#ef4444' : sys.mem_used_percent > 50 ? '#f59e0b' : '#8b5cf6'}
                        />
                        <span className="text-xs text-slate-500 mt-2">
                            {formatBytes(sys.mem_used)} / {formatBytes(sys.mem_total)}
                        </span>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
                            <HardDrive className="w-4 h-4 text-amber-400" /> Disk Usage
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center pb-6">
                        <UsageRing
                            percent={sys.disk_percent}
                            color={sys.disk_percent > 80 ? '#ef4444' : sys.disk_percent > 50 ? '#f59e0b' : '#f59e0b'}
                        />
                        <span className="text-xs text-slate-500 mt-2">
                            {formatBytes(sys.disk_used)} / {formatBytes(sys.disk_total)}
                        </span>
                    </CardContent>
                </Card>
            </div>

            {/* Detail Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-white flex items-center gap-2">
                            <Server className="w-4 h-4 text-blue-400" /> System Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-0">
                        <InfoRow label="Hostname" value={sys.hostname} />
                        <InfoRow label="OS / Arch" value={sys.os} />
                        <InfoRow label="Uptime" value={formatUptime(sys.uptime)} />
                        <InfoRow label="CPU Cores" value={sys.cpu_cores} />
                        <InfoRow label="CPU Usage" value={`${sys.cpu_usage}%`} />
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-white flex items-center gap-2">
                            <MemoryStick className="w-4 h-4 text-violet-400" /> Memory Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-0">
                        <InfoRow label="Total" value={formatBytes(sys.mem_total)} />
                        <InfoRow label="Used" value={formatBytes(sys.mem_used)} />
                        <InfoRow label="Free" value={formatBytes(sys.mem_free)} />
                        <InfoRow label="Usage" value={`${sys.mem_used_percent}%`} />
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-white flex items-center gap-2">
                            <HardDrive className="w-4 h-4 text-amber-400" /> Disk Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-0">
                        <InfoRow label="Total" value={formatBytes(sys.disk_total)} />
                        <InfoRow label="Used" value={formatBytes(sys.disk_used)} />
                        <InfoRow label="Free" value={formatBytes(sys.disk_free)} />
                        <InfoRow label="Usage" value={`${sys.disk_percent}%`} />
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-white flex items-center gap-2">
                            <Box className="w-4 h-4 text-emerald-400" /> TeamsACS Process
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-0">
                        <InfoRow label="Process CPU" value={`${sys.process_cpu}%`} />
                        <InfoRow label="Process Memory" value={formatBytes(sys.process_mem)} />
                        <InfoRow label="Goroutines" value={sys.num_goroutine} />
                        <InfoRow label="Go Version" value={sys.go_version} />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
