import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ApiResponse } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
    ArrowLeft, RotateCcw, Wifi, WifiOff, Radio, Router,
    Signal, Activity, Cpu, HardDrive, Globe, Search, Zap, Network,
    Pencil, Save, X, Check, Loader2,
} from 'lucide-react'

interface NetCpe {
    id: number
    sn: string
    name: string
    manufacturer: string
    model: string
    software_version: string
    hardware_version: string
    device_type: string
    cwmp_status: string
    cwmp_url: string
    cwmp_last_inform: string
    fiber_rx_power: string
    fiber_tx_power: string
    uptime: number
    cpu_usage: number
    memory_total: number
    memory_free: number
    wifi_ssid: string
    wan_info: string
    lan_clients: string
    remark: string
    created_at: string
    updated_at: string
}

interface WifiItem {
    idx: number
    ssid: string
    password: string
    enable: string
    channel: string
}

interface WanItem {
    name: string
    service: string
    ip: string
    username: string
    type: string
    enable: string
    vlan_id: string
    ipv6_ip: string
    ip_mode: string
}

interface CpeParam {
    id: number
    sn: string
    name: string
    value: string
}

interface LanClient {
    hostname: string
    ip: string
    mac: string
    interface: string
    rssi: string
    ssid: string
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

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="flex justify-between items-center py-2 border-b border-surface-border last:border-0">
            <span className="text-on-surface-secondary text-sm">{label}</span>
            <span className={`text-on-surface text-sm ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
        </div>
    )
}

function EditableRow({ label, value, onChange, mono, placeholder }: {
    label: string; value: string; onChange: (v: string) => void; mono?: boolean; placeholder?: string
}) {
    return (
        <div className="flex justify-between items-center py-2 border-b border-surface-border last:border-0 gap-4">
            <Label className="text-on-surface-secondary text-sm shrink-0">{label}</Label>
            <Input
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className={`h-8 text-sm bg-surface-input border-surface-border text-on-surface max-w-xs ${mono ? 'font-mono' : ''}`}
            />
        </div>
    )
}

export default function CpeDetailPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [paramSearch, setParamSearch] = useState('')
    const [rebooting, setRebooting] = useState(false)
    const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

    // Edit mode state
    const [editing, setEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    const [editForm, setEditForm] = useState({ name: '', remark: '' })

    // WiFi edit state
    const [wifiEditIdx, setWifiEditIdx] = useState<number | null>(null)
    const [wifiForm, setWifiForm] = useState({ ssid: '', password: '', channel: '', enable: 'true' })
    const [wifiSaving, setWifiSaving] = useState(false)

    const { data: device, isLoading } = useQuery({
        queryKey: ['cpe-detail', id],
        queryFn: () => api.get<NetCpe>(`/admin/cpe/get?id=${id}`),
        enabled: !!id,
    })

    const { data: params } = useQuery({
        queryKey: ['cpe-params', device?.sn],
        queryFn: () => api.get<CpeParam[]>(`/admin/cpe/params?sn=${device!.sn}`),
        enabled: !!device?.sn,
    })

    const wifiList: WifiItem[] = (() => {
        try { return device?.wifi_ssid ? JSON.parse(device.wifi_ssid) : [] } catch { return [] }
    })()

    const wanList: WanItem[] = (() => {
        try { return device?.wan_info ? JSON.parse(device.wan_info) : [] } catch { return [] }
    })()

    const lanClients: LanClient[] = (() => {
        try { return device?.lan_clients ? JSON.parse(device.lan_clients) : [] } catch { return [] }
    })()

    const filteredParams = (params || []).filter(p =>
        !paramSearch || p.name.toLowerCase().includes(paramSearch.toLowerCase()) || p.value.toLowerCase().includes(paramSearch.toLowerCase())
    )

    const showToast = (type: 'success' | 'error', msg: string) => {
        setToast({ type, msg })
        setTimeout(() => setToast(null), 3000)
    }

    const handleWifiEdit = (wifi: WifiItem) => {
        setWifiEditIdx(wifi.idx)
        setWifiForm({ ssid: wifi.ssid, password: wifi.password || '', channel: wifi.channel || '', enable: wifi.enable || 'false' })
    }

    const handleWifiSave = async (idx: number) => {
        if (!device) return
        setWifiSaving(true)
        try {
            const res = await api.postForm<ApiResponse>('/admin/supervise/wifi/set', {
                devid: String(device.id),
                ssid_idx: String(idx),
                ssid: wifiForm.ssid,
                password: wifiForm.password,
                channel: wifiForm.channel,
                enable: wifiForm.enable,
            })
            if (res.code === 0) {
                showToast('success', 'WiFi command sent — changes will apply on device')
                // Optimistic UI update: update the cached device data immediately
                queryClient.setQueryData(['cpe-detail', id], (prev: NetCpe | undefined) => {
                    if (!prev) return prev
                    try {
                        const wList: WifiItem[] = prev.wifi_ssid ? JSON.parse(prev.wifi_ssid) : []
                        const updated = wList.map(w =>
                            w.idx === idx ? { ...w, ssid: wifiForm.ssid, password: wifiForm.password, channel: wifiForm.channel, enable: wifiForm.enable } : w
                        )
                        return { ...prev, wifi_ssid: JSON.stringify(updated) }
                    } catch { return prev }
                })
                setWifiEditIdx(null)
            } else {
                showToast('error', res.msg || 'Failed to set WiFi')
            }
        } catch {
            showToast('error', 'Request failed')
        } finally {
            setWifiSaving(false)
        }
    }

    const handleStartEdit = () => {
        if (!device) return
        setEditForm({ name: device.name || '', remark: device.remark || '' })
        setEditing(true)
    }

    const handleCancelEdit = () => {
        setEditing(false)
    }

    const handleSave = async () => {
        if (!device) return
        if (!editForm.name.trim()) {
            showToast('error', 'Name is required')
            return
        }
        setSaving(true)
        try {
            const res = await api.postForm<ApiResponse>('/admin/cpe/update', {
                id: String(device.id),
                sn: device.sn,
                name: editForm.name.trim(),
                remark: editForm.remark.trim(),
            })
            if (res.code === 0) {
                showToast('success', 'Device updated successfully')
                setEditing(false)
                queryClient.invalidateQueries({ queryKey: ['cpe-detail', id] })
            } else {
                showToast('error', res.msg || 'Update failed')
            }
        } catch {
            showToast('error', 'Request failed')
        } finally {
            setSaving(false)
        }
    }

    const handleReboot = async () => {
        if (!device || !confirm(`Reboot device ${device.sn}?\nThe device will be temporarily offline.`)) return
        setRebooting(true)
        try {
            const res = await api.postForm<ApiResponse>('/admin/supervise/reboot', { devid: String(device.id) })
            showToast(res.code === 0 ? 'success' : 'error', res.code === 0 ? `Reboot sent to ${device.sn}` : res.msg || 'Failed')
        } catch {
            showToast('error', 'Request failed')
        } finally {
            setRebooting(false)
        }
    }

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="h-8 w-48 bg-surface-skeleton rounded animate-pulse" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <Card key={i} className="bg-surface border-surface-border">
                            <CardContent className="p-6 space-y-3">
                                {[1, 2, 3, 4].map(j => <div key={j} className="h-5 bg-surface-skeleton rounded animate-pulse" />)}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        )
    }

    if (!device) {
        return (
            <div className="text-center py-20">
                <p className="text-on-surface-secondary">Device not found</p>
                <Button variant="outline" className="mt-4 border-surface-border text-on-surface-secondary" onClick={() => navigate('/cpe')}>
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back to list
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg flex items-center gap-2 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    {toast.type === 'success' && <Check className="w-4 h-4" />}
                    {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/cpe')} className="text-on-surface-secondary hover:text-on-surface">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold text-on-surface">{device.sn}</h1>
                            <Badge variant={device.cwmp_status === 'online' ? 'success' : 'warning'}>
                                {device.cwmp_status === 'online' ? '● Online' : '○ Offline'}
                            </Badge>
                            {device.device_type === 'ont' ? (
                                <span className="inline-flex items-center gap-1 text-cyan-400 text-xs bg-cyan-500/10 px-2 py-0.5 rounded">
                                    <Radio className="w-3 h-3" /> ONT
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-violet-400 text-xs bg-violet-500/10 px-2 py-0.5 rounded">
                                    <Router className="w-3 h-3" /> Router
                                </span>
                            )}
                        </div>
                        <p className="text-on-surface-secondary text-sm mt-0.5">{device.manufacturer} {device.model}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {editing ? (
                        <>
                            <Button variant="outline" size="sm" onClick={handleCancelEdit} className="border-surface-border text-on-surface-secondary hover:bg-surface-hover">
                                <X className="w-4 h-4 mr-1" /> Cancel
                            </Button>
                            <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-500">
                                <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving...' : 'Save'}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" size="sm" onClick={handleStartEdit} className="border-surface-border text-on-surface-secondary hover:bg-surface-hover">
                                <Pencil className="w-4 h-4 mr-1" /> Edit
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleReboot}
                                disabled={rebooting}
                                className="bg-red-600/80 hover:bg-red-500"
                            >
                                <RotateCcw className={`w-4 h-4 mr-1 ${rebooting ? 'animate-spin' : ''}`} />
                                Reboot
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Device Info */}
                <Card className={`bg-surface border-surface-border ${editing ? 'ring-2 ring-blue-500/30' : ''}`}>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-on-surface flex items-center gap-2">
                            <Cpu className="w-4 h-4 text-blue-400" /> Device Information
                            {editing && <Badge variant="info" className="text-[10px] ml-auto">Editing</Badge>}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-0">
                        <InfoRow label="Serial Number" value={device.sn} mono />
                        {editing ? (
                            <EditableRow
                                label="Name"
                                value={editForm.name}
                                onChange={v => setEditForm(f => ({ ...f, name: v }))}
                                placeholder="Device name"
                            />
                        ) : (
                            <InfoRow label="Name" value={device.name} />
                        )}
                        <InfoRow label="Manufacturer" value={device.manufacturer} />
                        <InfoRow label="Model" value={device.model} />
                        <InfoRow label="Software Version" value={device.software_version} />
                        <InfoRow label="Hardware Version" value={device.hardware_version} />
                        {editing ? (
                            <EditableRow
                                label="Remark"
                                value={editForm.remark}
                                onChange={v => setEditForm(f => ({ ...f, remark: v }))}
                                placeholder="Notes about this device"
                            />
                        ) : (
                            <InfoRow label="Remark" value={device.remark} />
                        )}
                    </CardContent>
                </Card>

                {/* System Status */}
                <Card className="bg-surface border-surface-border">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-on-surface flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-400" /> System Status
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-0">
                        <InfoRow label="Uptime" value={formatUptime(device.uptime)} />
                        <InfoRow label="CPU Usage" value={device.cpu_usage ? `${device.cpu_usage}%` : undefined} />
                        <InfoRow label="Memory Total" value={device.memory_total ? `${(device.memory_total / 1024).toFixed(1)} KB` : undefined} />
                        <InfoRow label="Memory Free" value={device.memory_free ? `${(device.memory_free / 1024).toFixed(1)} KB` : undefined} />
                        <InfoRow label="CWMP URL" value={device.cwmp_url} mono />
                        <InfoRow label="Last Inform" value={device.cwmp_last_inform ? new Date(device.cwmp_last_inform).toLocaleString() : undefined} />
                    </CardContent>
                </Card>

                {/* Optical Power */}
                <Card className="bg-surface border-surface-border">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-on-surface flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-400" /> Optical Power
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-surface-input rounded-lg p-4 text-center">
                                <Signal className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                                <div className="text-xs text-on-surface-secondary mb-1">RX Power</div>
                                <div className="text-xl font-bold text-on-surface font-mono">
                                    {device.fiber_rx_power ? device.fiber_rx_power.replace(/\s*dBm\s*/gi, '').trim() : '—'}
                                </div>
                                {device.fiber_rx_power && <div className="text-xs text-on-surface-muted">dBm</div>}
                            </div>
                            <div className="bg-surface-input rounded-lg p-4 text-center">
                                <Signal className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                                <div className="text-xs text-on-surface-secondary mb-1">TX Power</div>
                                <div className="text-xl font-bold text-on-surface font-mono">
                                    {device.fiber_tx_power ? device.fiber_tx_power.replace(/\s*dBm\s*/gi, '').trim() : '—'}
                                </div>
                                {device.fiber_tx_power && <div className="text-xs text-on-surface-muted">dBm</div>}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* WAN Connections */}
                <Card className="bg-surface border-surface-border">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-on-surface flex items-center gap-2">
                            <Globe className="w-4 h-4 text-indigo-400" /> WAN Connections
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {wanList.length === 0 ? (
                            <div className="text-sm text-on-surface-muted">No WAN data</div>
                        ) : (
                            wanList.map((wan, i) => (
                                <div key={i} className="bg-surface-input rounded-lg p-3 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-on-surface">{wan.name}</span>
                                        <div className="flex gap-1">
                                            <Badge variant={wan.enable === 'true' || wan.enable === '1' ? 'success' : 'warning'} className="text-[10px]">
                                                {wan.enable === 'true' || wan.enable === '1' ? 'Enabled' : 'Disabled'}
                                            </Badge>
                                            <Badge variant="info" className="text-[10px]">{wan.type}</Badge>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                                        <span className="text-on-surface-secondary">Service: <span className="text-on-surface-secondary">{wan.service}</span></span>
                                        <span className="text-on-surface-secondary">VLAN: <span className="text-on-surface-secondary font-mono">{wan.vlan_id}</span></span>
                                        <span className="text-on-surface-secondary">IP: <span className="text-on-surface-secondary font-mono">{wan.ip || '—'}</span></span>
                                        <span className="text-on-surface-secondary">Mode: <span className="text-on-surface-secondary">{wan.ip_mode}</span></span>
                                        {wan.username && <span className="text-on-surface-secondary col-span-2">User: <span className="text-on-surface-secondary font-mono">{wan.username}</span></span>}
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* WiFi SSIDs */}
            {wifiList.length > 0 && (
                <Card className="bg-surface border-surface-border">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-on-surface flex items-center gap-2">
                            <Wifi className="w-4 h-4 text-cyan-400" /> WiFi Configuration
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-surface-border hover:bg-transparent">
                                    <TableHead className="text-on-surface-secondary w-12">#</TableHead>
                                    <TableHead className="text-on-surface-secondary">SSID</TableHead>
                                    <TableHead className="text-on-surface-secondary">Password</TableHead>
                                    <TableHead className="text-on-surface-secondary w-24">Channel</TableHead>
                                    <TableHead className="text-on-surface-secondary w-24">Status</TableHead>
                                    <TableHead className="text-on-surface-secondary w-24 text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {wifiList.map((wifi) => {
                                    const isEditing = wifiEditIdx === wifi.idx
                                    return (
                                        <TableRow key={wifi.idx} className={`border-surface-border ${isEditing ? 'bg-blue-500/5' : ''}`}>
                                            <TableCell className="text-on-surface-secondary text-sm">{wifi.idx}</TableCell>
                                            <TableCell>
                                                {isEditing ? (
                                                    <Input
                                                        value={wifiForm.ssid}
                                                        onChange={e => setWifiForm(f => ({ ...f, ssid: e.target.value }))}
                                                        className="h-7 text-sm bg-surface-input border-surface-border text-on-surface"
                                                        placeholder="SSID"
                                                    />
                                                ) : (
                                                    <span className="text-on-surface font-medium text-sm">{wifi.ssid}</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {isEditing ? (
                                                    <Input
                                                        value={wifiForm.password}
                                                        onChange={e => setWifiForm(f => ({ ...f, password: e.target.value }))}
                                                        className="h-7 text-sm bg-surface-input border-surface-border text-on-surface font-mono"
                                                        placeholder="Password"
                                                    />
                                                ) : (
                                                    <span className="text-on-surface-secondary text-sm font-mono">{wifi.password || '—'}</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {isEditing ? (
                                                    <Input
                                                        value={wifiForm.channel}
                                                        onChange={e => setWifiForm(f => ({ ...f, channel: e.target.value }))}
                                                        className="h-7 text-sm bg-surface-input border-surface-border text-on-surface font-mono w-20"
                                                        placeholder="Ch"
                                                    />
                                                ) : (
                                                    <span className="text-on-surface-secondary text-sm font-mono">{wifi.channel}</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {isEditing ? (
                                                    <button
                                                        onClick={() => setWifiForm(f => ({ ...f, enable: f.enable === 'true' ? 'false' : 'true' }))}
                                                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${wifiForm.enable === 'true'
                                                            ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                                                            : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                                            }`}
                                                    >
                                                        {wifiForm.enable === 'true' ? <><Wifi className="w-3 h-3" /> On</> : <><WifiOff className="w-3 h-3" /> Off</>}
                                                    </button>
                                                ) : (
                                                    wifi.enable === 'true' ? (
                                                        <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                                                            <Wifi className="w-3 h-3" /> Enabled
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-on-surface-muted text-xs">
                                                            <WifiOff className="w-3 h-3" /> Disabled
                                                        </span>
                                                    )
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {isEditing ? (
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-on-surface-muted hover:text-on-surface" onClick={() => setWifiEditIdx(null)}>
                                                            <X className="w-3.5 h-3.5" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-400 hover:text-blue-300" onClick={() => handleWifiSave(wifi.idx)} disabled={wifiSaving}>
                                                            {wifiSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-on-surface-muted hover:text-on-surface" onClick={() => handleWifiEdit(wifi)}>
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* LAN Clients */}
            {lanClients.length > 0 && (
                <Card className="bg-surface border-surface-border">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base text-on-surface flex items-center gap-2">
                            <Network className="w-4 h-4 text-orange-400" /> LAN Clients
                            <span className="text-xs text-on-surface-muted font-normal">({lanClients.length} devices)</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-surface-border hover:bg-transparent">
                                    <TableHead className="text-on-surface-secondary">Hostname</TableHead>
                                    <TableHead className="text-on-surface-secondary">IP Address</TableHead>
                                    <TableHead className="text-on-surface-secondary">MAC Address</TableHead>
                                    <TableHead className="text-on-surface-secondary">Interface</TableHead>
                                    <TableHead className="text-on-surface-secondary">RSSI</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lanClients.map((client, i) => (
                                    <TableRow key={i} className="border-surface-border">
                                        <TableCell className="text-on-surface text-sm">{client.hostname || '(unknown)'}</TableCell>
                                        <TableCell className="text-on-surface-secondary text-sm font-mono">{client.ip}</TableCell>
                                        <TableCell className="text-on-surface-secondary text-sm font-mono">{client.mac}</TableCell>
                                        <TableCell>
                                            {client.interface === 'Ethernet' ? (
                                                <Badge variant="info" className="text-[10px]">🔌 Ethernet</Badge>
                                            ) : (
                                                <Badge variant="secondary" className="text-[10px] bg-cyan-500/10 text-cyan-400 border-transparent">📶 WiFi</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-sm font-mono">
                                            {client.rssi ? (
                                                <span className={`${Number(client.rssi) > -50 ? 'text-emerald-400' :
                                                    Number(client.rssi) > -70 ? 'text-amber-400' : 'text-red-400'
                                                    }`}>{client.rssi} dBm</span>
                                            ) : '—'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* TR-069 Parameters */}
            <Card className="bg-surface border-surface-border">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base text-on-surface flex items-center gap-2">
                            <HardDrive className="w-4 h-4 text-violet-400" /> TR-069 Parameters
                            {params && <span className="text-xs text-on-surface-muted font-normal">({filteredParams.length} of {params.length})</span>}
                        </CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-muted" />
                            <Input
                                placeholder="Filter parameters..."
                                value={paramSearch}
                                onChange={(e) => setParamSearch(e.target.value)}
                                className="pl-8 h-8 text-xs bg-surface-input border-surface-border text-on-surface placeholder:text-on-surface-muted"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="max-h-96 overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-surface-border hover:bg-transparent sticky top-0 bg-surface">
                                    <TableHead className="text-on-surface-secondary">Parameter</TableHead>
                                    <TableHead className="text-on-surface-secondary">Value</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredParams.length === 0 ? (
                                    <TableRow className="border-surface-border">
                                        <TableCell colSpan={2} className="text-center text-on-surface-muted py-8">
                                            {params?.length ? 'No matching parameters' : 'No parameters available'}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredParams.slice(0, 200).map((p) => (
                                        <TableRow key={p.id || p.name} className="border-surface-border">
                                            <TableCell className="text-on-surface-secondary text-xs font-mono break-all max-w-md">{p.name}</TableCell>
                                            <TableCell className="text-on-surface text-xs font-mono break-all max-w-xs">{p.value || '(empty)'}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
