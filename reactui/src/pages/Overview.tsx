import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    MonitorSmartphone,
    Wifi,
    WifiOff,
    Server,
    Activity,
    Radio,
    MessageSquare,
    Download,
    Factory,
    Cpu,
    Code,
} from 'lucide-react'

interface CounterItem {
    name: string
    value: number
    icon: string
}

interface DistItem {
    name: string
    count: number
}

interface DistResult {
    manufacturer: DistItem[]
    model: DistItem[]
    version: DistItem[]
}

const iconMap: Record<string, { icon: typeof Activity; color: string; shadow: string }> = {
    'CPE Total': { icon: MonitorSmartphone, color: 'from-blue-500 to-blue-600', shadow: 'shadow-blue-500/20' },
    'Online CPE': { icon: Wifi, color: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/20' },
    'Offline CPE': { icon: WifiOff, color: 'from-orange-500 to-orange-600', shadow: 'shadow-orange-500/20' },
    'ONT Devices': { icon: Radio, color: 'from-cyan-500 to-cyan-600', shadow: 'shadow-cyan-500/20' },
    'Router Devices': { icon: Server, color: 'from-violet-500 to-violet-600', shadow: 'shadow-violet-500/20' },
    '24h Total Message': { icon: MessageSquare, color: 'from-indigo-500 to-indigo-600', shadow: 'shadow-indigo-500/20' },
    '24h TR069 Inform': { icon: Activity, color: 'from-teal-500 to-teal-600', shadow: 'shadow-teal-500/20' },
    '24h TR069 Download': { icon: Download, color: 'from-pink-500 to-pink-600', shadow: 'shadow-pink-500/20' },
}

const displayOrder = [
    'CPE Total', 'Online CPE', 'Offline CPE', 'ONT Devices', 'Router Devices',
    '24h Total Message', '24h TR069 Inform', '24h TR069 Download',
]

function DistributionCard({ title, icon: Icon, items, color }: { title: string; icon: typeof Factory; items: DistItem[] | undefined; color: string }) {
    const total = items?.reduce((sum, i) => sum + i.count, 0) || 0

    return (
        <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
                <CardTitle className="text-base text-white flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center`}>
                        <Icon className="w-4 h-4 text-white" />
                    </div>
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                {!items || items.length === 0 ? (
                    <div className="text-sm text-slate-500">No data</div>
                ) : (
                    items.map((item) => {
                        const pct = total > 0 ? (item.count / total) * 100 : 0
                        return (
                            <div key={item.name} className="group">
                                <div className="flex items-center justify-between text-sm mb-1">
                                    <span className="text-slate-300 font-medium truncate mr-2">{item.name}</span>
                                    <span className="text-slate-400 shrink-0">{item.count}</span>
                                </div>
                                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-500`}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                            </div>
                        )
                    })
                )}
            </CardContent>
        </Card>
    )
}

export default function OverviewPage() {
    const { data: counters, isLoading } = useQuery({
        queryKey: ['overview'],
        queryFn: () => api.get<CounterItem[]>('/admin/overview/data'),
        refetchInterval: 30_000,
    })

    const { data: dist } = useQuery({
        queryKey: ['distribution'],
        queryFn: () => api.get<DistResult>('/admin/overview/distribution'),
        refetchInterval: 60_000,
    })

    const items = counters || []
    const sorted = [...items].sort((a, b) => {
        const ai = displayOrder.indexOf(a.name)
        const bi = displayOrder.indexOf(b.name)
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })

    const deviceStats = sorted.filter(i => ['CPE Total', 'Online CPE', 'Offline CPE', 'ONT Devices', 'Router Devices'].includes(i.name))
    const messageStats = sorted.filter(i => i.name.startsWith('24h'))

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Dashboard</h1>
                <p className="text-slate-400 text-sm mt-1">System overview and statistics</p>
            </div>

            {/* Device Stats */}
            <div>
                <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">Devices</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {isLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <Card key={i} className="bg-slate-900/50 border-slate-800">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <div className="h-4 w-20 bg-slate-800 rounded animate-pulse" />
                                    <div className="w-9 h-9 bg-slate-800 rounded-lg animate-pulse" />
                                </CardHeader>
                                <CardContent><div className="h-9 w-16 bg-slate-800 rounded animate-pulse" /></CardContent>
                            </Card>
                        ))
                    ) : (
                        deviceStats.map((item) => {
                            const mapping = iconMap[item.name] || { icon: Activity, color: 'from-slate-500 to-slate-600', shadow: 'shadow-slate-500/20' }
                            const Icon = mapping.icon
                            return (
                                <Card key={item.name} className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors">
                                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                                        <CardTitle className="text-sm font-medium text-slate-400">{item.name}</CardTitle>
                                        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${mapping.color} flex items-center justify-center shadow-lg ${mapping.shadow}`}>
                                            <Icon className="w-4 h-4 text-white" />
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-3xl font-bold text-white">{Math.round(item.value).toLocaleString()}</div>
                                    </CardContent>
                                </Card>
                            )
                        })
                    )}
                </div>
            </div>

            {/* TR-069 Activity */}
            <div>
                <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">TR-069 Activity (24h)</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {isLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <Card key={i} className="bg-slate-900/50 border-slate-800">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <div className="h-4 w-24 bg-slate-800 rounded animate-pulse" />
                                    <div className="w-9 h-9 bg-slate-800 rounded-lg animate-pulse" />
                                </CardHeader>
                                <CardContent><div className="h-9 w-16 bg-slate-800 rounded animate-pulse" /></CardContent>
                            </Card>
                        ))
                    ) : (
                        messageStats.map((item) => {
                            const mapping = iconMap[item.name] || { icon: Activity, color: 'from-slate-500 to-slate-600', shadow: 'shadow-slate-500/20' }
                            const Icon = mapping.icon
                            const label = item.name.replace('24h ', '')
                            return (
                                <Card key={item.name} className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors">
                                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                                        <CardTitle className="text-sm font-medium text-slate-400">{label}</CardTitle>
                                        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${mapping.color} flex items-center justify-center shadow-lg ${mapping.shadow}`}>
                                            <Icon className="w-4 h-4 text-white" />
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-3xl font-bold text-white">{Math.round(item.value).toLocaleString()}</div>
                                    </CardContent>
                                </Card>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Distribution */}
            <div>
                <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">Device Distribution</h2>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <DistributionCard
                        title="Brand"
                        icon={Factory}
                        items={dist?.manufacturer}
                        color="from-blue-500 to-indigo-600"
                    />
                    <DistributionCard
                        title="Model"
                        icon={Cpu}
                        items={dist?.model}
                        color="from-emerald-500 to-teal-600"
                    />
                    <DistributionCard
                        title="Firmware Version"
                        icon={Code}
                        items={dist?.version}
                        color="from-amber-500 to-orange-600"
                    />
                </div>
            </div>
        </div>
    )
}
