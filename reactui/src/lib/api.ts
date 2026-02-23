const BASE = ''

function getCsrfToken(): string {
    const match = document.cookie.match(/csrf_token=([^;]+)/)
    return match ? match[1] : ''
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
        'X-CSRF-Token': getCsrfToken(),
        ...(options.headers as Record<string, string> || {}),
    }

    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json'
    }

    const res = await fetch(BASE + url, {
        credentials: 'include',
        ...options,
        headers,
    })

    if (res.status === 401) {
        window.location.href = '/reactui/login'
        throw new Error('Unauthorized')
    }

    return res.json()
}

export interface ApiResponse<T = unknown> {
    code: number
    msg: string
    data?: T
}

export interface PageResult<T> {
    total_count: number
    pos: number
    data: T[]
}

export const api = {
    get: <T>(url: string) => request<T>(url),

    post: <T>(url: string, body?: Record<string, unknown> | FormData) => {
        if (body instanceof FormData) {
            return request<T>(url, { method: 'POST', body })
        }
        return request<T>(url, { method: 'POST', body: JSON.stringify(body) })
    },

    postForm: <T>(url: string, data: Record<string, string>) => {
        const fd = new FormData()
        Object.entries(data).forEach(([k, v]) => fd.append(k, v))
        return request<T>(url, { method: 'POST', body: fd })
    },
}
