/**
 * Fase 5 — Tally por evento (offline, sin BD ni red).
 * npm run test:fase5
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { nombreActorActividad } from '../src/lib/actividadTimeline'
import { autorGestion } from '../src/lib/gestionAutor'
import {
  TALLY_ENVIO_ESTADO_LABELS,
  TALLY_ENVIO_RAZON_LABELS,
  labelEstadoTallyEnvio,
  labelRazonTallyEnvio,
} from '../src/lib/tallyEnvioLabels'
import {
  construirWebhookUrl,
  enmascararWebhookUrl,
} from '../src/lib/tallyWebhookUrl'
import {
  claveEnvio,
  debeBuscarReenvio,
  extraerRespuestas,
  normalizarEmailTally,
  parseTallySpeaker,
  resolverEventoTally,
  type FormularioTally,
  type TallyField,
} from '../supabase/functions/_shared/tallyIntake.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'fase5-tally-payloads.json'), 'utf8'),
) as Record<string, Record<string, unknown>>

const GOV = '11111111-1111-1111-1111-111111111101'
const BOOT = '22222222-2222-2222-2222-222222222202'

const FORMS: FormularioTally[] = [
  {
    eventoId: GOV,
    tallyFormId: 'formQAGov',
    webhookToken: 'tok-gov-qa',
    activo: true,
  },
  {
    eventoId: BOOT,
    tallyFormId: 'formQABoot',
    webhookToken: 'tok-boot-qa',
    activo: true,
    mapeoCampos: {
      'organización / media outlet': 'empresa',
      'rol en el medio': 'cargo',
    },
  },
]

describe('claveEnvio', () => {
  it('usa submissionId; cae a responseId, eventId, luego hash', async () => {
    const gov = FIXTURE.govtech_like!
    const raw = JSON.stringify(gov)
    assert.equal(await claveEnvio(gov, raw), 'sub:sub-qa-01')

    const sinSub = FIXTURE.sin_submission!
    assert.equal(
      await claveEnvio(sinSub, JSON.stringify(sinSub)),
      'resp:resp-only-99',
    )

    const soloEvt = {
      eventId: 'evt-solo',
      data: { fields: [{ type: 'INPUT_TEXT', label: '', value: 'X' }] },
    }
    assert.equal(
      await claveEnvio(soloEvt, JSON.stringify(soloEvt)),
      'evt:evt-solo',
    )

    const sinIds = FIXTURE.sin_ids!
    const rawSin = JSON.stringify(sinIds)
    const k1 = await claveEnvio(sinIds, rawSin)
    const k2 = await claveEnvio(sinIds, rawSin)
    assert.match(k1, /^sha256:[0-9a-f]{64}$/)
    assert.equal(k1, k2)

    const otro = { ...sinIds, data: { ...(sinIds.data as object), x: 1 } }
    const k3 = await claveEnvio(otro, JSON.stringify(otro))
    assert.notEqual(k1, k3)
  })
})

describe('resolverEventoTally (Fase 5 motivos)', () => {
  it('token válido, formId registrado, dos eventos', () => {
    const a = resolverEventoTally({
      token: 'tok-gov-qa',
      formId: 'formQAGov',
      formularios: FORMS,
    })
    assert.equal(a.ok, true)
    if (a.ok) assert.equal(a.eventoId, GOV)

    const b = resolverEventoTally({
      token: null,
      formId: 'formQABoot',
      formularios: FORMS,
    })
    assert.equal(b.ok, true)
    if (b.ok) assert.equal(b.eventoId, BOOT)
  })

  it('token de otro formulario / inválido / sin identificador / desconocido / inactivo', () => {
    const cruzado = resolverEventoTally({
      token: 'tok-gov-qa',
      formId: 'formQABoot',
      formularios: FORMS,
    })
    assert.equal(cruzado.ok, false)
    if (!cruzado.ok) assert.equal(cruzado.motivo, 'token_invalido')

    const invalido = resolverEventoTally({
      token: 'tok-no-existe',
      formId: null,
      formularios: FORMS,
    })
    assert.equal(invalido.ok, false)
    if (!invalido.ok) assert.equal(invalido.motivo, 'token_invalido')

    const sinId = resolverEventoTally({
      token: null,
      formId: null,
      formularios: FORMS,
    })
    assert.equal(sinId.ok, false)
    if (!sinId.ok) assert.equal(sinId.motivo, 'sin_identificador')

    const desc = resolverEventoTally({
      token: null,
      formId: 'no-existe',
      formularios: FORMS,
    })
    assert.equal(desc.ok, false)
    if (!desc.ok) assert.equal(desc.motivo, 'form_desconocido')

    const inactivo = resolverEventoTally({
      token: null,
      formId: 'formQABoot',
      formularios: FORMS.map((f) =>
        f.eventoId === BOOT ? { ...f, activo: false } : f,
      ),
    })
    assert.equal(inactivo.ok, false)
    if (!inactivo.ok) assert.equal(inactivo.motivo, 'form_desconocido')
  })
})

describe('parseTallySpeaker + mapeo_campos', () => {
  it('regresión &nbsp; y mapeo de segundo formulario; ignora destinos prohibidos', () => {
    const fields = FIXTURE.govtech_like!.data as { fields: TallyField[] }
    const parsed = parseTallySpeaker(fields.fields)
    assert.equal(parsed.nombre, 'TEST QA Tally 01')
    assert.equal(parsed.email, 'test.qa.tally.01@example.invalid')
    assert.equal(parsed.cargo, 'CTO')
    assert.equal(parsed.empresa, 'Org QA Alpha')

    const bootFields = (FIXTURE.bootcamp_like!.data as { fields: TallyField[] })
      .fields
    const sinMapeo = parseTallySpeaker(bootFields)
    assert.equal(sinMapeo.empresa ?? null, null)
    assert.equal(sinMapeo.cargo ?? null, null)

    const conMapeo = parseTallySpeaker(bootFields, {
      'organización / media outlet': 'empresa',
      'rol en el medio': 'cargo',
      // prohibidos
      correo: 'email',
      'nombre completo': 'nombre',
      slug: 'toolkit_slug',
    })
    assert.equal(conMapeo.empresa, 'Org QA Beta')
    assert.equal(conMapeo.cargo, 'Editora')
    // email/nombre siguen por type, no por mapeo prohibido
    assert.equal(conMapeo.email, 'test.qa.tally.02@example.invalid')
    assert.equal(conMapeo.nombre, 'TEST QA Tally 02')
    assert.equal('toolkit_slug' in conMapeo, false)

    const base = parseTallySpeaker(fields.fields)
    const same = parseTallySpeaker(fields.fields, null)
    assert.deepEqual(same, base)
  })
})

describe('extraerRespuestas', () => {
  it('opción múltiple → texto, archivo → URL, vacíos omitidos, &nbsp; limpio', () => {
    const fields = (FIXTURE.govtech_like!.data as { fields: TallyField[] }).fields
    const resp = extraerRespuestas(fields)
    assert.ok(resp.every((r) => !('key' in r)))
    assert.ok(!resp.some((r) => r.label.toLowerCase().includes('notas vacías')))
    const tema = resp.find((r) => r.label.includes('Tema'))
    assert.ok(tema)
    assert.deepEqual(tema!.valor, ['IA pública', 'Datos abiertos'])
    const foto = resp.find((r) => r.label.toLowerCase().includes('material'))
    assert.ok(foto)
    assert.equal(foto!.valor, 'https://storage.tally.so/fake/qa01.jpg')
    assert.ok(!foto!.label.includes('&nbsp;'))
  })
})

describe('validación payload (nombre/email)', () => {
  it('sin nombre o sin email → inválido; con ambos → procesable', () => {
    const sinNombre = parseTallySpeaker([
      { type: 'INPUT_EMAIL', value: 'a@example.invalid' },
    ])
    assert.ok(!sinNombre.nombre)
    assert.ok(sinNombre.email)

    const sinEmail = parseTallySpeaker([
      { type: 'INPUT_TEXT', label: '', value: 'TEST QA Tally X' },
    ])
    assert.ok(sinEmail.nombre)
    assert.equal(normalizarEmailTally(sinEmail.email), null)

    const ok = parseTallySpeaker([
      { type: 'INPUT_TEXT', label: '', value: 'TEST QA Tally OK' },
      { type: 'INPUT_EMAIL', value: 'ok@example.invalid' },
    ])
    assert.ok(ok.nombre && ok.email)
  })
})

describe('enmascarar webhook token', () => {
  it('URL enmascarada no contiene el token; la copiada sí', () => {
    const token = 'super-secret-token-xyz'
    const full = construirWebhookUrl(
      'https://ydqbjyhcntszvrytdkml.supabase.co',
      token,
    )
    assert.ok(full.includes(token))
    const masked = enmascararWebhookUrl(full)
    assert.equal(masked.includes(token), false)
    assert.ok(masked.includes('••••••••'))
    assert.ok(masked.includes('tally-webhook'))
  })
})

describe('autorGestion', () => {
  it('gestión creado_por null + tally_envio_id → Tally; null sin envío → Sistema; con usuario → nombre', () => {
    assert.equal(autorGestion(null, 'envio-1', {}), 'Tally')
    assert.equal(autorGestion(null, null, {}), 'Sistema')
    assert.equal(
      autorGestion('u1', null, { u1: 'Alex Rivera' }),
      'Alex Rivera',
    )
    assert.equal(autorGestion('u-missing', 'envio-9', {}), 'Equipo')
  })
})

describe('debeBuscarReenvio', () => {
  it('true si ok o form_desconocido; false si token_invalido o sin_identificador', () => {
    assert.equal(
      debeBuscarReenvio({ ok: true, eventoId: 'e1' }),
      true,
    )
    assert.equal(
      debeBuscarReenvio({
        ok: false,
        status: 422,
        error: 'x',
        motivo: 'form_desconocido',
      }),
      true,
    )
    assert.equal(
      debeBuscarReenvio({
        ok: false,
        status: 422,
        error: 'x',
        motivo: 'token_invalido',
      }),
      false,
    )
    assert.equal(
      debeBuscarReenvio({
        ok: false,
        status: 422,
        error: 'x',
        motivo: 'sin_identificador',
      }),
      false,
    )
  })
})

describe('labels tally_envios + actor Actividad', () => {
  it('estados y razones en español', () => {
    assert.equal(labelEstadoTallyEnvio('pendiente_revision'), 'Por revisar')
    assert.equal(labelEstadoTallyEnvio('auto_vinculado'), 'Vinculado')
    assert.equal(labelRazonTallyEnvio('email_exacto'), 'Email exacto')
    assert.equal(
      labelRazonTallyEnvio('nombre+empresa'),
      'Mismo nombre y empresa',
    )
    assert.ok(Object.keys(TALLY_ENVIO_ESTADO_LABELS).length >= 8)
    assert.ok(Object.keys(TALLY_ENVIO_RAZON_LABELS).length >= 8)
  })

  it('Actividad: actor_id null + origen tally → Tally (cambios); gestiones usan autorGestion', () => {
    assert.equal(nombreActorActividad(null, 'tally', {}), 'Tally')
    assert.equal(nombreActorActividad(null, 'sistema', {}), 'Sistema')
    assert.equal(autorGestion(null, 'envio-t', {}), 'Tally')
  })
})
