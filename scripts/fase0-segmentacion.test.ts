/**
 * Fase 0 — segmentación por evento. Sin BD ni red.
 * npx tsx --test scripts/fase0-segmentacion.test.ts
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planAltaSpeaker } from '../src/lib/altaSpeaker.ts'
import { contarCheckboxesDeEvento } from '../src/lib/dashboardCheckboxes.ts'
import { quotePerteneceAlEvento } from '../src/lib/quoteEvento.ts'
import { normalizeSpeakerEmail } from '../src/lib/speakerEmail.ts'
import { toolkitUrl } from '../src/lib/toolkitLink.ts'
import {
  FIELD_MAP,
  generarToolkitSlug,
  normalizarEmailTally,
  normalizarLabel,
  parseTallySpeaker,
  planificarIntake,
  resolverEventoTally,
} from '../supabase/functions/_shared/tallyIntake.ts'

const GOVTECH = '2f042639-cc2d-4c06-bea3-f8316a3419c1'
const BOOTCAMP = 'ad088ecb-9a26-42fe-846e-779542848f99'
const MARIA = '74030097-c533-4163-8c96-51eabdf96948'

const FORMS = [
  {
    eventoId: GOVTECH,
    tallyFormId: 'pbNMvy',
    webhookToken: 'tok-gov',
    activo: true,
  },
  {
    eventoId: BOOTCAMP,
    tallyFormId: 'boot123',
    webhookToken: 'tok-boot',
    activo: true,
  },
]

describe('toolkit por evento', () => {
  it('sin dominio no arma URL y no cae al host de GovTech', () => {
    assert.equal(toolkitUrl(null, 'maria-jose-abc123'), null)
    assert.equal(toolkitUrl('  ', 'maria-jose-abc123'), null)
    assert.equal(toolkitUrl('https://speakers.govtechsummit.co', null), null)
  })

  it('usa la base del evento y le quita la barra final', () => {
    assert.equal(
      toolkitUrl('https://speakers.govtechsummit.co/', 'maria-jose-abc123'),
      'https://speakers.govtechsummit.co/maria-jose-abc123',
    )
    assert.equal(
      toolkitUrl('https://speakers.bootcamp.example', 'maria-jose-abc123'),
      'https://speakers.bootcamp.example/maria-jose-abc123',
    )
  })
})

describe('quotes del workspace', () => {
  it('una quote de GovTech no entra en Media Bootcamp', () => {
    assert.equal(quotePerteneceAlEvento(GOVTECH, BOOTCAMP), false)
    assert.equal(quotePerteneceAlEvento(BOOTCAMP, BOOTCAMP), true)
    assert.equal(quotePerteneceAlEvento(null, BOOTCAMP), false)
    assert.equal(quotePerteneceAlEvento(GOVTECH, ''), false)
  })
})

describe('KPI de checkboxes', () => {
  const propGov = 'prop-gov-toolkit'
  const propBoot = 'prop-boot-toolkit'
  const propBootFotos = 'prop-boot-fotos'
  const propBootF1 = 'prop-boot-f1'

  it('María José no suma el toolkit de Bootcamp', () => {
    const conteo = contarCheckboxesDeEvento(
      new Set(['otro-en-bootcamp']),
      [
        { speakerId: MARIA, propiedadId: propGov, valor: true },
        { speakerId: MARIA, propiedadId: propBoot, valor: true },
        { speakerId: 'otro-en-bootcamp', propiedadId: propBoot, valor: true },
        { speakerId: 'otro-en-bootcamp', propiedadId: propBootFotos, valor: 'true' },
        { speakerId: 'otro-en-bootcamp', propiedadId: propBootF1, valor: false },
      ],
      { toolkit: propBoot, fotos: propBootFotos, publicaron: propBootF1 },
    )
    assert.deepEqual(conteo, { toolkit: 1, fotos: 1, publicaron: 0 })
  })

  it('en GovTech sí cuenta si está asignada y la propiedad es de GovTech', () => {
    const conteo = contarCheckboxesDeEvento(
      new Set([MARIA]),
      [{ speakerId: MARIA, propiedadId: propGov, valor: true }],
      { toolkit: propGov },
    )
    assert.equal(conteo.toolkit, 1)
  })
})

describe('alta al pool global', () => {
  it('email nuevo crea; email existente asocia o abre, siempre con id global', () => {
    assert.deepEqual(
      planAltaSpeaker({ existenteId: null, asociarAlEvento: true }),
      { tipo: 'crear' },
    )
    assert.deepEqual(
      planAltaSpeaker({ existenteId: MARIA, asociarAlEvento: true }),
      { tipo: 'asociar_existente', speakerId: MARIA },
    )
    assert.deepEqual(
      planAltaSpeaker({ existenteId: MARIA, asociarAlEvento: false }),
      { tipo: 'abrir_existente', speakerId: MARIA },
    )
  })
})

describe('tally por evento', () => {
  it('normaliza labels con &nbsp; literal', () => {
    const [label, campo] = Object.entries(FIELD_MAP).find(([, c]) => c === 'cargo')!
    const comoTally = label.replace(/\u00a0/g, '&nbsp;')
    assert.equal(normalizarLabel(comoTally), normalizarLabel(label))
    const parsed = parseTallySpeaker([
      { type: 'INPUT_TEXT', label: '', value: 'María José' },
      { type: 'INPUT_EMAIL', value: ' Maria@Ejemplo.CO ' },
      { type: 'INPUT_TEXT', label: comoTally, value: 'CRO' },
    ])
    assert.equal(parsed.nombre, 'María José')
    assert.equal(parsed.email, 'maria@ejemplo.co')
    assert.equal(parsed[campo], 'CRO')
    assert.equal('toolkit_slug' in parsed, false)
    assert.equal(parsed.email, normalizeSpeakerEmail(' Maria@Ejemplo.CO '))
    assert.equal(normalizarEmailTally('  A@B.Co '), 'a@b.co')
  })

  it('el token del webhook ata el envío a su evento', () => {
    assert.deepEqual(
      resolverEventoTally({ token: 'tok-boot', formId: 'boot123', formularios: FORMS }),
      { ok: true, eventoId: BOOTCAMP },
    )
    assert.deepEqual(
      resolverEventoTally({ token: null, formId: 'pbNMvy', formularios: FORMS }),
      { ok: true, eventoId: GOVTECH },
    )
    const cruzado = resolverEventoTally({
      token: 'tok-boot',
      formId: 'pbNMvy',
      formularios: FORMS,
    })
    assert.equal(cruzado.ok, false)
    const desconocido = resolverEventoTally({
      token: null,
      formId: 'otro',
      formularios: FORMS,
    })
    assert.equal(desconocido.ok, false)
  })

  it('un formulario inactivo no recibe speakers', () => {
    const res = resolverEventoTally({
      token: null,
      formId: 'boot123',
      formularios: FORMS.map((f) =>
        f.eventoId === BOOTCAMP ? { ...f, activo: false } : f,
      ),
    })
    assert.equal(res.ok, false)
  })

  it('persona nueva: slug en la membresía, no en la ficha', () => {
    const plan = planificarIntake({
      eventoId: BOOTCAMP,
      speaker: { nombre: 'Ana Pérez', email: 'ana@boot.test', cargo: 'Editora' },
      existenteId: null,
      shortId: 'ab12cd',
    })
    assert.equal(plan.accion, 'crear')
    if (plan.accion !== 'crear') return
    assert.equal(plan.eventoId, BOOTCAMP)
    assert.equal(plan.toolkitSlug, generarToolkitSlug('Ana Pérez', 'ab12cd'))
    assert.equal('toolkit_slug' in plan.speaker, false)
    assert.equal(plan.speaker.cargo, 'Editora')
    assert.equal(plan.speaker.fuente, 'tally')
  })

  it('email ya existente: no pisa ficha ni copia toolkit de otro evento', () => {
    const plan = planificarIntake({
      eventoId: BOOTCAMP,
      speaker: {
        nombre: 'María José',
        email: 'maria@ejemplo.co',
        cargo: 'Otro cargo',
        toolkit_slug: 'no-debe-copiarse',
      },
      existenteId: MARIA,
      shortId: 'ffffff',
    })
    assert.deepEqual(plan, {
      accion: 'duplicado',
      eventoId: BOOTCAMP,
      speakerId: MARIA,
      email: 'maria@ejemplo.co',
    })
  })
})
