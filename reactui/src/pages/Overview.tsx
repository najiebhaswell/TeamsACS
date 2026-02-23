import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    MonitorSmartphone, Wifi, WifiOff, Server, Activity,
    Radio, MessageSquare, Download, Factory, Cpu, Code,
} from 'lucide-react'

interface CounterItem { name: string; value: number; icon: string }
interface DistItem { name: string; count: number }
interface DistResult { manufacturer: DistItem[]; model: DistItem[]; version: DistItem[] }

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

const PALETTE_BRAND = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0891b2', '#059669']
const PALETTE_MODEL = ['#059669', '#0284c7', '#7c3aed', '#e11d48', '#ca8a04', '#0891b2']
const PALETTE_VERSION = ['#ea580c', '#2563eb', '#16a34a', '#9333ea', '#dc2626', '#0891b2']

function PieChart({ items, colors, size = 140 }: { items: DistItem[]; colors: string[]; size?: number }) {
    const total = items.reduce((s, i) => s + i.count, 0)
    if (total === 0) return null
    const cx = size / 2, cy = size / 2, r = size / 2 - 4
    let cumAngle = -90

    return (
        <svg width={size} height={size} className="mx-auto">
            {items.map((item, i) => {
                const angle = (item.count / total) * 360
                const startAngle = cumAngle
                cumAngle += angle
                const endAngle = cumAngle
                const largeArc = angle > 180 ? 1 : 0
                const x1 = cx + r * Math.cos((startAngle * Math.PI) / 180)
                const y1 = cy + r * Math.sin((startAngle * Math.PI) / 180)
                const x2 = cx + r * Math.cos((endAngle * Math.PI) / 180)
                const y2 = cy + r * Math.sin((endAngle * Math.PI) / 180)
                const d = items.length === 1
                    ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
                    : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
                return <path key={i} d={d} fill={colors[i % colors.length]} className="hover:opacity-80 transition-opacity" />
            })}
            <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--app-page)" />
            <text x={cx} y={cy - 6} textAnchor="middle" className="fill-on-surface text-2xl font-bold">{total}</text>
            <text x={cx} y={cy + 12} textAnchor="middle" className="fill-on-surface-muted text-[10px]">total</text>
        </svg>
    )
}

function DistributionCard({ title, icon: Icon, items, color, palette }: { title: string; icon: typeof Factory; items: DistItem[] | undefined; color: string; palette: string[] }) {
    return (
        <Card className="bg-surface border-surface-border">
            <CardHeader className="pb-3">
                <CardTitle className="text-base text-on-surface flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center`}>
                        <Icon className="w-4 h-4 text-white" />
                    </div>
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {!items || items.length === 0 ? (
                    <div className="text-sm text-on-surface-muted">No data</div>
                ) : (
                    <div className="flex flex-col items-center gap-3">
                        <PieChart items={items} colors={palette} />
                        <div className="w-full space-y-1.5">
                            {items.map((item, i) => (
                                <div key={item.name} className="flex items-center gap-2 text-sm">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: palette[i % palette.length] }} />
                                    <span className="text-on-surface-secondary truncate flex-1">{item.name}</span>
                                    <span className="text-on-surface font-medium">{item.count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
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
                <h1 className="text-2xl font-bold text-on-surface">Dashboard</h1>
                <p className="text-on-surface-secondary text-sm mt-1">System overview and statistics</p>
            </div>

            {/* Device Stats */}
            <div>
                <h2 className="text-sm font-medium text-on-surface-secondary uppercase tracking-wider mb-3">Devices</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {isLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <Card key={i} className="bg-surface border-surface-border">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <div className="h-4 w-20 bg-surface-skeleton rounded animate-pulse" />
                                    <div className="w-9 h-9 bg-surface-skeleton rounded-lg animate-pulse" />
                                </CardHeader>
                                <CardContent><div className="h-9 w-16 bg-surface-skeleton rounded animate-pulse" /></CardContent>
                            </Card>
                        ))
                    ) : (
                        deviceStats.map((item) => {
                            const mapping = iconMap[item.name] || { icon: Activity, color: 'from-slate-500 to-slate-600', shadow: 'shadow-slate-500/20' }
                            const Icon = mapping.icon
                            return (
                                <Card key={item.name} className="bg-surface border-surface-border hover:border-on-surface-muted/30 transition-colors">
                                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                                        <CardTitle className="text-sm font-medium text-on-surface-secondary">{item.name}</CardTitle>
                                        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${mapping.color} flex items-center justify-center shadow-lg ${mapping.shadow}`}>
                                            <Icon className="w-4 h-4 text-white" />
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-3xl font-bold text-on-surface">{Math.round(item.value).toLocaleString()}</div>
                                    </CardContent>
                                </Card>
                            )
                        })
                    )}
                </div>
            </div>

            {/* TR-069 Activity */}
            <div>
                <h2 className="text-sm font-medium text-on-surface-secondary uppercase tracking-wider mb-3">TR-069 Activity (24h)</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {isLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <Card key={i} className="bg-surface border-surface-border">
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <div className="h-4 w-24 bg-surface-skeleton rounded animate-pulse" />
                                    <div className="w-9 h-9 bg-surface-skeleton rounded-lg animate-pulse" />
                                </CardHeader>
                                <CardContent><div className="h-9 w-16 bg-surface-skeleton rounded animate-pulse" /></CardContent>
                            </Card>
                        ))
                    ) : (
                        messageStats.map((item) => {
                            const mapping = iconMap[item.name] || { icon: Activity, color: 'from-slate-500 to-slate-600', shadow: 'shadow-slate-500/20' }
                            const Icon = mapping.icon
                            const label = item.name.replace('24h ', '')
                            return (
                                <Card key={item.name} className="bg-surface border-surface-border hover:border-on-surface-muted/30 transition-colors">
                                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                                        <CardTitle className="text-sm font-medium text-on-surface-secondary">{label}</CardTitle>
                                        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${mapping.color} flex items-center justify-center shadow-lg ${mapping.shadow}`}>
                                            <Icon className="w-4 h-4 text-white" />
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-3xl font-bold text-on-surface">{Math.round(item.value).toLocaleString()}</div>
                                    </CardContent>
                                </Card>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Distribution */}
            <div>
                <h2 className="text-sm font-medium text-on-surface-secondary uppercase tracking-wider mb-3">Device Distribution</h2>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <DistributionCard title="Brand" icon={Factory} items={dist?.manufacturer} color="from-blue-500 to-indigo-600" palette={PALETTE_BRAND} />
                    <DistributionCard title="Model" icon={Cpu} items={dist?.model} color="from-emerald-500 to-teal-600" palette={PALETTE_MODEL} />
                    <DistributionCard title="Firmware Version" icon={Code} items={dist?.version} color="from-amber-500 to-orange-600" palette={PALETTE_VERSION} />
                </div>
            </div>
        </div>
    )
}
