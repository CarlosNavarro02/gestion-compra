// Lógica pura (sin DOM): emparejar ingredientes con productos de Mercadona,
// calcular costes y nutrición, generar el plan semanal y la lista de la compra.
// Se usa tanto en el navegador como en los scripts de comprobación (Node).

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const COMIDAS = [
  { id: 'desayuno', nombre: 'Desayuno', tipo: 'desayuno' },
  { id: 'comida', nombre: 'Comida', tipo: 'principal' },
  { id: 'snack', nombre: 'Snack', tipo: 'snack' },
  { id: 'cena', nombre: 'Cena', tipo: 'principal' },
];
export const FUERA = 'fuera';

export function normalizar(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// ---------- Precios ----------

/** Precio por gramo (u = 'g') o por unidad (u = 'ud') de un producto, o null si no se puede calcular. */
export function precioUnitario(p, u) {
  const ref = p.ref;
  if (u === 'g') {
    if ((ref === 'kg' || ref === 'l') && p.precio_ref) return p.precio_ref / 1000;
    if ((ref === '100 g' || ref === '100 ml') && p.precio_ref) return p.precio_ref / 100;
    if ((p.tam_fmt === 'kg' || p.tam_fmt === 'l') && p.tam && p.precio) return p.precio / (p.tam * 1000);
    return null;
  }
  if (u === 'ud') {
    if (ref === 'ud' && p.precio_ref) return p.precio_ref;
    if ((ref === 'dc' || ref === 'dz') && p.precio_ref) return p.precio_ref / 12;
    if (p.tam_fmt === 'ud' && p.tam && p.precio) return p.precio / p.tam;
    return null;
  }
  return null;
}

/** Tamaño del envase en la unidad del ingrediente (g o ud), o null si es a granel / desconocido. */
export function tamEnvase(p, u) {
  if (!p.tam) return null;
  if (u === 'g' && (p.tam_fmt === 'kg' || p.tam_fmt === 'l')) return p.tam * 1000;
  if (u === 'ud' && p.tam_fmt === 'ud') return p.tam;
  return null;
}

/** Productos de Mercadona que encajan con un ingrediente, del más barato al más caro. */
export function candidatos(ing, productos) {
  if (!ing.q || !ing.q.length) return [];
  const grupos = ing.q.map(g => g.map(normalizar));
  const excluir = (ing.x || []).map(normalizar);
  const cats = ing.c || null;
  const res = [];
  for (const p of productos) {
    if (cats && !cats.includes(p.cat)) continue;
    const nombre = normalizar(p.nombre);
    if (!grupos.some(g => g.every(w => nombre.includes(w)))) continue;
    if (excluir.some(w => nombre.includes(w))) continue;
    const pu = precioUnitario(p, ing.u);
    if (pu == null) continue;
    res.push({ producto: p, pu });
  }
  res.sort((a, b) => a.pu - b.pu);
  return res;
}

/**
 * Prepara el "catálogo" de ingredientes: para cada uno, sus candidatos y el producto elegido
 * (el más barato, o el que el usuario haya fijado en `elecciones`).
 */
export function prepararIngredientes(ingredientes, productos, elecciones = {}) {
  const out = {};
  for (const [id, ing] of Object.entries(ingredientes)) {
    if (id.startsWith('_')) continue;
    const cands = candidatos(ing, productos);
    let elegido = cands[0] || null;
    let fijado = false;
    if (elecciones[id]) {
      const f = cands.find(c => c.producto.id === elecciones[id]);
      if (f) { elegido = f; fijado = true; }
    }
    out[id] = { id, ...ing, candidatos: cands, elegido, fijado };
  }
  return out;
}

// ---------- Recetas ----------

/** Nutrición y coste de una ración de receta. */
export function analizarReceta(receta, ings) {
  let kcal = 0, prot = 0, hc = 0, grasa = 0, coste = 0;
  const faltan = [];
  for (const it of receta.ingredientes) {
    const ing = ings[it.id];
    if (!ing) { faltan.push(it.id); continue; }
    const gramos = ing.u === 'ud' ? it.cant * (ing.g_ud || 0) : it.cant;
    const [k, p, h, g] = ing.n;
    kcal += (k * gramos) / 100;
    prot += (p * gramos) / 100;
    hc += (h * gramos) / 100;
    grasa += (g * gramos) / 100;
    if (ing.elegido) coste += ing.elegido.pu * it.cant;
    else if (!ing.sin_precio) faltan.push(it.id);
  }
  return {
    kcal: Math.round(kcal),
    prot: Math.round(prot),
    hc: Math.round(hc),
    grasa: Math.round(grasa),
    coste,
    faltan,
  };
}

export function textoCantidad(ing, cant) {
  if (ing.u === 'ud') return `${fmtNum(cant)} ud`;
  if (cant >= 1000) return `${fmtNum(cant / 1000)} kg`;
  return `${Math.round(cant)} g`;
}

function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

// ---------- Plan semanal ----------

/** Plan vacío: plan[dia][comida] = null | idReceta | 'fuera'. */
export function planVacio() {
  return DIAS.map(() => Object.fromEntries(COMIDAS.map(c => [c.id, null])));
}

/** Generador pseudoaleatorio con semilla, para que "otro plan" sea reproducible. */
function aleatorio(semilla) {
  let s = semilla >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function barajar(lista, rnd) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Genera un plan respetando los huecos marcados como "fuera" y las comidas activas.
 * - Principales (comida/cena): cada receta se repite `repetir` días seguidos (batch cooking).
 * - Prioriza recetas con más proteína por euro.
 */
export function generarPlan({ recetas, ings, planActual, activas, repetir = 2, fijados = {}, semilla = Date.now() }) {
  const rnd = aleatorio(semilla);
  const plan = planVacio();
  const info = Object.fromEntries(recetas.map(r => [r.id, analizarReceta(r, ings)]));
  const puntuar = r => {
    const a = info[r.id];
    const euros = Math.max(a.coste, 0.3);
    return a.prot / euros + rnd() * 8; // proteína por euro + algo de variedad
  };
  const porTipo = tipo =>
    recetas.filter(r => r.tipo.includes(tipo) && info[r.id].faltan.length === 0)
      .sort((a, b) => puntuar(b) - puntuar(a));

  // Se respetan las comidas fuera y los platos fijados (🔒) del plan actual.
  for (const comida of COMIDAS) {
    if (!activas.includes(comida.id)) continue;
    for (let d = 0; d < 7; d++) {
      const actual = planActual?.[d]?.[comida.id];
      if (actual === FUERA) plan[d][comida.id] = FUERA;
      else if (actual && fijados[`${d}-${comida.id}`] && recetas.some(r => r.id === actual)) plan[d][comida.id] = actual;
    }
  }

  // Principales: comida y cena usan listas distintas para no comer lo mismo dos veces al día.
  const principales = barajar(porTipo('principal').slice(0, 14), rnd);
  let idx = 0;
  for (const comida of COMIDAS.filter(c => c.tipo === 'principal')) {
    if (!activas.includes(comida.id)) continue;
    let restantes = 0, actual = null;
    for (let d = 0; d < 7; d++) {
      if (plan[d][comida.id] != null) continue; // fuera o fijado
      if (restantes === 0) {
        actual = principales[idx % principales.length];
        idx++;
        restantes = Math.max(1, repetir);
      }
      plan[d][comida.id] = actual?.id ?? null;
      restantes--;
    }
  }

  // Desayunos y snacks: rotación de 2-3 opciones.
  for (const comida of COMIDAS.filter(c => c.tipo !== 'principal')) {
    if (!activas.includes(comida.id)) continue;
    const opciones = barajar(porTipo(comida.tipo).slice(0, 5), rnd).slice(0, 3);
    let i = 0;
    for (let d = 0; d < 7; d++) {
      if (plan[d][comida.id] != null || !opciones.length) continue; // fuera o fijado
      plan[d][comida.id] = opciones[i % opciones.length].id;
      i++;
    }
  }
  return plan;
}

// ---------- Calorías ----------

/** Reparto orientativo de las calorías del día entre comidas. */
export const REPARTO = { desayuno: 0.25, comida: 0.35, snack: 0.10, cena: 0.30 };
export const ACTIVIDADES = [
  [1.2, 'Sedentaria (poco o nada de ejercicio)'],
  [1.375, 'Ligera (1-3 días de ejercicio)'],
  [1.55, 'Moderada (3-5 días de ejercicio)'],
  [1.725, 'Alta (6-7 días de ejercicio)'],
];
export const OBJETIVOS = [['perder', 'Perder grasa (−15 %)'], ['mantener', 'Mantener peso'], ['ganar', 'Ganar músculo (+10 %)']];

/** Calorías diarias: Mifflin-St Jeor × actividad × objetivo, o el valor fijado a mano. */
export function kcalObjetivo({ peso, altura, edad, sexo, actividad, objetivo, kcalManual }) {
  if (kcalManual > 0) return Math.round(kcalManual);
  const s = sexo === 'h' ? 5 : sexo === 'm' ? -161 : -78; // sin indicar: punto medio
  const basal = 10 * peso + 6.25 * altura - 5 * edad + s;
  const ajuste = { perder: 0.85, mantener: 1, ganar: 1.1 }[objetivo] ?? 1;
  return Math.round((basal * actividad * ajuste) / 10) * 10;
}

const SIN_AJUSTE = { base: 1, racion: 1 };

/**
 * Copia de la receta con las raciones ajustadas:
 * - `base`: multiplica los hidratos "base" (arroz, pasta, patata, pan, avena…).
 * - `racion`: multiplica el plato entero (solo para subir calorías; también sube la proteína).
 */
export function escalarReceta(receta, factor = SIN_AJUSTE, ings) {
  const { base = 1, racion = 1 } = factor;
  if (Math.abs(base - 1) < 0.01 && Math.abs(racion - 1) < 0.01) return receta;
  return {
    ...receta,
    factor: { base, racion },
    ingredientes: receta.ingredientes.map(it => {
      const ing = ings[it.id];
      if (!ing || ing.sin_precio) return it;
      const f = (ing.base ? base : 1) * racion;
      if (Math.abs(f - 1) < 0.01) return it;
      const cant = ing.u === 'ud' ? Math.max(1, Math.round(it.cant * f)) : Math.max(5, Math.round((it.cant * f) / 5) * 5);
      return { ...it, cant };
    }),
  };
}

/**
 * Ajuste semanal de raciones para acercarse al objetivo de calorías. Un único ajuste para toda la semana,
 * para que los tuppers de un mismo plato lleven lo mismo. Solo cuentan las comidas en casa (no "como fuera").
 * 1) Se ajustan los hidratos base entre ×0,4 y ×1,8.
 * 2) Si con eso no se llega, los platos enteros crecen hasta ×1,6 (nunca se reducen: la proteína se mantiene).
 */
export function factorRaciones({ plan, recetasPorId, ings, kcalDia, activas }) {
  const total = activas.reduce((s, id) => s + (REPARTO[id] || 0), 0) || 1;
  let objetivo = 0, fijas = 0, ajustables = 0;
  for (const dia of plan) {
    for (const c of COMIDAS) {
      if (!activas.includes(c.id)) continue;
      const r = recetasPorId[dia[c.id]];
      if (!r) continue;
      objetivo += kcalDia * (REPARTO[c.id] / total);
      for (const it of r.ingredientes) {
        const ing = ings[it.id];
        if (!ing) continue;
        const g = ing.u === 'ud' ? it.cant * (ing.g_ud || 0) : it.cant;
        const k = (ing.n[0] * g) / 100;
        if (ing.base) ajustables += k; else fijas += k;
      }
    }
  }
  if (!ajustables || !objetivo) return { ...SIN_AJUSTE };
  const redondear = x => Math.round(x * 20) / 20;
  const ideal = (objetivo - fijas) / ajustables;
  const base = redondear(Math.min(1.8, Math.max(0.4, ideal)));
  let racion = 1;
  if (ideal > 1.8) racion = redondear(Math.min(1.6, objetivo / (fijas + ajustables * base)));
  return { base, racion };
}

/** Texto corto del ajuste, p. ej. "arroz, pasta… ×1,4 y platos un 20 % más grandes". */
export function textoAjuste({ base = 1, racion = 1 } = {}) {
  const partes = [];
  const n = x => x.toFixed(2).replace(/0$/, '').replace('.', ',');
  if (Math.abs(base - 1) >= 0.05) partes.push(`arroz, pasta, patata, pan y avena ×${n(base)}`);
  if (racion > 1.04) partes.push(`platos un ${Math.round((racion - 1) * 100)} % más grandes`);
  return partes.join(' y ');
}

/** Totales por día del plan. */
export function resumenDia(diaPlan, recetasPorId, ings) {
  let kcal = 0, prot = 0, coste = 0, fuera = 0;
  for (const c of COMIDAS) {
    const v = diaPlan[c.id];
    if (v === FUERA) { fuera++; continue; }
    const r = v && recetasPorId[v];
    if (!r) continue;
    const a = analizarReceta(r, ings);
    kcal += a.kcal; prot += a.prot; coste += a.coste;
  }
  return { kcal, prot, coste, fuera };
}

// ---------- Lista de la compra ----------

/**
 * Suma las cantidades de todos los ingredientes del plan y calcula cuántos envases comprar.
 * Devuelve { items, totalCaja, totalConsumido }.
 */
export function listaCompra(plan, recetasPorId, ings) {
  const necesario = {};
  for (const dia of plan) {
    for (const c of COMIDAS) {
      const r = recetasPorId[dia[c.id]];
      if (!r) continue;
      for (const it of r.ingredientes) {
        necesario[it.id] = (necesario[it.id] || 0) + it.cant;
      }
    }
  }
  const items = [];
  let totalCaja = 0, totalConsumido = 0;
  for (const [id, cant] of Object.entries(necesario)) {
    const ing = ings[id];
    if (!ing || ing.sin_precio) continue;
    const item = { id, ing, cant, producto: null, envases: null, costeCaja: null, costeConsumido: null };
    // Si el usuario no ha fijado producto, elige el que menos cuesta en caja para esta cantidad
    // (no compensa una malla de 5 kg si solo necesitas 1 kg).
    const opciones = ing.fijado ? [ing.elegido] : ing.candidatos;
    let mejor = null;
    for (const c of opciones) {
      if (!c) continue;
      const compra = costeCompra(c, ing.u, cant);
      if (!mejor || compra.costeCaja < mejor.costeCaja - 0.005
          || (Math.abs(compra.costeCaja - mejor.costeCaja) <= 0.005 && c.pu < mejor.c.pu)) {
        mejor = { c, ...compra };
      }
    }
    if (mejor) {
      item.producto = mejor.c.producto;
      item.envases = mejor.envases;
      item.costeCaja = mejor.costeCaja;
      item.costeConsumido = mejor.c.pu * cant;
      if (!ing.despensa) totalCaja += item.costeCaja;
      totalConsumido += item.costeConsumido;
    }
    items.push(item);
  }
  for (const it of items) it.pasillo = pasillo(it.producto);
  items.sort((a, b) => (a.ing.despensa === b.ing.despensa ? 0 : a.ing.despensa ? 1 : -1)
    || a.pasillo.orden - b.pasillo.orden
    || a.ing.nombre.localeCompare(b.ing.nombre));
  return { items, totalCaja, totalConsumido };
}

// Recorrido típico por el súper: lo fresco y lo seco primero, lo refrigerado después y lo congelado al final
// para que no se caliente en el carro.
const PASILLOS = [
  ['Fruta y verdura', ['Fruta y verdura']],
  ['Panadería', ['Panadería y pastelería']],
  ['Despensa', ['Arroz, legumbres y pasta', 'Conservas, caldos y cremas', 'Aceite, especias y salsas', 'Cereales y galletas',
    'Cacao, café e infusiones', 'Azúcar, caramelos y chocolate', 'Aperitivos']],
  ['Bebidas', ['Zumos', 'Agua y refrescos', 'Bodega']],
  ['Carne', ['Carne']],
  ['Pescado y marisco', ['Marisco y pescado']],
  ['Charcutería y quesos', ['Charcutería y quesos']],
  ['Lácteos y huevos', ['Huevos, leche y mantequilla', 'Postres y yogures']],
  ['Platos preparados', ['Pizzas y platos preparados']],
  ['Congelados', ['Congelados']],
];

/** Pasillo (y su orden en el recorrido) de un producto. Lo congelado va siempre a "Congelados". */
export function pasillo(p) {
  if (!p) return { orden: 99, nombre: 'Otros' };
  const congelado = /congelad/.test(normalizar(`${p.nombre} ${p.sub}`));
  const i = congelado ? PASILLOS.length - 1 : PASILLOS.findIndex(([, cats]) => cats.includes(p.cat));
  return i < 0 ? { orden: 98, nombre: p.cat } : { orden: i, nombre: PASILLOS[i][0] };
}

/** Envases necesarios y coste en caja de comprar `cant` de un candidato. */
export function costeCompra(c, u, cant) {
  const tam = tamEnvase(c.producto, u);
  if (!tam) return { envases: null, costeCaja: c.pu * cant }; // a granel o peso variable
  const envases = Math.max(1, Math.ceil(cant / tam - 0.02)); // 2 % de margen
  return { envases, costeCaja: envases * c.producto.precio };
}

// ---------- Ofertas / más baratos ----------

/** Precio comparable (€/kg, €/L o €/ud) normalizado para ordenar resultados de búsqueda. */
export function precioComparable(p) {
  if (!p.precio_ref) return { valor: p.precio, unidad: 'ud' };
  if (p.ref === '100 g') return { valor: p.precio_ref * 10, unidad: 'kg' };
  if (p.ref === '100 ml') return { valor: p.precio_ref * 10, unidad: 'L' };
  if (p.ref === 'dc' || p.ref === 'dz') return { valor: p.precio_ref, unidad: 'docena' };
  if (p.ref === 'l') return { valor: p.precio_ref, unidad: 'L' };
  return { valor: p.precio_ref, unidad: p.ref || 'ud' };
}

export function buscarProductos(productos, texto, { categoria = '', soloBajadas = false } = {}) {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  return productos
    .filter(p => (!categoria || p.cat === categoria)
      && (!soloBajadas || p.bajada)
      && palabras.every(w => normalizar(p.nombre).includes(w)))
    .map(p => ({
      p,
      cmp: precioComparable(p),
      // Primero los productos cuyo nombre empieza por lo buscado ("Atún claro…" antes que "Empanadillas de atún")
      relevancia: palabras.length && normalizar(p.nombre).startsWith(palabras[0]) ? 0 : 1,
    }))
    .sort((a, b) => a.relevancia - b.relevancia
      || a.cmp.unidad.localeCompare(b.cmp.unidad) || a.cmp.valor - b.cmp.valor);
}

/**
 * Ranking de proteína barata: € por cada 100 g de proteína. Solo cuenta "fuentes de proteína":
 * alimentos en los que al menos el 25 % de las calorías vienen de la proteína (deja fuera pasta, pan, frutos secos…).
 */
export function rankingProteina(ings) {
  return Object.values(ings)
    .filter(i => i.elegido && i.n[0] > 0 && (i.n[1] * 4) / i.n[0] >= 0.25)
    .map(i => {
      const gramosProducto = i.u === 'ud' ? (i.g_ud || 1) : 1;
      const euroPorGramoProducto = i.elegido.pu / gramosProducto;
      const euros100gProt = (euroPorGramoProducto * 100 * 100) / i.n[1];
      return { ing: i, euros100gProt };
    })
    .sort((a, b) => a.euros100gProt - b.euros100gProt);
}
