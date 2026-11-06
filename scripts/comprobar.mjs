// Comprueba que todas las recetas se pueden calcular con el catálogo actual de Mercadona.
// Uso: node scripts/comprobar.mjs [--detalle]
// Sale con código 1 si algún ingrediente usado en recetas no encuentra producto.

import fs from 'node:fs';
import {
  prepararIngredientes, analizarReceta, generarPlan, listaCompra, resumenDia, COMIDAS,
} from '../js/motor.js';
import { crearReceta } from '../js/generador.js';

const leer = f => JSON.parse(fs.readFileSync(new URL(`../data/${f}`, import.meta.url)));
const { productos, actualizado } = leer('mercadona.json');
const ings = prepararIngredientes(leer('ingredientes.json'), productos);
const recetas = leer('recetas.json');
const detalle = process.argv.includes('--detalle');

console.log(`Catálogo: ${productos.length} productos (actualizado ${actualizado})\n`);

let errores = 0;
const usados = new Set(recetas.flatMap(r => r.ingredientes.map(i => i.id)));
for (const id of usados) {
  const ing = ings[id];
  if (!ing) { console.error(`✗ Ingrediente desconocido en recetas: ${id}`); errores++; continue; }
  if (!ing.sin_precio && !ing.elegido) { console.error(`✗ Sin producto en Mercadona: ${id} (${ing.nombre})`); errores++; }
  else if (detalle && ing.elegido) console.log(`  ${id.padEnd(20)} → ${ing.elegido.producto.nombre} (${ing.elegido.producto.precio} €)`);
}

const ids = new Set();
console.log('\nReceta'.padEnd(62) + 'kcal  prot   €/ración');
for (const r of recetas) {
  if (ids.has(r.id)) { console.error(`✗ id repetido: ${r.id}`); errores++; }
  ids.add(r.id);
  const a = analizarReceta(r, ings);
  console.log(`${r.nombre.slice(0, 60).padEnd(61)} ${String(a.kcal).padStart(4)}  ${String(a.prot).padStart(3)} g  ${a.coste.toFixed(2)}`);
}

// Plan de prueba
const porId = Object.fromEntries(recetas.map(r => [r.id, r]));
const plan = generarPlan({ recetas, ings, activas: COMIDAS.map(c => c.id), semilla: 42 });
const dias = plan.map(d => resumenDia(d, porId, ings));
const media = k => Math.round(dias.reduce((s, d) => s + d[k], 0) / 7);
const lista = listaCompra(plan, porId, ings);
console.log(`\nPlan de prueba: ${media('kcal')} kcal y ${media('prot')} g de proteína al día de media`);
console.log(`Lista de la compra: ${lista.items.length} productos, ${lista.totalCaja.toFixed(2)} € en caja (sin despensa)`);
if (detalle) {
  for (const it of lista.items) {
    console.log(`  ${it.ing.nombre.padEnd(36)} ${String(Math.round(it.cant)).padStart(5)} ${it.ing.u}  → ${it.envases ?? '≈'} × ${it.producto?.nombre} = ${it.costeCaja?.toFixed(2)} €`);
  }
}

// Generador de recetas: todas las combinaciones deben tener precio
let generadas = 0;
for (const [tipo, metodo] of [['principal', 'airfryer'], ['principal', 'sarten'], ['principal', 'guiso'], ['principal', 'frio'], ['desayuno', ''], ['snack', '']]) {
  for (let semilla = 1; semilla <= 50; semilla++) {
    const r = crearReceta({ tipo, metodo, ings, objetivo: 35, semilla });
    if (!r) { console.error(`✗ El generador no crea receta (${tipo} ${metodo})`); errores++; continue; }
    const a = analizarReceta(r, ings);
    if (a.faltan.length) { console.error(`✗ Receta generada sin precio: ${r.nombre} (${a.faltan.join(', ')})`); errores++; }
    generadas++;
  }
}
console.log(`Generador: ${generadas} recetas de prueba creadas`);

if (errores) {
  console.error(`\n${errores} error(es)`);
  process.exit(1);
}
console.log('\n✓ Todo correcto');
