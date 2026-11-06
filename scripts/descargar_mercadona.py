#!/usr/bin/env python3
"""Descarga el catálogo de Mercadona (tienda online) y lo guarda en data/mercadona.json.

Usa la API interna de tienda.mercadona.es (no oficial ni documentada): puede
cambiar sin aviso. Solo para uso personal. Hace las peticiones de una en una
con una pausa entre ellas para no cargar su servidor.

Uso:  python3 scripts/descargar_mercadona.py [--almacen mad1] [--salida data/mercadona.json]
"""

import argparse
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://tienda.mercadona.es/api"
PAUSA = 0.4  # segundos entre peticiones
CABECERAS = {
    "User-Agent": "gestion-compra/1.0 (uso personal)",
    "Accept": "application/json",
}


def pedir(url, intentos=4):
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, headers=CABECERAS)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as e:  # red, 429, 5xx...
            if i == intentos - 1:
                raise
            espera = 2 ** (i + 1)
            print(f"  error en {url}: {e}; reintento en {espera}s", file=sys.stderr)
            time.sleep(espera)


def num(valor):
    try:
        return float(str(valor).strip())
    except (TypeError, ValueError):
        return None


def simplificar(p, categoria, subcategoria):
    pi = p.get("price_instructions") or {}
    return {
        "id": p["id"],
        "nombre": p.get("display_name", "").strip(),
        "formato": p.get("packaging") or "",
        "cat": categoria,
        "sub": subcategoria,
        "precio": num(pi.get("unit_price")),          # precio del envase
        "precio_ref": num(pi.get("reference_price")),  # precio por kg / L / ud
        "ref": (pi.get("reference_format") or "").lower(),  # kg, l, ud...
        "tam": num(pi.get("unit_size")),               # tamaño del envase
        "tam_fmt": (pi.get("size_format") or "").lower(),  # kg, l, ud
        "granel": pi.get("selling_method") == 2,
        "bajada": bool(pi.get("price_decreased")),
        "precio_antes": num(pi.get("previous_unit_price")),
        "img": p.get("thumbnail"),
        "url": p.get("share_url"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--almacen", default="mad1", help="almacén de Mercadona (mad1 = Madrid)")
    ap.add_argument("--salida", default="data/mercadona.json")
    args = ap.parse_args()

    q = f"?lang=es&wh={args.almacen}"
    raiz = pedir(f"{BASE}/categories/{q}")
    productos = {}
    for cat in raiz["results"]:
        for sub in cat.get("categories", []):
            time.sleep(PAUSA)
            datos = pedir(f"{BASE}/categories/{sub['id']}/{q}")
            for grupo in datos.get("categories", []):
                for p in grupo.get("products", []):
                    if p.get("published") is False:
                        continue
                    productos[p["id"]] = simplificar(p, cat["name"], f"{sub['name']} › {grupo['name']}")
            print(f"{cat['name']} › {sub['name']}: {len(productos)} productos", file=sys.stderr)

    if len(productos) < 1000:
        sys.exit(f"Solo se han descargado {len(productos)} productos; algo ha fallado.")

    salida = Path(args.salida)
    salida.parent.mkdir(parents=True, exist_ok=True)
    resultado = {
        "actualizado": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "almacen": args.almacen,
        "productos": sorted(productos.values(), key=lambda p: (p["cat"], p["sub"], p["nombre"])),
    }
    salida.write_text(json.dumps(resultado, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Guardados {len(productos)} productos en {salida}", file=sys.stderr)


if __name__ == "__main__":
    main()
