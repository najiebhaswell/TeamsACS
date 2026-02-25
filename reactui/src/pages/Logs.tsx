import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Search, Filter, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'

interface OprLog {
    id: string
    opr_name: string
    opt_action: string
    opr_ip: string
    opt_desc: string
    opt_time: string
}

interface PageResult {
    total_count: number
    pos: number
    data: OprLog[] | null
}

export default function LogsPage() {
    const [searchTerm, setSearchTerm] = useState('')
    const [page, setPage] = useState(0)
    const pageSize = 50

    const { data, isLoading, refetch, isError, error } = useQuery({
        queryKey: ['logs', page, searchTerm],
        queryFn: async () => {
            // Backend GORM uses TimeZone=Asia/Shanghai, so send local time (not UTC)
            const now = new Date()
            const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
            const fmt = (d: Date) => {
                const pad = (n: number) => String(n).padStart(2, '0')
                return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
            }
            const params = new URLSearchParams({
                start: String(page * pageSize),
                count: String(pageSize),
                starttime: fmt(past),
                endtime: fmt(now),
            })
            if (searchTerm) {
                params.append('keyword', searchTerm)
            }
            const res = await api.get<PageResult>(`/admin/logging/query?${params}`)
            return res
        },
        staleTime: 5000,
    })

    const logs = data?.data ?? []
    const totalCount = data?.total_count ?? 0
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

    const formatDate = (dateString: string) => {
        if (!dateString) return '—'
        try {
            const date = new Date(dateString)
            if (isNaN(date.getTime())) return dateString
            return date.toLocaleString('id-ID', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
            })
        } catch { return dateString }
    }

    const getActionBadge = (action: string) => {
        if (!action) return <Badge variant="outline">—</Badge>
        const a = action.toLowerCase()
        if (a.includes('login') || a.includes('logout')) return <Badge variant="info">{action}</Badge>
        if (a.includes('delete') || a.includes('remove')) return <Badge variant="destructive">{action}</Badge>
        if (a.includes('update') || a.includes('edit') || a.includes('set') || a.includes('wifi') || a.includes('reboot'))
            return <Badge variant="warning">{action}</Badge>
        if (a.includes('create') || a.includes('add')) return <Badge variant="success">{action}</Badge>
        return <Badge variant="outline">{action}</Badge>
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/20">
                        <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-on-surface">Operation Logs</h1>
                        <p className="text-sm text-on-surface-muted">System operation and audit trail</p>
                    </div>
                </div>
                <Button onClick={() => refetch()} variant="outline" size="sm" className="border-surface-border text-on-surface-secondary hover:text-on-surface hover:bg-surface-hover">
                    <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <Card className="bg-surface border-surface-border">
                    <CardContent className="p-4">
                        <div className="text-xs text-on-surface-muted mb-1">Total Logs</div>
                        <div className="text-2xl font-bold text-on-surface">{totalCount.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card className="bg-surface border-surface-border">
                    <CardContent className="p-4">
                        <div className="text-xs text-on-surface-muted mb-1">Page</div>
                        <div className="text-2xl font-bold text-on-surface">{page + 1} <span className="text-sm font-normal text-on-surface-muted">/ {totalPages}</span></div>
                    </CardContent>
                </Card>
                <Card className="bg-surface border-surface-border">
                    <CardContent className="p-4">
                        <div className="text-xs text-on-surface-muted mb-1">Showing</div>
                        <div className="text-2xl font-bold text-on-surface">{logs.length} <span className="text-sm font-normal text-on-surface-muted">entries</span></div>
                    </CardContent>
                </Card>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-muted" />
                <Input
                    placeholder="Search by operator, action, IP, or description..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setPage(0) }}
                    className="pl-10 bg-surface border-surface-border text-on-surface placeholder:text-on-surface-muted"
                />
            </div>

            {/* Error State */}
            {isError && (
                <Card className="bg-red-500/10 border-red-500/20">
                    <CardContent className="p-4 text-center text-red-400 text-sm">
                        Failed to load logs: {(error as Error)?.message || 'Unknown error'}
                    </CardContent>
                </Card>
            )}

            {/* Logs Table */}
            <Card className="bg-surface border-surface-border">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-16">
                            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                            <span className="ml-3 text-on-surface-muted">Loading logs...</span>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-on-surface-muted">
                            <FileText className="w-12 h-12 mb-3 opacity-20" />
                            <p className="text-sm">No operation logs found</p>
                            {searchTerm && <p className="text-xs mt-1">Try clearing the search filter</p>}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-surface-border hover:bg-transparent">
                                        <TableHead className="text-on-surface-secondary w-36">Operator</TableHead>
                                        <TableHead className="text-on-surface-secondary w-36">Action</TableHead>
                                        <TableHead className="text-on-surface-secondary w-36">IP Address</TableHead>
                                        <TableHead className="text-on-surface-secondary">Description</TableHead>
                                        <TableHead className="text-on-surface-secondary w-44">Time</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logs.map((log) => (
                                        <TableRow key={log.id} className="border-surface-border">
                                            <TableCell className="font-medium text-sm text-on-surface">{log.opr_name || '—'}</TableCell>
                                            <TableCell>{getActionBadge(log.opt_action)}</TableCell>
                                            <TableCell className="font-mono text-xs text-on-surface-secondary">{log.opr_ip || '—'}</TableCell>
                                            <TableCell className="text-sm text-on-surface-secondary max-w-md truncate" title={log.opt_desc}>
                                                {log.opt_desc || '—'}
                                            </TableCell>
                                            <TableCell className="text-xs text-on-surface-muted whitespace-nowrap">
                                                {formatDate(log.opt_time)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Pagination */}
            {totalCount > 0 && (
                <div className="flex items-center justify-between">
                    <div className="text-sm text-on-surface-muted">
                        Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount.toLocaleString()}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                            className="border-surface-border text-on-surface-secondary hover:text-on-surface hover:bg-surface-hover">
                            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                            className="border-surface-border text-on-surface-secondary hover:text-on-surface hover:bg-surface-hover">
                            Next <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
