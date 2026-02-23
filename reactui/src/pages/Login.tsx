import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Wifi, Loader2 } from 'lucide-react'

export default function LoginPage() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            // The /login POST endpoint redirects on success/failure
            // We use redirect: 'manual' to catch the redirect and inspect it
            const fd = new FormData()
            fd.append('username', username)
            fd.append('password', password)

            const res = await fetch('/login', {
                method: 'POST',
                body: fd,
                credentials: 'include',
                redirect: 'manual',
            })

            // Status 0 = opaque redirect (browser follows it)
            // Status 301/302 = redirect (we can read location)
            if (res.type === 'opaqueredirect' || res.status === 0) {
                // Login succeeded (redirect to /), navigate to React overview
                window.location.href = '/reactui/overview'
                return
            }

            if (res.status === 301 || res.status === 302) {
                const location = res.headers.get('Location') || ''
                if (location.includes('errmsg=')) {
                    const msg = decodeURIComponent(location.split('errmsg=')[1] || 'Login failed')
                    setError(msg)
                } else if (location === '/' || location === '') {
                    window.location.href = '/reactui/overview'
                    return
                } else {
                    setError('Login failed')
                }
            } else if (res.ok) {
                // Redirect happened and we ended up at the homepage
                window.location.href = '/reactui/overview'
                return
            } else {
                setError('Login failed')
            }
        } catch {
            setError('Connection error')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent" />
            <div className="absolute top-1/4 -left-20 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

            <Card className="w-full max-w-md mx-4 bg-slate-900/80 border-slate-700/50 backdrop-blur-xl shadow-2xl">
                <CardHeader className="text-center space-y-4">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                        <Wifi className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <CardTitle className="text-2xl font-bold text-white">TeamsACS</CardTitle>
                        <CardDescription className="text-slate-400 mt-1">TR-069 Auto Configuration Server</CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                                {error}
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="username" className="text-slate-300">Username</Label>
                            <Input
                                id="username"
                                type="text"
                                placeholder="Enter username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="bg-slate-800/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-slate-300">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="Enter password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="bg-slate-800/50 border-slate-600 text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                                required
                            />
                        </div>
                        <Button
                            type="submit"
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/25 transition-all duration-200"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                'Sign In'
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
