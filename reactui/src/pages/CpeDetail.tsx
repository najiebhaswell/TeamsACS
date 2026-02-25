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
    Pencil, Save, X, Check, Loader2, Lock, Eye, EyeOff,
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
    oui: string
    product_class: string
    pon_sn_hex: string
    pon_mode: string
    registration_id: string
    task_tags: string
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
    password: string
    type: string
    enable: string
    vlan_id: string
    ipv6_ip: string
    ip_mode: string
    dev_idx: string
    conn_idx: string
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

    // WAN edit state
    const [wanEditKey, setWanEditKey] = useState<string | null>(null)
    const [wanForm, setWanForm] = useState({ username: '', password: '', vlan_id: '', enable: 'true', ip_mode: '' })
    const [wanSaving, setWanSaving] = useState(false)

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

    const { data: tr069Settings } = useQuery({
        queryKey: ['tr069-settings'],
        queryFn: () => api.get<Record<string, string>>('/admin/settings/tr069/query'),
    })

    const wifiList: WifiItem[] = (() => {
        try {
            const all: WifiItem[] = device?.wifi_ssid ? JSON.parse(device.wifi_ssid) : []
            // Filter out entries with empty SSID names (internal/unused)
            return all.filter(w => w.ssid && w.ssid.trim() !== '')
        } catch { return [] }
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

    // Extract ONT web credentials from params, fallback to settings defaults
    const findParamValue = (...suffixes: string[]) => {
        if (!params) return ''
        for (const p of params) {
            for (const s of suffixes) {
                if (p.name.endsWith(s) && p.value) return p.value
            }
        }
        return ''
    }
    // Super Admin credentials (from device params or settings defaults)
    const adminCreds = (() => {
        const username = findParamValue(
            'X_CT-COM_TeleComAccount.Username',
            'X_CMCC_TeleComAccount.Username',
            'X_CU_Function.Web.AdminName',
            'X_Authentication.WebAccount.Username',
            'User.1.Username',
        ) || tr069Settings?.OntWebAdminUsername || ''
        const password = findParamValue(
            'X_CT-COM_TeleComAccount.Password',
            'X_CMCC_TeleComAccount.Password',
            'X_ZTE-COM_WebUserInfo.AdminPassword',
            'X_ZTE-COM_UserInterface.X_ZTE-COM_WebUserInfo.AdminPassword',
            'X_CU_Function.Web.AdminPassword',
            'X_HW_WebUserInfo.2.Password',
            'X_FH_Account.X_FH_WebUserInfo.WebSuperPassword',
            'X_Authentication.WebAccount.Password',
            'User.1.Password',
        ) || tr069Settings?.OntWebAdminPassword || ''
        if (!username && !password) return null
        return { username, password }
    })()
    // Regular User credentials (from device params or settings defaults)
    const userCreds = (() => {
        const username = findParamValue(
            'X_CU_Function.Web.UserName',
            'X_ZTE-COM_WebUserInfo.UserName',
            'X_ZTE-COM_UserInterface.X_ZTE-COM_WebUserInfo.UserName',
            'X_HW_WebUserInfo.1.UserName',
            'X_FH_Account.X_FH_WebUserInfo.WebUsername',
            'User.2.Username',
        ) || tr069Settings?.OntWebUserUsername || ''
        const password = findParamValue(
            'X_CU_Function.Web.UserPassword',
            'X_ZTE-COM_WebUserInfo.UserPassword',
            'X_ZTE-COM_UserInterface.X_ZTE-COM_WebUserInfo.UserPassword',
            'X_HW_WebUserInfo.1.Password',
            'X_FH_Account.X_FH_WebUserInfo.WebPassword',
            'User.2.Password',
        ) || tr069Settings?.OntWebUserPassword || ''
        if (!username && !password) return null
        return { username, password }
    })()
    const [showAdminPass, setShowAdminPass] = useState(false)
    const [showUserPass, setShowUserPass] = useState(false)

    // ONT Web Login edit state
    const [editingCreds, setEditingCreds] = useState(false)
    const [credsSaving, setCredsSaving] = useState(false)
    const [credsForm, setCredsForm] = useState({
        adminUser: '', adminPass: '', userUser: '', userPass: ''
    })

    const startEditCreds = () => {
        setCredsForm({
            adminUser: adminCreds?.username || '',
            adminPass: adminCreds?.password || '',
            userUser: userCreds?.username || '',
            userPass: userCreds?.password || '',
        })
        setEditingCreds(true)
    }

    const saveCreds = async () => {
        setCredsSaving(true)
        try {
            const form = new FormData()
            form.append('ctype', 'tr069')
            form.append('OntWebAdminUsername', credsForm.adminUser)
            form.append('OntWebAdminPassword', credsForm.adminPass)
            form.append('OntWebUserUsername', credsForm.userUser)
            form.append('OntWebUserPassword', credsForm.userPass)
            await fetch('/admin/settings/update', { method: 'POST', body: form })
            queryClient.invalidateQueries({ queryKey: ['tr069-settings'] })

            // Auto-push to this device
            if (device?.sn) {
                const pushForm = new FormData()
                pushForm.append('sn', device.sn)
                await fetch('/admin/supervise/webcreds/push', { method: 'POST', body: pushForm })
            }

            setEditingCreds(false)
            showToast('success', 'Credentials saved & pushed to device')
        } catch {
            showToast('error', 'Failed to update credentials')
        } finally {
            setCredsSaving(false)
        }
    }

    // Normalize enable value: ZTE uses '1'/'0', GMEDIA uses 'true'/'false'
    const isEnabled = (v: string) => v === 'true' || v === '1'

    const showToast = (type: 'success' | 'error', msg: string) => {
        setToast({ type, msg })
        setTimeout(() => setToast(null), 3000)
    }

    const handleWifiEdit = (wifi: WifiItem) => {
        setWifiEditIdx(wifi.idx)
        setWifiForm({ ssid: wifi.ssid, password: wifi.password || '', channel: wifi.channel || '', enable: isEnabled(wifi.enable) ? 'true' : 'false' })
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

    const handleWanEdit = (wan: WanItem) => {
        const key = `${wan.dev_idx}-${wan.conn_idx}-${wan.type}`
        setWanEditKey(key)
        setWanForm({
            username: wan.username || '',
            password: wan.password || '',
            vlan_id: wan.vlan_id || '',
            enable: isEnabled(wan.enable) ? 'true' : 'false',
            ip_mode: wan.ip_mode || '',
        })
    }

    const handleWanSave = async (wan: WanItem) => {
        if (!device) return
        setWanSaving(true)
        try {
            const res = await api.postForm<ApiResponse>('/admin/supervise/wan/set', {
                devid: String(device.id),
                dev_idx: wan.dev_idx,
                conn_idx: wan.conn_idx,
                conn_type: wan.type,
                username: wanForm.username,
                password: wanForm.password,
                vlan_id: wanForm.vlan_id,
                enable: wanForm.enable,
                ip_mode: wanForm.ip_mode,
            })
            if (res.code === 0) {
                showToast('success', 'WAN command sent — changes will apply on device')
                queryClient.setQueryData(['cpe-detail', id], (prev: NetCpe | undefined) => {
                    if (!prev) return prev
                    try {
                        const wList: WanItem[] = prev.wan_info ? JSON.parse(prev.wan_info) : []
                        const updated = wList.map(w => {
                            const wKey = `${w.dev_idx}-${w.conn_idx}-${w.type}`
                            if (wKey === wanEditKey) {
                                return { ...w, username: wanForm.username, password: wanForm.password, vlan_id: wanForm.vlan_id, enable: wanForm.enable, ip_mode: wanForm.ip_mode }
                            }
                            return w
                        })
                        return { ...prev, wan_info: JSON.stringify(updated) }
                    } catch { return prev }
                })
                setWanEditKey(null)
            } else {
                showToast('error', res.msg || 'Failed to set WAN')
            }
        } catch {
            showToast('error', 'Request failed')
        } finally {
            setWanSaving(false)
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                {/* Left column: Device Info + Network & Registration */}
                <div className="flex flex-col gap-4">
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

                    {/* Network & Registration */}
                    <Card className="bg-surface border-surface-border">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base text-on-surface flex items-center gap-2">
                                <Network className="w-4 h-4 text-violet-400" /> Network & Registration
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-0">
                            <InfoRow label="PON SN" value={device.pon_sn_hex} mono />
                            <InfoRow label="OUI" value={device.oui} mono />
                            <InfoRow label="Product Class" value={device.product_class} />
                            <InfoRow label="PON Mode" value={device.pon_mode} />
                            <InfoRow label="Registration ID" value={device.registration_id} mono />
                            <InfoRow label="Registered" value={device.created_at ? new Date(device.created_at).toLocaleString() : undefined} />
                            <InfoRow label="Tags" value={device.task_tags} />
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
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-surface-input rounded-lg p-3 text-center">
                                    <Signal className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                                    <div className="text-[10px] text-on-surface-secondary mb-0.5">RX Power</div>
                                    <div className="text-lg font-bold text-on-surface font-mono">
                                        {device.fiber_rx_power ? device.fiber_rx_power.replace(/\s*dBm\s*/gi, '').trim() : '—'}
                                    </div>
                                    {device.fiber_rx_power && <div className="text-[10px] text-on-surface-muted">dBm</div>}
                                </div>
                                <div className="bg-surface-input rounded-lg p-3 text-center">
                                    <Signal className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                                    <div className="text-[10px] text-on-surface-secondary mb-0.5">TX Power</div>
                                    <div className="text-lg font-bold text-on-surface font-mono">
                                        {device.fiber_tx_power ? device.fiber_tx_power.replace(/\s*dBm\s*/gi, '').trim() : '—'}
                                    </div>
                                    {device.fiber_tx_power && <div className="text-[10px] text-on-surface-muted">dBm</div>}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right column: System Status + ONT Web Login */}
                <div className="flex flex-col gap-4">
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

                    {/* ONT Web Login */}
                    {(adminCreds || userCreds) && (
                        <Card className={`bg-surface border-surface-border ${editingCreds ? 'ring-2 ring-amber-500/30' : ''}`}>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base text-on-surface flex items-center gap-2">
                                    <Lock className="w-4 h-4 text-amber-400" /> ONT Web Login
                                    <div className="ml-auto flex items-center gap-1">
                                        {editingCreds ? (
                                            <>
                                                <Button size="sm" variant="ghost" onClick={() => setEditingCreds(false)} className="h-6 px-2 text-xs text-on-surface-secondary">
                                                    <X className="w-3 h-3 mr-1" /> Cancel
                                                </Button>
                                                <Button size="sm" onClick={saveCreds} disabled={credsSaving} className="h-6 px-2 text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30">
                                                    {credsSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />} Save
                                                </Button>
                                            </>
                                        ) : (
                                            <Button size="sm" variant="ghost" onClick={startEditCreds} className="h-6 px-2 text-xs text-on-surface-secondary hover:text-amber-400">
                                                <Pencil className="w-3 h-3" />
                                            </Button>
                                        )}
                                    </div>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-0">
                                {/* Super Admin */}
                                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 space-y-2 mb-3">
                                    <span className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wider">Super Admin</span>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-on-surface-secondary uppercase w-14">User</span>
                                            {editingCreds ? (
                                                <Input value={credsForm.adminUser} onChange={e => setCredsForm(f => ({ ...f, adminUser: e.target.value }))}
                                                    className="h-7 text-sm bg-surface-input border-surface-border text-on-surface font-mono flex-1" placeholder="Username" />
                                            ) : (
                                                <span className="text-sm text-on-surface font-mono truncate">{adminCreds?.username || '—'}</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-on-surface-secondary uppercase w-14">Pass</span>
                                            {editingCreds ? (
                                                <Input value={credsForm.adminPass} onChange={e => setCredsForm(f => ({ ...f, adminPass: e.target.value }))}
                                                    className="h-7 text-sm bg-surface-input border-surface-border text-on-surface font-mono flex-1" placeholder="Password" />
                                            ) : (
                                                <>
                                                    <span className="text-sm text-on-surface font-mono">
                                                        {showAdminPass ? (adminCreds?.password || '—') : (adminCreds?.password ? '••••••••' : '—')}
                                                    </span>
                                                    {adminCreds?.password && (
                                                        <button onClick={() => setShowAdminPass(!showAdminPass)} className="text-on-surface-muted hover:text-on-surface ml-auto">
                                                            {showAdminPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {/* User */}
                                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
                                    <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">User</span>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-on-surface-secondary uppercase w-14">User</span>
                                            {editingCreds ? (
                                                <Input value={credsForm.userUser} onChange={e => setCredsForm(f => ({ ...f, userUser: e.target.value }))}
                                                    className="h-7 text-sm bg-surface-input border-surface-border text-on-surface font-mono flex-1" placeholder="Username" />
                                            ) : (
                                                <span className="text-sm text-on-surface font-mono truncate">{userCreds?.username || '—'}</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-on-surface-secondary uppercase w-14">Pass</span>
                                            {editingCreds ? (
                                                <Input value={credsForm.userPass} onChange={e => setCredsForm(f => ({ ...f, userPass: e.target.value }))}
                                                    className="h-7 text-sm bg-surface-input border-surface-border text-on-surface font-mono flex-1" placeholder="Password" />
                                            ) : (
                                                <>
                                                    <span className="text-sm text-on-surface font-mono">
                                                        {showUserPass ? (userCreds?.password || '—') : (userCreds?.password ? '••••••••' : '—')}
                                                    </span>
                                                    {userCreds?.password && (
                                                        <button onClick={() => setShowUserPass(!showUserPass)} className="text-on-surface-muted hover:text-on-surface ml-auto">
                                                            {showUserPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* WAN Connections */}
                    <Card className="bg-surface border-surface-border">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base text-on-surface flex items-center gap-2">
                                <Globe className="w-4 h-4 text-indigo-400" /> WAN Connections
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {wanList.length === 0 ? (
                                <div className="text-sm text-on-surface-muted p-4">No WAN data</div>
                            ) : (
                                <div className="overflow-x-hidden">
                                    <Table className="table-fixed w-full">
                                        <TableHeader>
                                            <TableRow className="border-surface-border hover:bg-transparent">
                                                <TableHead className="text-on-surface-secondary w-[28%]">Name</TableHead>
                                                <TableHead className="text-on-surface-secondary w-[8%]">VLAN</TableHead>
                                                <TableHead className="text-on-surface-secondary w-[22%]">IP</TableHead>
                                                <TableHead className="text-on-surface-secondary w-[18%]">PPPoE</TableHead>
                                                <TableHead className="text-on-surface-secondary w-[8%]">Mode</TableHead>
                                                <TableHead className="text-on-surface-secondary w-[8%]">Status</TableHead>
                                                <TableHead className="text-on-surface-secondary w-[8%] text-right">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {wanList.map((wan) => {
                                                const wanKey = `${wan.dev_idx}-${wan.conn_idx}-${wan.type}`
                                                const isWanEditing = wanEditKey === wanKey
                                                return (
                                                    <TableRow key={wanKey} className={`border-surface-border ${isWanEditing ? 'bg-blue-500/5' : ''}`}>
                                                        <TableCell className="overflow-hidden">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-on-surface font-medium text-xs truncate">{wan.name || `WAN ${wan.dev_idx}.${wan.conn_idx}`}</span>
                                                                <Badge variant="info" className="text-[9px] px-1 py-0 shrink-0">{wan.type}</Badge>
                                                            </div>
                                                            {wan.service && <div className="text-[10px] text-on-surface-muted truncate">{wan.service}</div>}
                                                        </TableCell>
                                                        <TableCell>
                                                            {isWanEditing ? (
                                                                <Input
                                                                    value={wanForm.vlan_id}
                                                                    onChange={e => setWanForm(f => ({ ...f, vlan_id: e.target.value }))}
                                                                    className="h-6 text-xs bg-surface-input border-surface-border text-on-surface font-mono w-14"
                                                                    placeholder="VLAN"
                                                                />
                                                            ) : (
                                                                <span className="text-on-surface-secondary text-xs font-mono">{wan.vlan_id || '—'}</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="overflow-hidden">
                                                            <div className="text-on-surface-secondary text-xs font-mono truncate">{wan.ip || '—'}</div>
                                                            {wan.ipv6_ip && <div className="text-on-surface-muted text-[10px] font-mono truncate" title={wan.ipv6_ip}>{wan.ipv6_ip}</div>}
                                                        </TableCell>
                                                        <TableCell className="overflow-hidden">
                                                            {isWanEditing && wan.type === 'PPPoE' ? (
                                                                <div className="space-y-1">
                                                                    <Input
                                                                        value={wanForm.username}
                                                                        onChange={e => setWanForm(f => ({ ...f, username: e.target.value }))}
                                                                        className="h-6 text-xs bg-surface-input border-surface-border text-on-surface font-mono w-full"
                                                                        placeholder="Username"
                                                                    />
                                                                    <Input
                                                                        value={wanForm.password}
                                                                        onChange={e => setWanForm(f => ({ ...f, password: e.target.value }))}
                                                                        className="h-6 text-xs bg-surface-input border-surface-border text-on-surface font-mono w-full"
                                                                        placeholder="Password"
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="text-on-surface-secondary text-xs font-mono truncate" title={wan.username}>{wan.username || '—'}</div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {isWanEditing ? (
                                                                <select
                                                                    value={wanForm.ip_mode}
                                                                    onChange={e => setWanForm(f => ({ ...f, ip_mode: e.target.value }))}
                                                                    className="h-6 text-[10px] bg-surface-input border border-surface-border text-on-surface rounded px-1"
                                                                >
                                                                    <option value="IPv4">IPv4</option>
                                                                    <option value="IPv6">IPv6</option>
                                                                    <option value="Dual Stack">Dual</option>
                                                                </select>
                                                            ) : (
                                                                <span className="text-on-surface-secondary text-xs">{wan.ip_mode || '—'}</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {isWanEditing ? (
                                                                <select
                                                                    value={wanForm.enable}
                                                                    onChange={e => setWanForm(f => ({ ...f, enable: e.target.value }))}
                                                                    className="h-6 text-[10px] bg-surface-input border border-surface-border text-on-surface rounded px-1"
                                                                >
                                                                    <option value="true">On</option>
                                                                    <option value="false">Off</option>
                                                                </select>
                                                            ) : (
                                                                <Badge variant={isEnabled(wan.enable) ? 'success' : 'warning'} className="text-[9px]">
                                                                    {isEnabled(wan.enable) ? 'On' : 'Off'}
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {isWanEditing ? (
                                                                <div className="flex gap-0.5 justify-end">
                                                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-400 hover:text-green-300"
                                                                        onClick={() => handleWanSave(wan)} disabled={wanSaving}>
                                                                        {wanSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                                                    </Button>
                                                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                                                                        onClick={() => setWanEditKey(null)} disabled={wanSaving}>
                                                                        <X className="w-3 h-3" />
                                                                    </Button>
                                                                </div>
                                                            ) : (
                                                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-on-surface-secondary hover:text-on-surface"
                                                                    onClick={() => handleWanEdit(wan)}>
                                                                    <Pencil className="w-3 h-3" />
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
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
                                    <TableHead className="text-on-surface-secondary w-16">Band</TableHead>
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
                                                <Badge variant={parseInt(wifi.channel) >= 36 ? 'warning' : 'info'} className="text-[10px] px-1.5 py-0">
                                                    {parseInt(wifi.channel) >= 36 ? '5G' : '2.4G'}
                                                </Badge>
                                            </TableCell>
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
                                                    isEnabled(wifi.enable) ? (
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
