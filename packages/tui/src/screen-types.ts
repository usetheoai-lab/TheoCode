
export type Mode = 'chat' | 'plan' | 'ask' | 'select' | 'progress'

export interface ToastPayload {
  message: string
  variant: 'info' | 'success' | 'error'
  durationMs?: number
}

export interface ContentPanel {
  titulo: string
  corpo: string
}
