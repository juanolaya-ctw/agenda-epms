"""
generate_govtech_graphics.py
Worker de generación de piezas gráficas — Fase 1 "Soy Speaker"
GovTech Summit 2026

Diferencias vs CTF:
- Sin rembg: la foto va en B/N directo, sin quitar fondo
- Sin Google Drive: sube a Supabase Storage (bucket toolkit-piezas)
- Sin Google Sheets: solo lee/escribe Supabase, schema epms
- Trigger: llamado por Edge Function (no loop automático)
- Datos del speaker: vienen en el payload del request, NO se leen de BD
  (el speaker pudo haberlos editado en el toolkit antes de generar)
- Solo guarda en BD la URL de la pieza generada (link_pieza_fase1)

Modos de uso:
  python generate_govtech_graphics.py --serve          # Servidor HTTP en puerto 8080
  python generate_govtech_graphics.py --test           # Genera pieza de prueba local
  python generate_govtech_graphics.py --test --foto URL --nombre "X" --cargo "Y" --empresa "Z"

Endpoint HTTP:
  POST /govtech/fase1
  Body JSON: {
    "speaker_id": "uuid",
    "nombre": "Nombre Apellido",
    "cargo": "CEO",
    "empresa": "Empresa S.A.",
    "foto_url": "https://..."   # URL pública de Supabase Storage
  }
  Response: { "url": "https://...supabase.co/storage/v1/object/public/toolkit-piezas/..." }
"""

import os
import sys
import io
import re
import base64
import logging
import argparse
import traceback
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
import json

import httpx
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps
import requests
import cairosvg

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ─── Config desde variables de entorno ────────────────────────────────────────
SUPABASE_URL         = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
STORAGE_BUCKET       = "toolkit-piezas"
PORT                 = int(os.environ.get("PORT", 8080))

# ─── Paths locales ─────────────────────────────────────────────────────────────
BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR     = os.path.join(BASE_DIR, "fonts")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
OUTPUT_DIR    = os.path.join(BASE_DIR, "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

SVG_PATH      = os.path.join(TEMPLATES_DIR, "govtech_speaker.svg")

# Fuentes Mosvita
FONT_BLACK_FILE   = "Mosvita-Black.otf"
FONT_REGULAR_FILE = "Mosvita-Regular.otf"

# Posiciones de texto extraídas del SVG (coordenadas en 1080x1350)
# SVG usa baseline como referencia; Pillow usa top-left.
# Los valores Y del SVG son baseline — hay que restar la altura del font.
TEXT_SOY_SPEAKER = {
    "x": 25,
    "y_baseline": 1074,
    "size": 41,
    "color": (247, 246, 241),   # #f7f6f1 crema
    "font": FONT_BLACK_FILE,
    "text": "SOY SPEAKER",
}
TEXT_NOMBRE = {
    "x": 25,
    "y_baseline": 1125,
    "size": 57,
    "color": (28, 28, 26),
    "font": FONT_BLACK_FILE,
}
TEXT_CARGO = {
    "x": 25,
    "y_baseline": 1190,
    "size": 38,
    "color": (28, 28, 26),
    "font": FONT_REGULAR_FILE,
}
TEXT_EMPRESA = {
    "x": 25,
    "y_baseline": 1238,
    "size": 38,
    "color": (28, 28, 26),
    "font": FONT_REGULAR_FILE,
}

# Parámetros de detección de rostro
FACE_MARGIN_TOP_RATIO    = 0.8   # espacio encima de la cara (más aire arriba)
FACE_MARGIN_BOTTOM_RATIO = 2.2   # espacio debajo (busto visible, menos recorte)
FACE_MIN_HEIGHT_RATIO    = 0.05  # descarta detecciones < 5% del alto

# ─── Template cache ───────────────────────────────────────────────────────────
# El overlay y la máscara se generan una sola vez y se cachean en memoria.
_template_overlay: Image.Image | None = None   # RGBA, logos + bordes, sin texto
_template_mask: np.ndarray | None = None       # bool mask del rombo (True = foto va aquí)
_template_bg_color = (164, 212, 255)           # #a4d4ff — color dominante del fondo azul


def _build_template_assets():
    """
    Genera y cachea el overlay del template y la máscara del rombo.
    Se llama una sola vez al primer request.

    Estrategia:
    - Overlay: SVG sin textos de placeholder → se pone ENCIMA de la foto
    - Máscara: SVG sin imagen de Bogotá ni foto de speaker → solo el rombo
      negro queda visible, lo que permite extraer su forma exacta
    """
    global _template_overlay, _template_mask

    if _template_overlay is not None:
        return

    log.info("Construyendo assets del template (primera vez)...")

    with open(SVG_PATH, "r", encoding="utf-8") as f:
        svg_content = f.read()

    # ── Overlay: SVG sin textos de placeholder, con rombo transparente ─────────
    # El overlay se pone ENCIMA de la foto. Para que la foto sea visible,
    # los píxeles del rombo en el overlay deben ser transparentes (alpha=0).
    svg_no_text = re.sub(r'<text[^>]*>.*?</text>', '', svg_content, flags=re.DOTALL)
    overlay_bytes = cairosvg.svg2png(
        bytestring=svg_no_text.encode("utf-8"),
        output_width=1080,
        output_height=1350,
    )
    overlay = Image.open(io.BytesIO(overlay_bytes)).convert("RGBA")

    # Hacer transparente la zona del rombo usando la máscara ya construida.
    # Nota: la máscara se construye ANTES del overlay en el flujo final,
    # pero aquí la construimos primero (la variable _template_mask ya existe
    # al llegar a este punto si reordenamos el código, o la calculamos inline).
    # Por simplicidad, guardamos el overlay temporalmente y aplicamos la máscara
    # después de construir _template_mask (ver más abajo).
    _template_overlay = overlay
    log.info(f"  Overlay (pre-mask): {overlay.size}, modo={overlay.mode}")

    # ── Máscara del rombo ──────────────────────────────────────────────────────
    # Estrategia: renderizar el SVG sin imágenes, sin textos, sin el rect de
    # mix-blend-mode, con fondo rojo (#ff0000). El rombo es el único hueco
    # en las formas azules del diseño, así que el rojo del fondo aparece
    # SOLO dentro del rombo. Detectamos ese rojo para extraer la máscara exacta.
    svg_rombo_only = re.sub(r'<image[^>]*/>', '', svg_content)
    svg_rombo_only = re.sub(r'<text[^>]*>.*?</text>', '', svg_rombo_only, flags=re.DOTALL)
    svg_rombo_only = re.sub(r'<rect class="cls-5"[^>]*/>', '', svg_rombo_only)

    rombo_bytes = cairosvg.svg2png(
        bytestring=svg_rombo_only.encode("utf-8"),
        output_width=1080,
        output_height=1350,
        background_color="#ff0000",
    )
    rombo_arr = np.array(Image.open(io.BytesIO(rombo_bytes)).convert("RGB"))

    # Rombo = zona donde el rojo del fondo es visible (R>200, G<60, B<60)
    mask = (rombo_arr[:, :, 0] > 200) & (rombo_arr[:, :, 1] < 60) & (rombo_arr[:, :, 2] < 60)

    # Limpiar ruido morfológico menor en bordes
    kernel = np.ones((3, 3), np.uint8)
    mask_clean = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, kernel)
    _template_mask = mask_clean.astype(bool)

    total_px = _template_mask.sum()
    log.info(f"  Máscara del rombo: {total_px:,} px ({total_px / (1080*1350) * 100:.1f}% del canvas)")

    # Aplicar máscara al overlay: poner alpha=0 en la zona del rombo
    # para que la foto del speaker sea visible a través del overlay.
    overlay_arr = np.array(_template_overlay)
    overlay_arr[_template_mask, 3] = 0   # alpha=0 donde es el rombo
    _template_overlay = Image.fromarray(overlay_arr, "RGBA")
    log.info("  Overlay con rombo transparente aplicado")


# ─── Helpers de fuentes ────────────────────────────────────────────────────────

def _find_font(filename: str) -> str:
    candidates = [
        os.path.join(FONTS_DIR, filename),
        # fallback para desarrollo local en Windows
        os.path.join(r"C:\Users\metal\AppData\Local\Microsoft\Windows\Fonts", filename),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    raise FileNotFoundError(
        f"Fuente no encontrada: {filename}. Colócala en {FONTS_DIR}/"
    )


def _draw_text_baseline(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont,
                         x: int, y_baseline: int, color: tuple):
    """
    Dibuja texto usando y_baseline como referencia (igual que SVG),
    calculando el offset necesario para Pillow que usa top-left.
    """
    bbox = font.getbbox(text)
    ascent = -bbox[1]   # bbox[1] es negativo en Pillow para el ascent
    draw.text((x, y_baseline - ascent), text, font=font, fill=color)


def _fit_font_to_width(text: str, font_path: str, max_width: int, start_size: int) -> ImageFont.FreeTypeFont:
    """Reduce el tamaño de fuente hasta que el texto quepa en max_width."""
    size = start_size
    while size > 12:
        font = ImageFont.truetype(font_path, size)
        bbox = font.getbbox(text)
        w = bbox[2] - bbox[0]
        if w <= max_width:
            return font
        size -= 2
    return ImageFont.truetype(font_path, 12)


# ─── Detección de rostro ───────────────────────────────────────────────────────

def _detect_face_bbox(photo_bytes: bytes) -> tuple[int, int, int, int] | None:
    """
    Detecta la cara más grande en la foto.
    Retorna (x, y, w, h) o None si no detecta o si OpenCV no tiene cascades.
    """
    try:
        img = Image.open(io.BytesIO(photo_bytes)).convert("RGB")
        gray = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)

        cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
        if not os.path.exists(cascade_path):
            log.warning("  Haar cascade no disponible en este entorno — usando fallback")
            return None

        face_cascade = cv2.CascadeClassifier(cascade_path)
        faces = face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
        )

        if len(faces) == 0:
            return None

        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        image_h = img.size[1]

        if h / image_h < FACE_MIN_HEIGHT_RATIO:
            log.warning(f"  Rostro descartado por tamaño sospechoso ({h}/{image_h})")
            return None

        return (int(x), int(y), int(w), int(h))
    except Exception as e:
        log.warning(f"  Detección de rostro falló ({e}) — usando fallback")
        return None


# ─── Descarga de foto ──────────────────────────────────────────────────────────

def _download_photo(foto_url: str) -> bytes:
    """
    Descarga la foto del speaker desde una URL pública (Supabase Storage).
    No requiere autenticación.
    """
    resp = requests.get(foto_url, timeout=30, allow_redirects=True)
    resp.raise_for_status()
    if len(resp.content) < 1000:
        raise ValueError(f"Foto demasiado pequeña ({len(resp.content)} bytes) — URL inválida?")
    return resp.content


# ─── Composición de imagen ─────────────────────────────────────────────────────

def _compose_speaker_image(
    photo_bytes: bytes,
    nombre: str,
    cargo: str | None,
    empresa: str | None,
) -> bytes:
    """
    Compone la pieza final del speaker para GovTech Summit 2026.

    Capas (de abajo a arriba):
      1. Canvas azul #a4d4ff
      2. Foto del speaker en B/N, recortada y centrada en el rombo
      3. Overlay del template (logos, bordes, color azul) — sin texto
      4. Texto: SOY SPEAKER, Nombre, Cargo, Empresa

    La foto NO tiene rembg — se convierte a B/N directamente y se
    recorta con la máscara del rombo. El centrado usa detección de
    rostro (OpenCV) con fallback a centro de la foto.

    Retorna PNG como bytes.
    """
    _build_template_assets()

    canvas_w, canvas_h = 1080, 1350

    # ── 1. Canvas azul base ────────────────────────────────────────────────────
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (*_template_bg_color, 255))

    # ── 2. Foto en B/N ────────────────────────────────────────────────────────
    # Estrategia: la foto se escala para cubrir el bounding box del rombo,
    # centrada en el rostro. Se pega directamente en el canvas (sin clipping).
    # El overlay (con el rombo transparente) la enmarca automáticamente —
    # solo es visible donde el overlay no tiene píxeles opacos.
    photo_bytes = _normalize_orientation(photo_bytes)

    # Detectar rostro en color (antes de convertir a B/N)
    face_bbox = _detect_face_bbox(photo_bytes)
    if face_bbox:
        log.info("  Rostro detectado")
    else:
        log.info("  Rostro NO detectado, usando fallback (centro de foto)")

    # Convertir a B/N
    photo = Image.open(io.BytesIO(photo_bytes)).convert("RGB")
    photo_gray = ImageOps.grayscale(photo).convert("RGB")  # RGB, sin alpha

    # Bounding box del rombo
    mask = _template_mask
    rows_with_mask = np.any(mask, axis=1)
    cols_with_mask = np.any(mask, axis=0)
    rombo_y1 = int(np.argmax(rows_with_mask))
    rombo_y2 = int(len(rows_with_mask) - np.argmax(rows_with_mask[::-1]) - 1)
    rombo_x1 = int(np.argmax(cols_with_mask))
    rombo_x2 = int(len(cols_with_mask) - np.argmax(cols_with_mask[::-1]) - 1)
    rombo_w  = rombo_x2 - rombo_x1
    rombo_h  = rombo_y2 - rombo_y1

    photo_w, photo_h = photo_gray.size

    if face_bbox is not None:
        fx, fy, fw, fh = face_bbox
        crop_top    = fy - FACE_MARGIN_TOP_RATIO * fh
        crop_bottom = fy + fh + FACE_MARGIN_BOTTOM_RATIO * fh
        crop_h_px   = crop_bottom - crop_top
        crop_w_px   = crop_h_px * (rombo_w / rombo_h)
        face_cx     = fx + fw / 2
        half_w = crop_w_px / 2
        half_h = crop_h_px / 2
        cx = min(max(face_cx, half_w), photo_w - half_w)
        cy = (crop_top + crop_bottom) / 2
        cy = min(max(cy, half_h), photo_h - half_h)
        crop_box = (int(cx-half_w), int(cy-half_h), int(cx+half_w), int(cy+half_h))
    else:
        # Fallback: centrar en la foto con aspect ratio del rombo
        aspect = rombo_w / rombo_h
        if photo_w / photo_h > aspect:
            target_w = int(photo_h * aspect)
            offset_x = (photo_w - target_w) // 2
            crop_box = (offset_x, 0, offset_x + target_w, photo_h)
        else:
            target_h = int(photo_w / aspect)
            crop_box = (0, 0, photo_w, target_h)

    photo_crop = photo_gray.crop(crop_box)
    photo_scaled = photo_crop.resize((rombo_w, rombo_h), Image.LANCZOS)

    # Pegar la foto con clip del rombo: solo píxeles dentro de la máscara son visibles
    photo_rgba = photo_scaled.convert("RGBA")
    photo_arr2 = np.array(photo_rgba)

    # Extraer la región de la máscara que corresponde al bounding box del rombo
    rombo_region = mask[rombo_y1:rombo_y1 + rombo_h, rombo_x1:rombo_x1 + rombo_w]
    min_h2 = min(photo_arr2.shape[0], rombo_region.shape[0])
    min_w2 = min(photo_arr2.shape[1], rombo_region.shape[1])
    photo_arr2 = photo_arr2[:min_h2, :min_w2]
    rombo_clip = rombo_region[:min_h2, :min_w2]

    # Alpha = 255 solo donde el rombo es True
    photo_arr2[:, :, 3] = np.where(rombo_clip, 255, 0)
    photo_clipped = Image.fromarray(photo_arr2, "RGBA")
    canvas.paste(photo_clipped, (rombo_x1, rombo_y1), photo_clipped)

    # ── 3. Overlay del template encima (rombo ya es transparente) ─────────────
    canvas = Image.alpha_composite(canvas, _template_overlay)

    # ── 4. Texto ───────────────────────────────────────────────────────────────
    draw = ImageDraw.Draw(canvas)
    max_text_w = canvas_w - 50  # margen derecho

    font_black_path   = _find_font(FONT_BLACK_FILE)
    font_regular_path = _find_font(FONT_REGULAR_FILE)

    # SOY SPEAKER — tamaño fijo 41px, crema
    font_soy = ImageFont.truetype(font_black_path, TEXT_SOY_SPEAKER["size"])
    _draw_text_baseline(draw, "SOY SPEAKER", font_soy,
                        TEXT_SOY_SPEAKER["x"], TEXT_SOY_SPEAKER["y_baseline"],
                        TEXT_SOY_SPEAKER["color"])

    # Nombre — ajusta tamaño si es muy largo
    font_nombre = _fit_font_to_width(nombre, font_black_path, max_text_w, TEXT_NOMBRE["size"])
    _draw_text_baseline(draw, nombre, font_nombre,
                        TEXT_NOMBRE["x"], TEXT_NOMBRE["y_baseline"],
                        TEXT_NOMBRE["color"])

        # Ancho máximo para cargo/empresa — limitado por el logo de GovTech (esquina inferior derecha)
    max_text_w_bottom = 580

    # Cargo
    if cargo and cargo.strip():
        font_cargo = _fit_font_to_width(cargo.strip(), font_regular_path, max_text_w_bottom, TEXT_CARGO["size"])
        _draw_text_baseline(draw, cargo.strip(), font_cargo,
                            TEXT_CARGO["x"], TEXT_CARGO["y_baseline"],
                            TEXT_CARGO["color"])

    # Empresa
    if empresa and empresa.strip():
        y_empresa = TEXT_EMPRESA["y_baseline"]
        font_empresa = _fit_font_to_width(empresa.strip(), font_regular_path, max_text_w_bottom, TEXT_EMPRESA["size"])
        _draw_text_baseline(draw, empresa.strip(), font_empresa,
                            TEXT_EMPRESA["x"], y_empresa,
                            TEXT_EMPRESA["color"])

    # ── Exportar PNG ───────────────────────────────────────────────────────────
    output = io.BytesIO()
    canvas.convert("RGB").save(output, format="PNG", optimize=False)
    return output.getvalue()


def _normalize_orientation(photo_bytes: bytes) -> bytes:
    """Aplica rotación EXIF para que la foto quede vertical."""
    img = Image.open(io.BytesIO(photo_bytes))
    fmt = img.format or "PNG"
    img = ImageOps.exif_transpose(img)
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


# ─── Supabase Storage ─────────────────────────────────────────────────────────

def _supabase_headers():
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    }


def _upload_to_storage(image_bytes: bytes, filename: str) -> str:
    """
    Sube el PNG al bucket toolkit-piezas en Supabase Storage.
    Retorna la URL pública del archivo.
    """
    url = f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{filename}"
    headers = {
        **_supabase_headers(),
        "Content-Type": "image/png",
        "x-upsert": "true",   # sobreescribe si ya existe (regeneración)
    }
    resp = httpx.put(url, content=image_bytes, headers=headers, timeout=60)
    resp.raise_for_status()

    # URL pública
    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{filename}"
    return public_url


def _save_pieza_url(speaker_id: str, url: str):
    """Guarda la URL de la pieza en epms.speakers.link_pieza_fase1."""
    endpoint = f"{SUPABASE_URL}/rest/v1/speakers"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
        "Accept-Profile": "epms",
        "Content-Profile": "epms",
    }
    params = {"id": f"eq.{speaker_id}"}
    payload = {
        "link_pieza_fase1": url,
        "updated_at": datetime.utcnow().isoformat(),
    }
    resp = httpx.patch(
        endpoint, headers=headers,
        params=params, json=payload, timeout=30
    )
    resp.raise_for_status()


# ─── Pipeline principal ────────────────────────────────────────────────────────

def generate_pieza(speaker_id: str, nombre: str, cargo: str | None,
                   empresa: str | None, foto_url: str) -> str:
    """
    Pipeline completo:
      1. Descarga foto desde URL pública
      2. Compone imagen con template GovTech
      3. Sube a Supabase Storage
      4. Guarda URL en epms.speakers.link_pieza_fase1
      5. Retorna URL pública de la pieza
    """
    log.info(f"Generando pieza: {nombre}")

    log.info("  Descargando foto...")
    photo_bytes = _download_photo(foto_url)
    log.info(f"  Foto: {len(photo_bytes):,} bytes")

    log.info("  Componiendo imagen...")
    final_bytes = _compose_speaker_image(photo_bytes, nombre, cargo, empresa)
    log.info(f"  Imagen compuesta: {len(final_bytes):,} bytes")

    filename = f"fase1-{speaker_id}.png"
    log.info(f"  Subiendo a Storage como '{filename}'...")
    public_url = _upload_to_storage(final_bytes, filename)
    log.info(f"  URL pública: {public_url}")

    log.info("  Guardando URL en Supabase...")
    _save_pieza_url(speaker_id, public_url)
    log.info("  OK")

    return public_url


# ─── Servidor HTTP ─────────────────────────────────────────────────────────────

class GovTechHandler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        log.info(f"HTTP {args[0]} {args[1]}")

    def _send_json(self, status: int, data: dict):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_POST(self):
        if self.path != "/govtech/fase1":
            self._send_json(404, {"error": "Endpoint no encontrado"})
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Body JSON inválido"})
            return

        # Validar campos requeridos
        required = ["speaker_id", "nombre", "foto_url"]
        missing = [f for f in required if not payload.get(f)]
        if missing:
            self._send_json(400, {"error": f"Campos requeridos faltantes: {', '.join(missing)}"})
            return

        try:
            url = generate_pieza(
                speaker_id = payload["speaker_id"],
                nombre     = payload["nombre"],
                cargo      = payload.get("cargo"),
                empresa    = payload.get("empresa"),
                foto_url   = payload["foto_url"],
            )
            self._send_json(200, {"url": url})
        except Exception as e:
            log.error(f"Error generando pieza: {e}\n{traceback.format_exc()}")
            self._send_json(500, {"error": str(e)})

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {"status": "ok", "worker": "govtech-fase1"})
        else:
            self._send_json(404, {"error": "Not found"})


def serve():
    _validate_env()
    log.info(f"Iniciando servidor en puerto {PORT}...")
    server = HTTPServer(("0.0.0.0", PORT), GovTechHandler)
    log.info(f"Worker GovTech escuchando en http://0.0.0.0:{PORT}/govtech/fase1")
    server.serve_forever()


# ─── Validación de entorno ────────────────────────────────────────────────────

def _validate_env():
    missing = []
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_KEY:
        missing.append("SUPABASE_SERVICE_KEY")
    if not os.path.exists(SVG_PATH):
        missing.append(f"SVG template en {SVG_PATH}")
    if missing:
        log.error(f"Configuración incompleta: {', '.join(missing)}")
        sys.exit(1)


# ─── Modo test local ───────────────────────────────────────────────────────────

def run_test(foto_url: str, nombre: str, cargo: str | None, empresa: str | None):
    """
    Genera una pieza localmente sin tocar Supabase.
    Guarda el resultado en output/test_govtech.png.
    """
    log.info("=== Modo test — sin Supabase ===")

    # Para el test, el overlay y máscara se construyen igual
    # pero need the SVG in place
    if not os.path.exists(SVG_PATH):
        log.error(f"SVG no encontrado en {SVG_PATH}")
        log.info("  Copia el SVG del template a templates/govtech_speaker.svg")
        sys.exit(1)

    log.info("Descargando foto...")
    photo_bytes = _download_photo(foto_url)
    log.info(f"  {len(photo_bytes):,} bytes")

    log.info("Componiendo imagen...")
    final_bytes = _compose_speaker_image(photo_bytes, nombre, cargo, empresa)

    out_path = os.path.join(OUTPUT_DIR, "test_govtech.png")
    with open(out_path, "wb") as f:
        f.write(final_bytes)
    log.info(f"Guardado: {out_path}")


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Worker piezas GovTech Summit 2026 — Fase 1")
    parser.add_argument("--serve", action="store_true", help="Inicia servidor HTTP (modo Railway)")
    parser.add_argument("--test",  action="store_true", help="Genera pieza local de prueba")
    parser.add_argument("--foto",    help="URL de foto para --test")
    parser.add_argument("--nombre",  help="Nombre del speaker para --test")
    parser.add_argument("--cargo",   help="Cargo (opcional)")
    parser.add_argument("--empresa", help="Empresa (opcional)")
    args = parser.parse_args()

    if args.test:
        foto = args.foto or "https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Gatto_europeo4.jpg/800px-Gatto_europeo4.jpg"
        nombre = args.nombre or "Speaker Demo"
        run_test(foto, nombre, args.cargo, args.empresa)
    elif args.serve:
        serve()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()