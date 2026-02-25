import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Plus, Trash2, Loader2, Pencil, X, Save, MapPin, Cable
} from 'lucide-react'

interface OdcItem {
    id: string; name: string; location: string; address: string
    latitude: string; longitude: string; capacity: number
    olt_id: string; pon_port: string; remark: string
}

interface OdpItem {
    id: string; name: string; odc_id: string; location: string; address: string
    latitude: string; longitude: string; capacity: number
    used_ports: number; remark: string
}

interface OdcOption { id: string; name: string }

/* ──────────── ODC & ODP Page ──────────── */
export default function OdcOdpPage() {
    const [tab, setTab] = useState<'odc' | 'odp'>('odc')

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">ODC & ODP</h1>
                    <p className="text-sm text-on-surface-secondary mt-1">Manage Optical Distribution Cabinets & Points</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-surface-alt rounded-lg p-1 w-fit border border-surface-border">
                <button onClick={() => setTab('odc')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'odc' ? 'bg-blue-600 text-white shadow-sm' : 'text-on-surface-secondary hover:text-on-surface'}`}>
                    <Cable className="w-4 h-4 inline mr-1.5 -mt-0.5" />ODC
                </button>
                <button onClick={() => setTab('odp')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'odp' ? 'bg-blue-600 text-white shadow-sm' : 'text-on-surface-secondary hover:text-on-surface'}`}>
                    <MapPin className="w-4 h-4 inline mr-1.5 -mt-0.5" />ODP
                </button>
            </div>

            {tab === 'odc' ? <OdcSection /> : <OdpSection />}
        </div>
    )
}

/* ──────────── ODC Section ──────────── */
function OdcSection() {
    const [items, setItems] = useState<OdcItem[]>([])
    const [loading, setLoading] = useState(true)
    const [showAdd, setShowAdd] = useState(false)
    const [editId, setEditId] = useState<string | null>(null)
    const [form, setForm] = useState<Partial<OdcItem>>({})

    const fetch_ = () => {
        fetch('/admin/odc/list', { credentials: 'include' })
            .then(r => r.json()).then(d => { setItems(d || []); setLoading(false) })
            .catch(() => setLoading(false))
    }
    useEffect(() => { fetch_() }, [])

    const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        const res = await fetch('/admin/odc/add', { method: 'POST', body: fd, credentials: 'include' })
        const d = await res.json()
        if (d.code === 0) { setShowAdd(false); fetch_() }
        else alert(d.msg)
    }

    const handleUpdate = async () => {
        const fd = new FormData()
        fd.append('id', form.id || '')
        fd.append('name', form.name || '')
        fd.append('location', form.location || '')
        fd.append('address', form.address || '')
        fd.append('capacity', String(form.capacity || 0))
        fd.append('pon_port', form.pon_port || '')
        fd.append('latitude', form.latitude || '')
        fd.append('longitude', form.longitude || '')
        fd.append('remark', form.remark || '')
        await fetch('/admin/odc/update', { method: 'POST', body: fd, credentials: 'include' })
        setEditId(null); fetch_()
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this ODC?')) return
        const fd = new FormData(); fd.append('id', id)
        await fetch('/admin/odc/delete', { method: 'POST', body: fd, credentials: 'include' })
        fetch_()
    }

    if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button size="sm" onClick={() => setShowAdd(!showAdd)} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Plus className="w-4 h-4 mr-1" /> Add ODC
                </Button>
            </div>

            {showAdd && (
                <Card className="bg-surface border-surface-border">
                    <CardHeader className="pb-3"><CardTitle className="text-base text-on-surface">New ODC</CardTitle></CardHeader>
                    <CardContent>
                        <form onSubmit={handleAdd} className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <Field name="name" label="Name" placeholder="ODC-01" required />
                            <Field name="location" label="Location" placeholder="Area/Zone" />
                            <Field name="address" label="Address" placeholder="Full address" />
                            <Field name="capacity" label="Capacity" placeholder="8" type="number" />
                            <Field name="pon_port" label="PON Port" placeholder="gpon_olt-1/2/9" />
                            <Field name="latitude" label="Latitude" placeholder="-6.xxx" />
                            <Field name="longitude" label="Longitude" placeholder="106.xxx" />
                            <Field name="remark" label="Remark" placeholder="Notes" />
                            <div className="col-span-full flex justify-end">
                                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white"><Plus className="w-4 h-4 mr-1" />Save</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {items.length === 0 ? (
                <Card className="bg-surface border-surface-border">
                    <CardContent className="py-16 text-center">
                        <Cable className="w-12 h-12 mx-auto mb-3 text-on-surface-muted opacity-40" />
                        <p className="text-on-surface-secondary">No ODC devices configured</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-3">
                    {items.map(item => (
                        <Card key={item.id} className="bg-surface border-surface-border">
                            <CardContent className="p-4">
                                {editId === item.id ? (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <EditField label="Name" value={form.name || ''} onChange={v => setForm(f => ({ ...f, name: v }))} />
                                        <EditField label="Location" value={form.location || ''} onChange={v => setForm(f => ({ ...f, location: v }))} />
                                        <EditField label="Address" value={form.address || ''} onChange={v => setForm(f => ({ ...f, address: v }))} />
                                        <EditField label="Capacity" value={String(form.capacity || '')} onChange={v => setForm(f => ({ ...f, capacity: Number(v) }))} />
                                        <EditField label="PON Port" value={form.pon_port || ''} onChange={v => setForm(f => ({ ...f, pon_port: v }))} />
                                        <EditField label="Latitude" value={form.latitude || ''} onChange={v => setForm(f => ({ ...f, latitude: v }))} />
                                        <EditField label="Longitude" value={form.longitude || ''} onChange={v => setForm(f => ({ ...f, longitude: v }))} />
                                        <EditField label="Remark" value={form.remark || ''} onChange={v => setForm(f => ({ ...f, remark: v }))} />
                                        <div className="col-span-full flex gap-2 justify-end">
                                            <Button variant="outline" size="sm" onClick={() => setEditId(null)} className="border-surface-border text-on-surface-secondary"><X className="w-4 h-4 mr-1" />Cancel</Button>
                                            <Button size="sm" onClick={handleUpdate} className="bg-blue-600 hover:bg-blue-700 text-white"><Save className="w-4 h-4 mr-1" />Save</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-3">
                                            <div className="w-9 h-9 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0">
                                                <Cable className="w-4.5 h-4.5" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-on-surface">{item.name}</h3>
                                                <div className="flex items-center gap-3 mt-1 text-sm text-on-surface-secondary flex-wrap">
                                                    {item.location && <span>{item.location}</span>}
                                                    {item.pon_port && <><span className="text-on-surface-muted">|</span><span className="font-mono text-xs">{item.pon_port}</span></>}
                                                    {item.capacity > 0 && <><span className="text-on-surface-muted">|</span><span>Cap: {item.capacity}</span></>}
                                                </div>
                                                {item.address && <div className="text-xs text-on-surface-muted mt-1">{item.address}</div>}
                                            </div>
                                        </div>
                                        <div className="flex gap-1.5 shrink-0">
                                            <Button variant="outline" size="sm" onClick={() => { setEditId(item.id); setForm(item) }}
                                                className="border-surface-border text-on-surface-secondary hover:bg-surface-hover"><Pencil className="w-3.5 h-3.5" /></Button>
                                            <Button variant="outline" size="sm" onClick={() => handleDelete(item.id)}
                                                className="border-red-500/30 text-red-400 hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5" /></Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}

/* ──────────── ODP Section ──────────── */
function OdpSection() {
    const [items, setItems] = useState<OdpItem[]>([])
    const [odcOptions, setOdcOptions] = useState<OdcOption[]>([])
    const [loading, setLoading] = useState(true)
    const [showAdd, setShowAdd] = useState(false)
    const [editId, setEditId] = useState<string | null>(null)
    const [form, setForm] = useState<Partial<OdpItem>>({})

    const fetch_ = () => {
        Promise.all([
            fetch('/admin/odp/list', { credentials: 'include' }).then(r => r.json()),
            fetch('/admin/odc/options', { credentials: 'include' }).then(r => r.json()),
        ]).then(([odp, odc]) => { setItems(odp || []); setOdcOptions(odc || []); setLoading(false) })
            .catch(() => setLoading(false))
    }
    useEffect(() => { fetch_() }, [])

    const odcNameMap = Object.fromEntries(odcOptions.map(o => [o.id, o.name]))

    const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        const res = await fetch('/admin/odp/add', { method: 'POST', body: fd, credentials: 'include' })
        const d = await res.json()
        if (d.code === 0) { setShowAdd(false); fetch_() }
        else alert(d.msg)
    }

    const handleUpdate = async () => {
        const fd = new FormData()
        fd.append('id', form.id || '')
        fd.append('name', form.name || '')
        fd.append('odc_id', form.odc_id || '')
        fd.append('location', form.location || '')
        fd.append('address', form.address || '')
        fd.append('capacity', String(form.capacity || 0))
        fd.append('used_ports', String(form.used_ports || 0))
        fd.append('latitude', form.latitude || '')
        fd.append('longitude', form.longitude || '')
        fd.append('remark', form.remark || '')
        await fetch('/admin/odp/update', { method: 'POST', body: fd, credentials: 'include' })
        setEditId(null); fetch_()
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this ODP?')) return
        const fd = new FormData(); fd.append('id', id)
        await fetch('/admin/odp/delete', { method: 'POST', body: fd, credentials: 'include' })
        fetch_()
    }

    if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button size="sm" onClick={() => setShowAdd(!showAdd)} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Plus className="w-4 h-4 mr-1" /> Add ODP
                </Button>
            </div>

            {showAdd && (
                <Card className="bg-surface border-surface-border">
                    <CardHeader className="pb-3"><CardTitle className="text-base text-on-surface">New ODP</CardTitle></CardHeader>
                    <CardContent>
                        <form onSubmit={handleAdd} className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <Field name="name" label="Name" placeholder="ODP-01" required />
                            <div>
                                <Label className="text-on-surface-secondary text-xs">ODC</Label>
                                <select name="odc_id" className="w-full mt-1 rounded-md bg-surface-input border border-surface-border text-on-surface text-sm px-3 py-2">
                                    <option value="">— None —</option>
                                    {odcOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </select>
                            </div>
                            <Field name="location" label="Location" placeholder="Area/Zone" />
                            <Field name="address" label="Address" placeholder="Full address" />
                            <Field name="capacity" label="Capacity" placeholder="8" type="number" />
                            <Field name="latitude" label="Latitude" placeholder="-6.xxx" />
                            <Field name="longitude" label="Longitude" placeholder="106.xxx" />
                            <Field name="remark" label="Remark" placeholder="Notes" />
                            <div className="col-span-full flex justify-end">
                                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white"><Plus className="w-4 h-4 mr-1" />Save</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {items.length === 0 ? (
                <Card className="bg-surface border-surface-border">
                    <CardContent className="py-16 text-center">
                        <MapPin className="w-12 h-12 mx-auto mb-3 text-on-surface-muted opacity-40" />
                        <p className="text-on-surface-secondary">No ODP devices configured</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-3">
                    {items.map(item => (
                        <Card key={item.id} className="bg-surface border-surface-border">
                            <CardContent className="p-4">
                                {editId === item.id ? (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <EditField label="Name" value={form.name || ''} onChange={v => setForm(f => ({ ...f, name: v }))} />
                                        <div>
                                            <Label className="text-on-surface-secondary text-xs">ODC</Label>
                                            <select value={form.odc_id || ''} onChange={e => setForm(f => ({ ...f, odc_id: e.target.value }))}
                                                className="w-full mt-1 rounded-md bg-surface-input border border-surface-border text-on-surface text-sm px-3 py-2">
                                                <option value="">— None —</option>
                                                {odcOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                            </select>
                                        </div>
                                        <EditField label="Location" value={form.location || ''} onChange={v => setForm(f => ({ ...f, location: v }))} />
                                        <EditField label="Address" value={form.address || ''} onChange={v => setForm(f => ({ ...f, address: v }))} />
                                        <EditField label="Capacity" value={String(form.capacity || '')} onChange={v => setForm(f => ({ ...f, capacity: Number(v) }))} />
                                        <EditField label="Used Ports" value={String(form.used_ports || '')} onChange={v => setForm(f => ({ ...f, used_ports: Number(v) }))} />
                                        <EditField label="Latitude" value={form.latitude || ''} onChange={v => setForm(f => ({ ...f, latitude: v }))} />
                                        <EditField label="Longitude" value={form.longitude || ''} onChange={v => setForm(f => ({ ...f, longitude: v }))} />
                                        <div className="col-span-full flex gap-2 justify-end">
                                            <Button variant="outline" size="sm" onClick={() => setEditId(null)} className="border-surface-border text-on-surface-secondary"><X className="w-4 h-4 mr-1" />Cancel</Button>
                                            <Button size="sm" onClick={handleUpdate} className="bg-blue-600 hover:bg-blue-700 text-white"><Save className="w-4 h-4 mr-1" />Save</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-3">
                                            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                                                <MapPin className="w-4.5 h-4.5" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-on-surface">{item.name}</h3>
                                                <div className="flex items-center gap-3 mt-1 text-sm text-on-surface-secondary flex-wrap">
                                                    {item.odc_id && odcNameMap[item.odc_id] && <span className="text-cyan-400 text-xs bg-cyan-500/10 px-1.5 py-0.5 rounded">{odcNameMap[item.odc_id]}</span>}
                                                    {item.location && <span>{item.location}</span>}
                                                    {item.capacity > 0 && <><span className="text-on-surface-muted">|</span><span>Cap: {item.used_ports || 0}/{item.capacity}</span></>}
                                                </div>
                                                {item.address && <div className="text-xs text-on-surface-muted mt-1">{item.address}</div>}
                                            </div>
                                        </div>
                                        <div className="flex gap-1.5 shrink-0">
                                            <Button variant="outline" size="sm" onClick={() => { setEditId(item.id); setForm(item) }}
                                                className="border-surface-border text-on-surface-secondary hover:bg-surface-hover"><Pencil className="w-3.5 h-3.5" /></Button>
                                            <Button variant="outline" size="sm" onClick={() => handleDelete(item.id)}
                                                className="border-red-500/30 text-red-400 hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5" /></Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}

/* ──────────── Shared Components ──────────── */
function Field({ name, label, placeholder, required, type }: { name: string; label: string; placeholder?: string; required?: boolean; type?: string }) {
    return (
        <div>
            <Label className="text-on-surface-secondary text-xs">{label}</Label>
            <Input name={name} placeholder={placeholder} required={required} type={type || 'text'}
                className="bg-surface-input border-surface-border text-on-surface mt-1" />
        </div>
    )
}

function EditField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <div>
            <Label className="text-on-surface-secondary text-xs">{label}</Label>
            <Input value={value} onChange={e => onChange(e.target.value)}
                className="bg-surface-input border-surface-border text-on-surface mt-1" />
        </div>
    )
}
