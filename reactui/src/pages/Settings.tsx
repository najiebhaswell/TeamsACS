import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type ApiResponse } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Cog, Radio, Save, Check, Eye, EyeOff, Loader2, Image, Upload, Trash2 } from 'lucide-react'

interface ConfigItem {
    name: string
    title: string
    icon: string
}

interface ConfigValues {
    [key: string]: string
}

const tabIcons: Record<string, typeof Cog> = {
    system: Cog,
    tr069: Radio,
}

const tabColors: Record<string, string> = {
    system: 'text-blue-400',
    tr069: 'text-cyan-400',
}

export default function SettingsPage() {
    const queryClient = useQueryClient()
    const [activeTab, setActiveTab] = useState('system')
    const [form, setForm] = useState<ConfigValues>({})
    const [dirty, setDirty] = useState(false)
    const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
    const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({})
    const [pushingAll, setPushingAll] = useState(false)

    const { data: configList } = useQuery({
        queryKey: ['config-list'],
        queryFn: () => api.get<ConfigItem[]>('/admin/settings/configlist'),
    })

    const { data: configValues, isLoading } = useQuery({
        queryKey: ['config-values', activeTab],
        queryFn: () => api.get<ConfigValues>(`/admin/settings/${activeTab}/query`),
    })

    // Sync form when config values load or tab changes
    useEffect(() => {
        if (configValues && !dirty) {
            setForm({ ...configValues })
        }
    }, [configValues, activeTab])

    const saveMutation = useMutation({
        mutationFn: async (values: ConfigValues) => {
            const payload: Record<string, string> = { ctype: activeTab, ...values }
            return api.postForm<ApiResponse>('/admin/settings/update', payload)
        },
        onSuccess: async (res) => {
            if (res.code !== undefined && res.code !== 0) {
                setToast({ type: 'error', msg: res.msg || 'Save failed' })
            } else {
                setDirty(false)
                queryClient.invalidateQueries({ queryKey: ['config-values', activeTab] })
                queryClient.invalidateQueries({ queryKey: ['tr069-settings'] })

                // Auto-push to all ONTs when saving TR-069 settings
                if (activeTab === 'tr069') {
                    setPushingAll(true)
                    try {
                        const pushRes = await fetch('/admin/supervise/webcreds/pushall', { method: 'POST' })
                        const pushData = await pushRes.json()
                        setToast({ type: 'success', msg: pushData.msg || 'Settings saved & pushed to all devices' })
                    } catch {
                        setToast({ type: 'success', msg: 'Settings saved, but push to devices failed' })
                    } finally {
                        setPushingAll(false)
                    }
                } else {
                    setToast({ type: 'success', msg: 'Settings saved successfully' })
                }
            }
            setTimeout(() => setToast(null), 4000)
        },
        onError: () => {
            setToast({ type: 'error', msg: 'Failed to save settings' })
            setTimeout(() => setToast(null), 3000)
        },
    })

    const handleTabChange = (tab: string) => {
        setActiveTab(tab)
        setForm({})
        setDirty(false)
    }

    const handleChange = (key: string, value: string) => {
        setForm(prev => ({ ...prev, [key]: value }))
        setDirty(true)
    }

    const handleSave = () => {
        saveMutation.mutate(form)
    }

    const handleReset = () => {
        if (configValues) setForm({ ...configValues })
        setDirty(false)
    }

    // Friendly labels for config keys
    const labelMap: Record<string, { label: string; description: string; sensitive?: boolean }> = {
        SystemTitle: { label: 'System Title', description: 'The title displayed in the browser tab and header' },
        SystemTheme: { label: 'Theme', description: 'UI theme (light / dark)' },
        SystemLoginRemark: { label: 'Login Remark', description: 'Message shown on the login page' },
        SystemLoginSubtitle: { label: 'Login Subtitle', description: 'Subtitle on the login form' },
        TR069AccessAddress: { label: 'TR-069 Access Address', description: 'TeamsACS TR-069 server URL (HTTP/HTTPS)' },
        TR069AccessPassword: { label: 'TR-069 Access Password', description: 'Password for CPE to access TeamsACS', sensitive: true },
        CpeConnectionRequestPassword: { label: 'CPE Connection Password', description: 'Password for TeamsACS to access CPE', sensitive: true },
        CpeAutoRegister: { label: 'Auto Register CPE', description: 'Automatically register new CPE devices (enabled/disabled)' },
        OntWebAdminUsername: { label: 'ONT Super Admin Username', description: 'Default super admin username pushed to all ONT devices' },
        OntWebAdminPassword: { label: 'ONT Super Admin Password', description: 'Default super admin password pushed to all ONT devices', sensitive: true },
        OntWebUserUsername: { label: 'ONT User Username', description: 'Default user username pushed to all ONT devices' },
        OntWebUserPassword: { label: 'ONT User Password', description: 'Default user password pushed to all ONT devices', sensitive: true },
        CpePeriodicInformInterval: { label: 'Periodic Inform Interval', description: 'Interval in seconds for CPE periodic inform (default: 60)' },
    }

    return (
        <div className="space-y-6">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg flex items-center gap-2 ${toast.type === 'success' ? 'bg-emerald-600 text-on-surface' : 'bg-red-600 text-on-surface'
                    }`}>
                    {toast.type === 'success' && <Check className="w-4 h-4" />}
                    {toast.msg}
                </div>
            )}

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-on-surface">Settings</h1>
                    <p className="text-on-surface-secondary text-sm mt-1">System and TR-069 configuration</p>
                </div>
                <div className="flex gap-2">
                    {dirty && (
                        <Button variant="outline" size="sm" onClick={handleReset} className="border-surface-border text-on-surface-secondary hover:bg-surface-hover">
                            Reset
                        </Button>
                    )}
                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={!dirty || saveMutation.isPending || pushingAll}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40"
                    >
                        {(saveMutation.isPending || pushingAll) ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                        {pushingAll ? 'Pushing to devices...' : saveMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-surface p-1 rounded-lg border border-surface-border w-fit">
                {(configList || []).map((cfg) => {
                    const Icon = tabIcons[cfg.name] || Cog
                    const isActive = activeTab === cfg.name
                    return (
                        <button
                            key={cfg.name}
                            onClick={() => handleTabChange(cfg.name)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${isActive
                                ? 'bg-surface-hover text-on-surface shadow-sm'
                                : 'text-on-surface-secondary hover:text-on-surface hover:bg-surface-input'
                                }`}
                        >
                            <Icon className={`w-4 h-4 ${isActive ? tabColors[cfg.name] || 'text-blue-400' : ''}`} />
                            {cfg.title}
                        </button>
                    )
                })}
            </div>

            {/* Config Form */}
            <Card className="bg-surface border-surface-border">
                <CardHeader className="pb-4">
                    <CardTitle className="text-base text-on-surface flex items-center gap-2">
                        {(() => { const Icon = tabIcons[activeTab] || Cog; return <Icon className={`w-4 h-4 ${tabColors[activeTab]}`} /> })()}
                        {(configList || []).find(c => c.name === activeTab)?.title || activeTab}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    {isLoading ? (
                        Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="space-y-2">
                                <div className="h-4 w-32 bg-surface-skeleton rounded animate-pulse" />
                                <div className="h-10 bg-surface-skeleton rounded animate-pulse" />
                            </div>
                        ))
                    ) : (
                        Object.entries(form).length > 0 ? (
                            Object.entries(form).map(([key, value]) => {
                                const meta = labelMap[key] || { label: key, description: '' }
                                const isSensitive = 'sensitive' in meta && meta.sensitive
                                const isVisible = showSensitive[key]
                                return (
                                    <div key={key} className="space-y-1.5">
                                        <Label className="text-sm text-on-surface-secondary">{meta.label}</Label>
                                        {meta.description && (
                                            <p className="text-xs text-on-surface-muted">{meta.description}</p>
                                        )}
                                        <div className="relative">
                                            <Input
                                                type={isSensitive && !isVisible ? 'password' : 'text'}
                                                value={value}
                                                onChange={(e) => handleChange(key, e.target.value)}
                                                className="bg-surface-input border-surface-border text-on-surface placeholder:text-on-surface-muted pr-10"
                                            />
                                            {isSensitive && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowSensitive(prev => ({ ...prev, [key]: !prev[key] }))}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-muted hover:text-on-surface"
                                                >
                                                    {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })
                        ) : (
                            <div className="text-sm text-on-surface-muted py-4">Loading configuration...</div>
                        )
                    )}
                </CardContent>
            </Card>

            {/* Logo Upload */}
            <LogoUploadCard showToast={(type: 'success' | 'error', msg: string) => {
                setToast({ type, msg })
                setTimeout(() => setToast(null), 3000)
            }} />
        </div>
    )
}

function LogoUploadCard({ showToast }: { showToast: (type: 'success' | 'error', msg: string) => void }) {
    const fileRef = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)
    const [logoInfo, setLogoInfo] = useState<{ exists: boolean; url?: string } | null>(null)

    const fetchLogoInfo = () => {
        fetch('/admin/settings/logo/info', { credentials: 'include' })
            .then(r => r.json())
            .then(d => setLogoInfo(d))
            .catch(() => { })
    }

    useEffect(() => { fetchLogoInfo() }, [])

    // Resize image using canvas before upload
    const resizeImage = (file: File): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            // SVG: skip resize
            if (file.type === 'image/svg+xml') {
                resolve(file)
                return
            }
            const img = new window.Image()
            img.onload = () => {
                const MAX_W = 360, MAX_H = 115
                let w = img.width, h = img.height
                // Scale down maintaining aspect ratio
                if (w > MAX_W || h > MAX_H) {
                    const ratio = Math.min(MAX_W / w, MAX_H / h)
                    w = Math.round(w * ratio)
                    h = Math.round(h * ratio)
                }
                const canvas = document.createElement('canvas')
                canvas.width = w
                canvas.height = h
                const ctx = canvas.getContext('2d')!
                ctx.drawImage(img, 0, 0, w, h)
                canvas.toBlob(blob => {
                    if (blob) resolve(blob)
                    else reject(new Error('Failed to resize'))
                }, 'image/png')
            }
            img.onerror = () => reject(new Error('Failed to load image'))
            img.src = URL.createObjectURL(file)
        })
    }

    const handleUpload = async (file: File) => {
        setUploading(true)
        try {
            const resized = await resizeImage(file)
            const fd = new FormData()
            fd.append('logo', resized, 'logo.png')
            const res = await fetch('/admin/settings/logo/upload', {
                method: 'POST',
                body: fd,
                credentials: 'include',
            })
            const data = await res.json()
            if (data.code === 0) {
                showToast('success', 'Logo uploaded!')
                fetchLogoInfo()
            } else {
                showToast('error', data.msg || 'Upload failed')
            }
        } catch {
            showToast('error', 'Upload failed')
        } finally {
            setUploading(false)
            if (fileRef.current) fileRef.current.value = ''
        }
    }

    return (
        <Card className="bg-surface border-surface-border">
            <CardHeader className="pb-4">
                <CardTitle className="text-base text-on-surface flex items-center gap-2">
                    <Image className="w-4 h-4 text-violet-400" />
                    Custom Logo
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-start gap-6">
                    {/* Preview */}
                    <div className="w-48 h-16 rounded-lg border border-dashed border-surface-border flex items-center justify-center bg-surface-input overflow-hidden shrink-0">
                        {logoInfo?.exists && logoInfo.url ? (
                            <img src={logoInfo.url + '?t=' + Date.now()} alt="Current logo" className="max-h-14 max-w-[180px] object-contain" />
                        ) : (
                            <span className="text-xs text-on-surface-muted">No logo set</span>
                        )}
                    </div>

                    {/* Upload */}
                    <div className="flex-1 space-y-3">
                        <p className="text-sm text-on-surface-secondary">
                            Upload a logo (PNG, JPG, SVG, WebP). Auto-resized to fit sidebar.
                        </p>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".png,.jpg,.jpeg,.svg,.webp"
                            className="hidden"
                            onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]) }}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            className="border-surface-border text-on-surface-secondary hover:bg-surface-hover"
                        >
                            {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                            {uploading ? 'Uploading...' : 'Choose File'}
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
