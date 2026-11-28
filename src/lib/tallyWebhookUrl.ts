/** Construye la URL pública del webhook Tally para un token. */
export function construirWebhookUrl(
  supabaseUrl: string,
  token: string,
  functionSlug = 'tally-webhook',
): string {
  const base = supabaseUrl.replace(/\/$/, '')
  return `${base}/functions/v1/${functionSlug}?token=${token}`
}

/**
 * Enmascara el token en la URL: `...?token=••••••••`
 * La URL resultante nunca contiene el token en claro.
 * (No usa URLSearchParams.set para evitar percent-encoding de los bullets.)
 */
export function enmascararWebhookUrl(url: string): string {
  return url.replace(/([?&]token=)[^&]*/i, '$1••••••••')
}
