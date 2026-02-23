import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type ApiResponse } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Cog, Radio, Save, Check } from 'lucide-react'

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
        onSuccess: (res) => {
            if (res.code !== undefined && res.code !== 0) {
                setToast({ type: 'error', msg: res.msg || 'Save failed' })
            } else {
                setDirty(false)
                setToast({ type: 'success', msg: 'Settings saved successfully' })
                queryClient.invalidateQueries({ queryKey: ['config-values', activeTab] })
            }
            setTimeout(() => setToast(null), 3000)
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
    const labelMap: Record<string, { label: string; description: string }> = {
        SystemTitle: { label: 'System Title', description: 'The title displayed in the browser tab and header' },
        SystemTheme: { label: 'Theme', description: 'UI theme (light / dark)' },
        SystemLoginRemark: { label: 'Login Remark', description: 'Message shown on the login page' },
        SystemLoginSubtitle: { label: 'Login Subtitle', description: 'Subtitle on the login form' },
        TR069AccessAddress: { label: 'TR-069 Access Address', description: 'TeamsACS TR-069 server URL (HTTP/HTTPS)' },
        TR069AccessPassword: { label: 'TR-069 Access Password', description: 'Password for CPE to access TeamsACS' },
        CpeConnectionRequestPassword: { label: 'CPE Connection Password', description: 'Password for TeamsACS to access CPE' },
        CpeAutoRegister: { label: 'Auto Register CPE', description: 'Automatically register new CPE devices (enabled/disabled)' },
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
                        disabled={!dirty || saveMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40"
                    >
                        <Save className="w-4 h-4 mr-1" />
                        {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
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
                                return (
                                    <div key={key} className="space-y-1.5">
                                        <Label className="text-sm text-on-surface-secondary">{meta.label}</Label>
                                        {meta.description && (
                                            <p className="text-xs text-on-surface-muted">{meta.description}</p>
                                        )}
                                        <Input
                                            value={value}
                                            onChange={(e) => handleChange(key, e.target.value)}
                                            className="bg-surface-input border-surface-border text-on-surface placeholder:text-on-surface-muted"
                                        />
                                    </div>
                                )
                            })
                        ) : (
                            <div className="text-sm text-on-surface-muted py-4">Loading configuration...</div>
                        )
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
