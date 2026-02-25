import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Server, Plus, Trash2, TestTube, Wifi, WifiOff, Loader2,
    CheckCircle, XCircle, RefreshCw
} from 'lucide-react'

interface OltDevice {
    id: string
    name: string
    ip_address: string
    snmp_port: number
    snmp_community: string
    manufacturer: string
    model: string
    status: string
    sys_name: string
    sys_descr: string
    sys_uptime: string
    last_poll_at: string
}

export default function OltDevicesPage() {
    const [olts, setOlts] = useState<OltDevice[]>([])
    const [loading, setLoading] = useState(true)
    const [showAdd, setShowAdd] = useState(false)
    const [testing, setTesting] = useState<string | null>(null)
    const [testResult, setTestResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null)

    const fetchOlts = () => {
        fetch('/admin/olt/list', { credentials: 'include' })
            .then(r => r.json())
            .then(d => { setOlts(d || []); setLoading(false) })
            .catch(() => setLoading(false))
    }

    useEffect(() => { fetchOlts() }, [])

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this OLT?')) return
        const fd = new FormData()
        fd.append('id', id)
        await fetch('/admin/olt/delete', { method: 'POST', body: fd, credentials: 'include' })
        fetchOlts()
    }

    const handleTest = async (olt: OltDevice) => {
        setTesting(olt.id)
        setTestResult(null)
        const fd = new FormData()
        fd.append('ip_address', olt.ip_address)
        fd.append('snmp_port', String(olt.snmp_port))
        fd.append('snmp_community', olt.snmp_community)
        const res = await fetch('/admin/olt/test', { method: 'POST', body: fd, credentials: 'include' })
        const d = await res.json()
        setTesting(null)
        setTestResult({ id: olt.id, ok: d.code === 0, msg: d.msg + (d.data?.SysName ? ` — ${d.data.SysName}` : '') })
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">OLT Devices</h1>
                    <p className="text-sm text-on-surface-secondary mt-1">Manage OLT devices for SNMP ONU monitoring</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={fetchOlts}
                        className="border-surface-border text-on-surface-secondary hover:bg-surface-hover">
                        <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                    </Button>
                    <Button size="sm" onClick={() => setShowAdd(!showAdd)}
                        className="bg-blue-600 hover:bg-blue-700 text-white">
                        <Plus className="w-4 h-4 mr-1" /> Add OLT
                    </Button>
                </div>
            </div>

            {showAdd && <AddOltForm onAdded={() => { setShowAdd(false); fetchOlts() }} />}

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
            ) : olts.length === 0 ? (
                <Card className="bg-surface border-surface-border">
                    <CardContent className="py-16 text-center">
                        <Server className="w-12 h-12 mx-auto mb-3 text-on-surface-muted opacity-40" />
                        <p className="text-on-surface-secondary">No OLT devices configured</p>
                        <p className="text-sm text-on-surface-muted mt-1">Click "Add OLT" to start monitoring</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {olts.map(olt => (
                        <Card key={olt.id} className="bg-surface border-surface-border">
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-4">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${olt.status === 'online' ? 'bg-green-500/15 text-green-500' : 'bg-red-500/15 text-red-400'
                                            }`}>
                                            {olt.status === 'online' ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-on-surface">{olt.name || 'Unnamed OLT'}</h3>
                                            <div className="flex items-center gap-4 mt-1.5 text-sm text-on-surface-secondary">
                                                <span>{olt.ip_address}:{olt.snmp_port}</span>
                                                <span className="text-on-surface-muted">|</span>
                                                <span>{olt.manufacturer} {olt.model}</span>
                                                {olt.sys_name && <>
                                                    <span className="text-on-surface-muted">|</span>
                                                    <span>{olt.sys_name}</span>
                                                </>}
                                            </div>
                                            {olt.sys_uptime && (
                                                <div className="text-xs text-on-surface-muted mt-1">
                                                    Uptime: {olt.sys_uptime}
                                                    {olt.last_poll_at && ` · Last poll: ${new Date(olt.last_poll_at).toLocaleString()}`}
                                                </div>
                                            )}
                                            {testResult?.id === olt.id && (
                                                <div className={`mt-2 text-sm flex items-center gap-1.5 ${testResult.ok ? 'text-green-500' : 'text-red-400'}`}>
                                                    {testResult.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                                    {testResult.msg}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <Button variant="outline" size="sm"
                                            onClick={() => handleTest(olt)}
                                            disabled={testing === olt.id}
                                            className="border-surface-border text-on-surface-secondary hover:bg-surface-hover">
                                            {testing === olt.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
                                        </Button>
                                        <Button variant="outline" size="sm"
                                            onClick={() => handleDelete(olt.id)}
                                            className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}

function AddOltForm({ onAdded }: { onAdded: () => void }) {
    const [saving, setSaving] = useState(false)
    const nameRef = useRef<HTMLInputElement>(null)

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setSaving(true)
        const fd = new FormData(e.currentTarget)
        const body = {
            name: fd.get('name'),
            ip_address: fd.get('ip_address'),
            snmp_port: Number(fd.get('snmp_port')) || 161,
            snmp_community: fd.get('snmp_community'),
            model: fd.get('model') || 'C620',
        }
        const res = await fetch('/admin/olt/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            credentials: 'include',
        })
        const d = await res.json()
        setSaving(false)
        if (d.code === 0) onAdded()
        else alert(d.msg)
    }

    return (
        <Card className="bg-surface border-surface-border">
            <CardHeader className="pb-4">
                <CardTitle className="text-base text-on-surface">Add New OLT</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                        <Label className="text-on-surface-secondary text-xs">Name</Label>
                        <Input ref={nameRef} name="name" placeholder="OLT-Main" required
                            className="bg-surface-input border-surface-border text-on-surface mt-1" />
                    </div>
                    <div>
                        <Label className="text-on-surface-secondary text-xs">IP Address</Label>
                        <Input name="ip_address" placeholder="43.245.184.1" required
                            className="bg-surface-input border-surface-border text-on-surface mt-1" />
                    </div>
                    <div>
                        <Label className="text-on-surface-secondary text-xs">SNMP Port</Label>
                        <Input name="snmp_port" type="number" defaultValue="1611" required
                            className="bg-surface-input border-surface-border text-on-surface mt-1" />
                    </div>
                    <div>
                        <Label className="text-on-surface-secondary text-xs">Community</Label>
                        <Input name="snmp_community" defaultValue="gVaj6fzevh9P" required
                            className="bg-surface-input border-surface-border text-on-surface mt-1" />
                    </div>
                    <div>
                        <Label className="text-on-surface-secondary text-xs">Model</Label>
                        <Input name="model" defaultValue="C620"
                            className="bg-surface-input border-surface-border text-on-surface mt-1" />
                    </div>
                    <div className="flex items-end">
                        <Button type="submit" disabled={saving}
                            className="bg-blue-600 hover:bg-blue-700 text-white w-full">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                            Save
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    )
}
