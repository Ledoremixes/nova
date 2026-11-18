import { supabase } from './supabase'

// Le RPC con privilegi elevati non devono più essere richiamate con la
// publishable/anon key da un browser. Il server verifica JWT e ruolo Nova.
export async function secureOrchideaRpc(functionName, args = {}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (sessionError || !token) {
    return {
      data: null,
      error: { code: 'NOVA_AUTH_REQUIRED', message: 'Accedi a Nova per eseguire questa operazione.' },
    }
  }

  try {
    const response = await fetch('/api/orchidea-students?rpc=1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      body: JSON.stringify({ functionName, args }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload.ok) {
      return {
        data: null,
        error: {
          code: String(payload.code || response.status),
          message: payload.error || `Errore operazione Nova (${response.status}).`,
        },
      }
    }
    return { data: payload.data ?? null, error: null }
  } catch (error) {
    return {
      data: null,
      error: {
        code: 'NOVA_SERVER_UNAVAILABLE',
        message: 'Collegamento sicuro con il server Nova non disponibile.',
        details: String(error?.message || ''),
      },
    }
  }
}
