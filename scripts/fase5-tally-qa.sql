-- Fase 5 — QA de epms.registrar_tally_envio (SOLO datos TEST, todo en UNA llamada).
--
-- Cómo correrlo: el OWNER del proyecto lo ejecuta en el SQL Editor de Supabase
-- DESPUÉS de aplicar las migraciones Fase 5 (20261129_fase5_tally.sql y, si
-- aplica, 20261130_fase5_tally_inmutable_search_path.sql).
-- NO lo ejecuta el agente de Cursor ni ningún automatismo.
--
-- Crea eventos y speakers "TEST QA Tally …" (emails @example.invalid), corre los casos a–k,
-- verifica con aserciones, BORRA todo lo que creó y devuelve la tabla de resultados.
-- Si algo lanza excepción, toda la llamada se revierte (no queda nada).
-- No toca filas reales: aborta si ya existen datos "TEST QA Tally".
CREATE TEMP TABLE qa_res (n serial, caso text, ok boolean, detalle text);
DO $qa$
DECLARE
  ea uuid; eb uuid;
  s_fill uuid; s_homo uuid; s_d1 uuid; s_d2 uuid; s_ema uuid; s_nmb uuid;
  r jsonb; r2 jsonb;
  v_cnt int; v_cnt2 int; v_txt text; v_txt2 text; v_id uuid; v_sp uuid; v_env uuid;
  n_sp0 int; n_env_a int;
  fn text := 'epms.registrar_tally_envio(text, text, uuid, text, timestamptz, jsonb, jsonb, jsonb, text, text)';
BEGIN
  -- guardia: no tocar nada real
  IF EXISTS (SELECT 1 FROM epms.speakers WHERE nombre LIKE 'TEST QA Tally%' OR email ILIKE 'test.qa.tally%@example.invalid')
     OR EXISTS (SELECT 1 FROM epms.eventos WHERE nombre LIKE 'TEST QA Tally%')
     OR EXISTS (SELECT 1 FROM epms.tally_envios WHERE clave LIKE 'qa5:%') THEN
    RAISE EXCEPTION 'Ya existen datos TEST QA Tally: limpiar antes de correr';
  END IF;
  -- ── seed (antes de la 1ª llamada a la RPC, que fija epms.cambio_origen='tally') ──
  INSERT INTO epms.eventos (nombre) VALUES ('TEST QA Tally Evento A') RETURNING id INTO ea;
  INSERT INTO epms.eventos (nombre) VALUES ('TEST QA Tally Evento B') RETURNING id INTO eb;
  INSERT INTO epms.speakers (nombre, email, empresa, pais, telefono, fuente)
  VALUES ('TEST QA Tally Fill', 'test.qa.tally.fill@example.invalid', 'Org QA Fill', 'Colombia', '+57 300 111 2233', 'admin_manual')
  RETURNING id INTO s_fill;
  INSERT INTO epms.speakers (nombre, empresa, fuente) VALUES ('TEST QA Tally Homonimo', 'Org QA Homonimo', 'admin_manual') RETURNING id INTO s_homo;
  INSERT INTO epms.speakers (nombre, empresa, fuente) VALUES ('TEST QA Tally Doble', 'Org QA Uno', 'admin_manual') RETURNING id INTO s_d1;
  INSERT INTO epms.speakers (nombre, empresa, fuente) VALUES ('TEST QA Tally Doble', 'Org QA Dos', 'admin_manual') RETURNING id INTO s_d2;
  INSERT INTO epms.speakers (nombre, email, fuente) VALUES ('TEST QA Tally PersonaA', 'test.qa.tally.persona-a@example.invalid', 'admin_manual') RETURNING id INTO s_ema;
  INSERT INTO epms.speakers (nombre, fuente) VALUES ('TEST QA Tally PersonaB', 'admin_manual') RETURNING id INTO s_nmb;
  INSERT INTO epms.evento_speakers (evento_id, speaker_id, estado) VALUES (ea, s_fill, 'CONFIRMADO');
  SELECT count(*) INTO n_sp0 FROM epms.speakers;
  -- ── (a) persona nueva ──
  r := epms.registrar_tally_envio('qa5:a', 'formQA-A', ea, 'sub-a', now(), '{"qa":true}',
    '{"nombre":"TEST QA Tally Nueva","email":"test.qa.tally.nueva@example.invalid","cargo":"CTO","empresa":"Org QA Nueva"}',
    '[]', 'test-qa-tally-nueva-aaaaaa', 'procesar');
  v_sp := (r->>'speaker_id')::uuid; v_env := (r->>'envio_id')::uuid;
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('a estado creado/sin_coincidencia',
    r->>'estado'='creado' AND r->>'razon'='sin_coincidencia' AND (r->>'speaker_creado')::boolean AND NOT (r->>'replay')::boolean, r::text);
  INSERT INTO qa_res(caso, ok, detalle) SELECT 'a speaker fuente=tally + membresía PENDIENTE_CONTACTAR + slug + aceptado_id',
    s.fuente='tally' AND es.estado='PENDIENTE_CONTACTAR' AND es.toolkit_slug='test-qa-tally-nueva-aaaaaa' AND es.tally_envio_aceptado_id=v_env, s.fuente||'/'||es.estado
    FROM epms.speakers s JOIN epms.evento_speakers es ON es.speaker_id=s.id AND es.evento_id=ea WHERE s.id=v_sp;
  SELECT count(*) INTO v_cnt FROM epms.evento_speaker_gestiones WHERE tally_envio_id=v_env AND creado_por IS NULL AND tipo='otro' AND speaker_id=v_sp AND evento_id=ea;
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('a 1 gestión (autor null, tally_envio_id)', v_cnt=1, v_cnt::text);
  SELECT count(*) INTO v_cnt FROM epms.speaker_cambios WHERE tally_envio_id=v_env AND origen='tally' AND speaker_id=v_sp;
  SELECT count(*) INTO v_cnt2 FROM epms.speaker_cambios WHERE speaker_id=v_sp AND origen<>'tally';
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('a speaker_cambios origen=tally con tally_envio_id (alta + membresía), ninguno con otro origen', v_cnt>=2 AND v_cnt2=0, v_cnt||' tally / '||v_cnt2||' otros');
  -- ── (b) replay ──
  SELECT count(*) INTO v_cnt FROM epms.evento_speaker_gestiones;
  SELECT count(*) INTO v_cnt2 FROM epms.speaker_cambios;
  SELECT count(*) INTO n_env_a FROM epms.tally_envios;
  r2 := epms.registrar_tally_envio('qa5:a', 'formQA-A', ea, 'sub-a', now(), '{"qa":"otro payload"}',
    '{"nombre":"TEST QA Tally Nueva","email":"test.qa.tally.nueva@example.invalid","cargo":"OTRO"}', '[]', 'otro-slug-zzzzzz', 'procesar');
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('b replay=true, mismo envío y speaker',
    (r2->>'replay')::boolean AND r2->>'envio_id'=r->>'envio_id' AND r2->>'speaker_id'=r->>'speaker_id', r2::text);
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('b replay no escribe nada (gestiones, cambios, envíos, cargo)',
    v_cnt=(SELECT count(*) FROM epms.evento_speaker_gestiones)
    AND v_cnt2=(SELECT count(*) FROM epms.speaker_cambios)
    AND n_env_a=(SELECT count(*) FROM epms.tally_envios)
    AND (SELECT cargo FROM epms.speakers WHERE id=v_sp)='CTO', 'ok');
  -- ── (c) email exacto, cargo vacío → fill; no baja el estado; nombre/email intactos ──
  r := epms.registrar_tally_envio('qa5:c', 'formQA-A', ea, 'sub-c', now(), '{"qa":true}',
    '{"nombre":"Otro Nombre Tally","email":"TEST.QA.Tally.Fill@example.invalid","cargo":"VP","empresa":"org qa fill ","pais":"Colombia ","telefono":"573001112233","ciudad":"Bogotá"}',
    '[]', 'no-debe-usarse-111111', 'procesar');
  v_env := (r->>'envio_id')::uuid;
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('c auto_vinculado/email_exacto sin conflictos (empresa/pais/telefono equivalentes no son conflicto)',
    r->>'estado'='auto_vinculado' AND r->>'razon'='email_exacto' AND r->>'speaker_id'=s_fill::text AND NOT (r->>'speaker_creado')::boolean, r::text);
  INSERT INTO qa_res(caso, ok, detalle) SELECT 'c cargo y ciudad rellenados; nombre, email, empresa, pais, telefono intactos',
    cargo='VP' AND ciudad='Bogotá' AND nombre='TEST QA Tally Fill' AND email='test.qa.tally.fill@example.invalid' AND empresa='Org QA Fill' AND pais='Colombia' AND telefono='+57 300 111 2233', cargo||'/'||ciudad
    FROM epms.speakers WHERE id=s_fill;
  INSERT INTO qa_res(caso, ok, detalle) SELECT 'c membresía EA sigue CONFIRMADO y tally_envio_aceptado_id = este envío',
    estado='CONFIRMADO' AND tally_envio_aceptado_id=v_env, estado FROM epms.evento_speakers WHERE evento_id=ea AND speaker_id=s_fill;
  SELECT count(*) INTO v_cnt FROM epms.speaker_cambios WHERE tally_envio_id=v_env AND origen='tally' AND campo IN ('cargo','ciudad') AND ambito='speaker';
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('c speaker_cambios cargo y ciudad con origen=tally y tally_envio_id (trigger Fase 3 lee el set_config)', v_cnt=2, v_cnt::text);
  SELECT count(*) INTO v_cnt FROM epms.evento_speaker_gestiones WHERE tally_envio_id=v_env;
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('c 1 gestión del envío', v_cnt=1, v_cnt::text);
  -- ── (d) email exacto con valor distinto → conflicto, no pisa ──
  r := epms.registrar_tally_envio('qa5:d', 'formQA-A', ea, 'sub-d', now(), '{"qa":true}',
    '{"nombre":"TEST QA Tally Fill","email":"test.qa.tally.fill@example.invalid","cargo":"Otro","pais":"Mexico","ciudad":"Medellín"}', '[]', null, 'procesar');
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('d pendiente_revision/email_exacto_con_conflictos con 3 conflictos (cargo, pais, ciudad)',
    r->>'estado'='pendiente_revision' AND r->>'razon'='email_exacto_con_conflictos'
    AND (SELECT count(*) FROM epms.tally_envios t, jsonb_array_elements(t.conflictos) c WHERE t.id=(r->>'envio_id')::uuid AND c->>'campo' IN ('cargo','pais','ciudad'))=3, r::text);
  INSERT INTO qa_res(caso, ok, detalle) SELECT 'd cargo, pais y ciudad NO cambian',
    cargo='VP' AND pais='Colombia' AND ciudad='Bogotá', cargo||'/'||pais||'/'||ciudad FROM epms.speakers WHERE id=s_fill;
  INSERT INTO qa_res(caso, ok, detalle) SELECT 'd aceptado_id se queda en el envío c (no se mueve con revisión)',
    tally_envio_aceptado_id=(SELECT id FROM epms.tally_envios WHERE clave='qa5:c'), 'ok' FROM epms.evento_speakers WHERE evento_id=ea AND speaker_id=s_fill;
  SELECT count(*) INTO v_cnt FROM epms.evento_speaker_gestiones WHERE tally_envio_id=(r->>'envio_id')::uuid;
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('d igual deja gestión', v_cnt=1, v_cnt::text);
  -- ── (e) nombre+empresa sin email conocido → persona nueva, revisión, original intacto ──
  r := epms.registrar_tally_envio('qa5:e', 'formQA-A', ea, 'sub-e', now(), '{"qa":true}',
    '{"nombre":"test qa tally  HOMÓNIMO","email":"test.qa.tally.homonimo2@example.invalid","empresa":"ORG QA Homonimo","cargo":"X"}', '[]', 'test-qa-homonimo2-bbbbbb', 'procesar');
  v_sp := (r->>'speaker_id')::uuid;
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('e pendiente_revision/nombre+empresa, speaker NUEVO (≠ homónimo), 1 candidato = el TEST original',
    r->>'estado'='pendiente_revision' AND r->>'razon'='nombre+empresa' AND (r->>'speaker_creado')::boolean AND v_sp<>s_homo
    AND (SELECT t.candidatos->0->>'speaker_id' FROM epms.tally_envios t WHERE t.id=(r->>'envio_id')::uuid)=s_homo::text
    AND (SELECT jsonb_array_length(t.candidatos) FROM epms.tally_envios t WHERE t.id=(r->>'envio_id')::uuid)=1, r::text);
  INSERT INTO qa_res(caso, ok, detalle) SELECT 'e el homónimo original no cambió (sin email, sin cargo)', email IS NULL AND cargo IS NULL AND empresa='Org QA Homonimo', 'ok' FROM epms.speakers WHERE id=s_homo;
  INSERT INTO qa_res(caso, ok, detalle) SELECT 'e membresía del nuevo creada y SIN tally_envio_aceptado_id', count(*)=1 AND bool_and(tally_envio_aceptado_id IS NULL), 'ok' FROM epms.evento_speakers WHERE evento_id=ea AND speaker_id=v_sp;
  -- ── (f) varios candidatos ──
  r := epms.registrar_tally_envio('qa5:f', 'formQA-A', ea, 'sub-f', now(), '{"qa":true}',
    '{"nombre":"TEST QA Tally Doble","email":"test.qa.tally.doble3@example.invalid"}', '[]', 'test-qa-doble3-cccccc', 'procesar');
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('f multiples_candidatos con 2 candidatos y persona nueva',
    r->>'estado'='pendiente_revision' AND r->>'razon'='multiples_candidatos' AND (r->>'speaker_creado')::boolean
    AND (SELECT jsonb_array_length(t.candidatos) FROM epms.tally_envios t WHERE t.id=(r->>'envio_id')::uuid)=2, r::text);
  -- ── (g) email de una persona, nombre de otra ──
  r := epms.registrar_tally_envio('qa5:g', 'formQA-A', ea, 'sub-g', now(), '{"qa":true}',
    '{"nombre":"TEST QA Tally PersonaB","email":"test.qa.tally.persona-a@example.invalid","cargo":"Dir"}', '[]', null, 'procesar');
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('g email_otra_persona: vincula por email a PersonaA, marcado revisión, candidato PersonaB',
    r->>'estado'='pendiente_revision' AND r->>'razon'='email_otra_persona' AND r->>'speaker_id'=s_ema::text
    AND (SELECT t.candidatos->0->>'speaker_id' FROM epms.tally_envios t WHERE t.id=(r->>'envio_id')::uuid)=s_nmb::text, r::text);
  INSERT INTO qa_res(caso, ok, detalle) SELECT 'g PersonaB intacta (no se fusionó ni se rellenó)', cargo IS NULL AND email IS NULL, 'ok' FROM epms.speakers WHERE id=s_nmb;
  -- ── (h) mismo speaker, segundo evento/formulario ──
  r := epms.registrar_tally_envio('qa5:h', 'formQA-B', eb, 'sub-h', now(), '{"qa":true}',
    '{"nombre":"TEST QA Tally Fill","email":"test.qa.tally.fill@example.invalid","cargo":"VP"}', '[]', 'no-slug-en-existentes-dddddd', 'procesar');
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('h EB: auto_vinculado al mismo speaker', r->>'estado'='auto_vinculado' AND r->>'speaker_id'=s_fill::text, r::text);
  INSERT INTO qa_res(caso, ok, detalle) SELECT 'h membresía EB nueva PENDIENTE_CONTACTAR sin slug; EA sigue CONFIRMADO',
    (SELECT estado FROM epms.evento_speakers WHERE evento_id=eb AND speaker_id=s_fill)='PENDIENTE_CONTACTAR'
    AND (SELECT toolkit_slug FROM epms.evento_speakers WHERE evento_id=eb AND speaker_id=s_fill) IS NULL
    AND (SELECT estado FROM epms.evento_speakers WHERE evento_id=ea AND speaker_id=s_fill)='CONFIRMADO', 'ok';
  INSERT INTO qa_res(caso, ok, detalle) SELECT 'h el envío de EB no pisa el aceptado_id de EA',
    (SELECT tally_envio_aceptado_id FROM epms.evento_speakers WHERE evento_id=ea AND speaker_id=s_fill)=(SELECT id FROM epms.tally_envios WHERE clave='qa5:c'), 'ok';
  -- ── (i) desconocido / inválido: no crean speakers ──
  SELECT count(*) INTO v_cnt FROM epms.speakers;
  r := epms.registrar_tally_envio('qa5:i1', 'formX', NULL, NULL, now(), '{"x":1}', '{}', '[]', NULL, 'desconocido');
  r2 := epms.registrar_tally_envio('qa5:i2', 'formQA-A', ea, NULL, now(), '{"x":2}', '{"email":"x"}', '[]', NULL, 'invalido');
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('i desconocido/invalido guardan el envío y no crean speakers ni gestiones',
    r->>'estado'='formulario_desconocido' AND r->>'evento_id' IS NULL AND r2->>'estado'='invalido' AND r2->>'razon'='payload_invalido'
    AND v_cnt=(SELECT count(*) FROM epms.speakers)
    AND NOT EXISTS (SELECT 1 FROM epms.evento_speaker_gestiones WHERE tally_envio_id IN ((r->>'envio_id')::uuid,(r2->>'envio_id')::uuid)), r::text||' '||r2::text);
  -- modo procesar sin email/nombre → inválido en la RPC
  r := epms.registrar_tally_envio('qa5:i3', 'formQA-A', ea, NULL, now(), '{"x":3}', '{"nombre":"TEST QA Tally SinEmail"}', '[]', NULL, 'procesar');
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('i procesar sin email → invalido, sin speaker', r->>'estado'='invalido' AND NOT EXISTS (SELECT 1 FROM epms.speakers WHERE nombre='TEST QA Tally SinEmail'), r::text);
  -- ── inmutabilidad ──
  BEGIN
    UPDATE epms.tally_envios SET campos='{}' WHERE clave='qa5:a';
    INSERT INTO qa_res(caso, ok, detalle) VALUES ('inmutable: UPDATE de campos debe fallar', false, 'no falló');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO qa_res(caso, ok, detalle) VALUES ('inmutable: UPDATE de campos debe fallar', true, 'check_violation');
  END;
  UPDATE epms.tally_envios SET estado='aceptado' WHERE clave='qa5:a';
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('inmutable: UPDATE de estado sí se permite', (SELECT estado FROM epms.tally_envios WHERE clave='qa5:a')='aceptado', 'ok');
  -- ── (j) privilegios ──
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('j authenticated/anon NO pueden ejecutar la RPC; service_role sí',
    NOT has_function_privilege('authenticated', fn, 'EXECUTE') AND NOT has_function_privilege('anon', fn, 'EXECUTE') AND has_function_privilege('service_role', fn, 'EXECUTE'), 'fn');
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('j grants service_role (tally_formularios SELECT, evento_speakers INSERT, gestiones INSERT, tally_envios SELECT)',
    has_table_privilege('service_role','epms.tally_formularios','SELECT') AND has_table_privilege('service_role','epms.evento_speakers','INSERT')
    AND has_table_privilege('service_role','epms.evento_speaker_gestiones','INSERT') AND has_table_privilege('service_role','epms.tally_envios','SELECT'), 'grants');
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('j authenticated: solo SELECT en tally_envios; nada para anon',
    has_table_privilege('authenticated','epms.tally_envios','SELECT')
    AND NOT has_table_privilege('authenticated','epms.tally_envios','INSERT') AND NOT has_table_privilege('authenticated','epms.tally_envios','UPDATE')
    AND NOT has_table_privilege('authenticated','epms.tally_envios','DELETE') AND NOT has_table_privilege('anon','epms.tally_envios','SELECT'), 'privs');
  INSERT INTO qa_res(caso, ok, detalle) SELECT 'j RPC es SECURITY DEFINER con search_path fijo',
    p.prosecdef AND coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=epms, pg_temp%', coalesce(array_to_string(p.proconfig, ','), '')
    FROM pg_proc p WHERE p.oid = fn::regprocedure;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM epms.registrar_tally_envio('qa5:j', 'f', ea, NULL, now(), '{}', '{}', '[]', NULL, 'desconocido');
    RESET ROLE;
    INSERT INTO qa_res(caso, ok, detalle) VALUES ('j llamada real como authenticated debe fallar', false, 'se ejecutó');
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    INSERT INTO qa_res(caso, ok, detalle) VALUES ('j llamada real como authenticated debe fallar', true, 'permission denied');
  END;
  -- ── (k) borrar speaker y evento con envíos (FK SET NULL, inmutabilidad no estorba) ──
  v_sp := (SELECT speaker_id FROM epms.tally_envios WHERE clave='qa5:e');
  DELETE FROM epms.speakers WHERE id = v_sp;
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('k borrar speaker con envío+gestión+cambios funciona y el envío conserva el payload (speaker_id null)',
    (SELECT speaker_id FROM epms.tally_envios WHERE clave='qa5:e') IS NULL AND (SELECT payload_raw IS NOT NULL FROM epms.tally_envios WHERE clave='qa5:e'), 'ok');
  DELETE FROM epms.eventos WHERE id = eb;
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('k borrar evento con envíos funciona (envío queda con evento_id null)',
    (SELECT evento_id FROM epms.tally_envios WHERE clave='qa5:h') IS NULL AND (SELECT count(*) FROM epms.tally_envios WHERE clave='qa5:h')=1, 'ok');
  -- ── limpieza ──
  DELETE FROM epms.eventos WHERE id = ea;
  DELETE FROM epms.speakers WHERE nombre LIKE 'TEST QA Tally%' OR email ILIKE 'test.qa.tally%@example.invalid';
  DELETE FROM epms.tally_envios WHERE clave LIKE 'qa5:%';
  DELETE FROM epms.eventos WHERE nombre LIKE 'TEST QA Tally%';
  INSERT INTO qa_res(caso, ok, detalle) VALUES ('limpieza: no quedan datos TEST',
    NOT EXISTS (SELECT 1 FROM epms.speakers WHERE nombre LIKE 'TEST QA Tally%' OR email ILIKE 'test.qa.tally%@example.invalid')
    AND NOT EXISTS (SELECT 1 FROM epms.tally_envios WHERE clave LIKE 'qa5:%')
    AND NOT EXISTS (SELECT 1 FROM epms.eventos WHERE nombre LIKE 'TEST QA Tally%')
    AND (SELECT count(*) FROM epms.speakers) = n_sp0 - 6 - 0, 'ok');
END
$qa$;
SELECT n, caso, ok, detalle FROM qa_res ORDER BY n;
