# Compra Sana 🥦

Web app para comer **alto en proteína gastando lo mínimo en Mercadona**: genera un plan semanal de comidas,
calcula la lista de la compra con los productos más baratos y te dice cuánto vas a pagar.

## Qué hace

- **Plan semanal**: desayuno, comida, snack y cena de lunes a domingo, ajustado a tu objetivo de proteína
  (peso × g/kg). Las comidas y cenas se repiten 2 días seguidos (configurable) para cocinar una vez y tirar de tupper.
  Cualquier comida se puede marcar como **"como fuera"** y no cuenta para la compra.
- **Recetas**: 27 recetas caseras altas en proteína (varias en airfryer y con congelados), con coste por ración,
  calorías y macros. Puedes cambiar el producto de Mercadona de cada ingrediente.
- **Lista de la compra**: se genera desde el plan, elige el envase que menos cuesta para la cantidad que necesitas,
  enlaza cada producto a la tienda online de Mercadona y se puede copiar para mandarla por WhatsApp.
- **Precios**:
  - buscador de lo más barato por €/kg o €/L,
  - ranking de **proteína barata** (€ por cada 100 g de proteína),
  - productos que han **bajado de precio**.
- **Recetas con IA** (opcional): con una API key de Anthropic, pides una receta ("algo con salmón para cenar")
  y Claude la crea usando solo ingredientes con precio en Mercadona. La key se guarda solo en tu navegador.

## Cómo funciona

```
scripts/descargar_mercadona.py   Descarga el catálogo de tienda.mercadona.es → data/mercadona.json
data/ingredientes.json           Ingredientes base: valores nutricionales + reglas para encontrarlos en Mercadona
data/recetas.json                Recetario (cantidades por ración)
js/motor.js                      Lógica: emparejar productos, costes, nutrición, plan y lista de la compra
js/app.js                        Interfaz
js/ia.js                         Generación de recetas con Claude (se carga solo si la usas)
scripts/comprobar.mjs            Comprueba que todas las recetas encuentran producto y tienen precio
.github/workflows/web.yml        Cada día: descarga precios, comprueba y publica en GitHub Pages
```

Los precios salen de la API interna de la tienda online de Mercadona, que **no es oficial ni está documentada**:
puede cambiar sin aviso. Si un día falla la descarga, la web sigue funcionando con la última copia de
`data/mercadona.json` guardada en el repositorio. Es para uso personal.

Los valores nutricionales son orientativos (medias de tablas de composición), no sustituyen el consejo de un profesional.

## Probarlo en local

```bash
python3 -m http.server 8000
```

Y abre http://localhost:8000. Para actualizar precios a mano:

```bash
python3 scripts/descargar_mercadona.py
node scripts/comprobar.mjs --detalle
```

## Añadir una receta

Añade una entrada a `data/recetas.json` usando ids de `data/ingredientes.json` (cantidades por ración, en gramos
o unidades) y ejecuta `node scripts/comprobar.mjs`. Si necesitas un ingrediente nuevo, añádelo a
`data/ingredientes.json` con sus valores por 100 g y las palabras para encontrarlo en Mercadona.

## Ideas para más adelante

- Comparar con otros supermercados (El Corte Inglés…).
- Historial de precios para ver qué sube y qué baja.
- Lista de la compra compartida entre varias personas.
