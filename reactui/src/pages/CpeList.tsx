import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, type ApiResponse } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, ChevronLeft, ChevronRight, Radio, Router, RefreshCw, RotateCcw } from 'lucide-react'

interface NetCpe {
    id: number
    sn: string
    name: string
    model: string
    manufacturer: string
    software_version: string
    device_type: string
    cwmp_status: string
    cwmp_last_inform: string
    fiber_rx_power: string
    fiber_tx_power: string
    uptime: number
    cpu_usage: number
    created_at: string
    updated_at: string
}

interface PageResult {
    total_count: number
    pos: number
    data: NetCpe[]
}

function formatUptime(seconds: number): string {
    if (!seconds) return '—'
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (d > 0) return `${d}d ${h}h`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
}

function timeAgo(dateStr: string): string {
    if (!dateStr) return '—'
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
}

const PAGE_SIZE = 20

export default function CpeListPage() {
    const navigate = useNavigate()
    const [keyword, setKeyword] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [page, setPage] = useState(0)
    const [rebootingId, setRebootingId] = useState<string | null>(null)
    const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['cpe-list', keyword, page],
        queryFn: () => {
            const params = new URLSearchParams({
                start: String(page * PAGE_SIZE),
                count: String(PAGE_SIZE),
            })
            if (keyword) params.set('keyword', keyword)
            return api.get<PageResult>(`/admin/cpe/query?${params}`)
        },
    })

    const devices = data?.data || []
    const total = data?.total_count || 0
    const totalPages = Math.ceil(total / PAGE_SIZE)

    const handleSearch = () => {
        setKeyword(searchInput)
        setPage(0)
    }

    const handleReboot = async (devId: string, sn: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm(`Reboot device ${sn}?\nThe device will be temporarily offline.`)) return
        setRebootingId(devId)
        try {
            const res = await api.postForm<ApiResponse>('/admin/supervise/reboot', { devid: devId })
            if (res.code === 0) {
                setToast({ type: 'success', msg: `Reboot sent to ${sn}` })
            } else {
                setToast({ type: 'error', msg: res.msg || 'Failed' })
            }
        } catch {
            setToast({ type: 'error', msg: 'Request failed' })
        } finally {
            setRebootingId(null)
            setTimeout(() => setToast(null), 3000)
        }
    }

    return (
        <div className="space-y-4">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all ${toast.type === 'success' ? 'bg-emerald-600 text-on-surface' : 'bg-red-600 text-on-surface'
                    }`}>
                    {toast.msg}
                </div>
            )}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-on-surface">CPE Devices</h1>
                    <p className="text-on-surface-secondary text-sm mt-1">{total} devices registered</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetch()} className="border-surface-border text-on-surface-secondary hover:bg-surface-hover">
                    <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                </Button>
            </div>

            {/* Search */}
            <div className="flex gap-2">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-muted" />
                    <Input
                        placeholder="Search by SN, name, model..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="pl-9 bg-surface border-surface-border text-on-surface placeholder:text-on-surface-muted"
                    />
                </div>
                <Button onClick={handleSearch} className="bg-blue-600 hover:bg-blue-500">Search</Button>
            </div>

            {/* Table */}
            <Card className="bg-surface border-surface-border overflow-hidden">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-surface-border hover:bg-transparent">
                                <TableHead className="text-on-surface-secondary">Status</TableHead>
                                <TableHead className="text-on-surface-secondary">SN</TableHead>
                                <TableHead className="text-on-surface-secondary">Brand</TableHead>
                                <TableHead className="text-on-surface-secondary">Model</TableHead>
                                <TableHead className="text-on-surface-secondary">Type</TableHead>
                                <TableHead className="text-on-surface-secondary">Version</TableHead>
                                <TableHead className="text-on-surface-secondary">RX Power</TableHead>
                                <TableHead className="text-on-surface-secondary">Uptime</TableHead>
                                <TableHead className="text-on-surface-secondary">Last Inform</TableHead>
                                <TableHead className="text-on-surface-secondary text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <TableRow key={i} className="border-surface-border">
                                        {Array.from({ length: 10 }).map((_, j) => (
                                            <TableCell key={j}><div className="h-4 bg-surface-skeleton rounded animate-pulse w-20" /></TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : devices.length === 0 ? (
                                <TableRow className="border-surface-border">
                                    <TableCell colSpan={10} className="text-center text-on-surface-muted py-12">
                                        No devices found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                devices.map((dev) => (
                                    <TableRow
                                        key={dev.id}
                                        className="border-surface-border cursor-pointer hover:bg-surface-input"
                                        onClick={() => navigate(`/cpe/${dev.id}`)}
                                    >
                                        <TableCell>
                                            <Badge variant={dev.cwmp_status === 'online' ? 'success' : 'warning'}>
                                                {dev.cwmp_status === 'online' ? '● Online' : '○ Offline'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-sm text-on-surface">{dev.sn}</TableCell>
                                        <TableCell className="text-on-surface-secondary">{dev.manufacturer || '—'}</TableCell>
                                        <TableCell className="text-on-surface-secondary">{dev.model || '—'}</TableCell>
                                        <TableCell>
                                            {dev.device_type === 'ont' ? (
                                                <span className="inline-flex items-center gap-1 text-cyan-400 text-xs">
                                                    <Radio className="w-3 h-3" /> ONT
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-violet-400 text-xs">
                                                    <Router className="w-3 h-3" /> Router
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-on-surface-secondary text-xs">{dev.software_version || '—'}</TableCell>
                                        <TableCell className="text-on-surface-secondary font-mono text-xs">
                                            {dev.fiber_rx_power
                                                ? (dev.fiber_rx_power.toLowerCase().includes('dbm') ? dev.fiber_rx_power.trim() : `${dev.fiber_rx_power} dBm`)
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="text-on-surface-secondary text-xs">{formatUptime(dev.uptime)}</TableCell>
                                        <TableCell className="text-on-surface-secondary text-xs">{timeAgo(dev.cwmp_last_inform)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                disabled={rebootingId === String(dev.id)}
                                                onClick={(e) => handleReboot(String(dev.id), dev.sn, e)}
                                                className="h-7 px-2 text-xs bg-red-600/80 hover:bg-red-500"
                                            >
                                                <RotateCcw className={`w-3 h-3 mr-1 ${rebootingId === String(dev.id) ? 'animate-spin' : ''}`} />
                                                Reboot
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-secondary">
                        Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                    </span>
                    <div className="flex gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="border-surface-border text-on-surface-secondary hover:bg-surface-hover disabled:opacity-30"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                            const pageNum = page < 3 ? i : page + i - 2
                            if (pageNum < 0 || pageNum >= totalPages) return null
                            return (
                                <Button
                                    key={pageNum}
                                    variant={pageNum === page ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setPage(pageNum)}
                                    className={pageNum === page
                                        ? 'bg-blue-600 hover:bg-blue-500'
                                        : 'border-surface-border text-on-surface-secondary hover:bg-surface-hover'
                                    }
                                >
                                    {pageNum + 1}
                                </Button>
                            )
                        })}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                            className="border-surface-border text-on-surface-secondary hover:bg-surface-hover disabled:opacity-30"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
