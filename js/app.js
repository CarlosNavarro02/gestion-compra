import {
  DIAS, COMIDAS, FUERA, prepararIngredientes, analizarReceta, generarPlan, resumenDia,
  listaCompra, buscarProductos, precioComparable, rankingProteina, textoCantidad,
  kcalObjetivo, factorRaciones, escalarReceta, textoAjuste, ACTIVIDADES, OBJETIVOS,
} from './motor.js';
import { crearReceta, proteinasDisponibles, METODOS } from './generador.js';

// ---------- Estado ----------

const CLAVE = 'compra-sana:v1';
const AJUSTES_INICIALES = {
  peso: 70,
  altura: 175,
  edad: 30,
  sexo: '',          // 'h' | 'm' | '' (sin indicar)
  actividad: 1.55,
  objetivo: 'mantener',
  kcalManual: 0,     // 0 = calcularlas
  gkg: 1.8,
  activas: COMIDAS.map(c => c.id),
  repetir: 2,
};
const HORAS_AVISO_DATOS = 48;

let estado = cargarEstado();
let datos = null;        // { productos, actualizado, almacen }
let ingredientesBase = null;
let recetasBase = [];
let ings = {};
let vista = 'plan';
let filtroRecetas = 'todas';
let busquedaRecetas = '';
let subPrecios = 'buscar';
let recetaPendiente = null; // receta creada aún sin guardar
let creador = { tipo: 'principal', metodo: '', proteina: '' };
let recetaAbierta = null;   // receta mostrada en el diálogo
let avisoInstalar = null;   // evento beforeinstallprompt (Android/Chrome)

/** Completa un estado guardado (o importado) con los valores por defecto. */
function normalizarEstado(e = {}) {
  const ajustes = { ...AJUSTES_INICIALES, ...(e.ajustes || {}) };
  delete ajustes.apiKey; // de la versión con IA, ya no se usa
  const planValido = Array.isArray(e.plan) && e.plan.length === 7 && e.plan.every(d => d && typeof d === 'object');
  return {
    ajustes,
    plan: planValido ? e.plan : null,
    fijados: e.fijados || {},
    elecciones: e.elecciones || {},
    comprados: e.comprados || {},
    recetasPropias: Array.isArray(e.recetasPropias) ? e.recetasPropias : [],
  };
}

function cargarEstado() {
  try {
    return normalizarEstado(JSON.parse(localStorage.getItem(CLAVE)) || {});
  } catch {
    return normalizarEstado();
  }
}

function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch { /* sin almacenamiento */ }
}

const recetas = () => [...recetasBase, ...estado.recetasPropias];
const recetasPorId = () => Object.fromEntries(recetas().map(r => [r.id, r]));
const objetivoProt = () => Math.round(estado.ajustes.peso * estado.ajustes.gkg);
const kcalDia = () => kcalObjetivo(estado.ajustes);

/** Factor semanal de raciones (arroz, pasta, patata, pan, avena) para cuadrar las calorías del plan. */
function factorPlan() {
  if (!estado.plan) return { base: 1, racion: 1 };
  return factorRaciones({
    plan: estado.plan, recetasPorId: recetasPorId(), ings, kcalDia: kcalDia(), activas: estado.ajustes.activas,
  });
}

/** Recetas con las raciones ajustadas al objetivo de calorías (las que se usan en el plan y la compra). */
function recetasPlan() {
  const f = factorPlan();
  return Object.fromEntries(recetas().map(r => [r.id, escalarReceta(r, f, ings)]));
}

function recalcularIngredientes() {
  ings = prepararIngredientes(ingredientesBase, datos.productos, estado.elecciones);
}

// ---------- Utilidades ----------

const fmtEuro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const euros = n => (n == null ? '—' : fmtEuro.format(n));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = sel => document.querySelector(sel);
const NO_COMIDA = ['Cuidado del cabello', 'Cuidado facial y corporal', 'Limpieza y hogar', 'Maquillaje', 'Mascotas', 'Fitoterapia y parafarmacia', 'Bebé'];

function enlaceMercadona(p, texto = 'Ver en Mercadona') {
  return p?.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener" style="white-space:nowrap">${texto}&nbsp;↗</a>` : '';
}

function mostrarDialogo(html) {
  $('#dialogo-cuerpo').innerHTML = html;
  const d = $('#dialogo');
  if (!d.open) d.showModal();
}
function cerrarDialogo() { $('#dialogo').close(); }

// ---------- Vistas ----------

function render() {
  document.querySelectorAll('.pestanas button').forEach(b => b.classList.toggle('activa', b.dataset.vista === vista));
  if (!datos) return;
  const vistas = { plan: vistaPlan, recetas: vistaRecetas, compra: vistaCompra, precios: vistaPrecios, ajustes: vistaAjustes };
  $('#vista').innerHTML = avisoDatos() + vistas[vista]();
  if (vista === 'precios' && subPrecios === 'buscar') pintarResultados();
}

// ----- Aviso de datos -----

function avisoDatos() {
  const horas = (Date.now() - new Date(datos.actualizado).getTime()) / 36e5;
  if (!(horas > HORAS_AVISO_DATOS)) return '';
  const dias = Math.floor(horas / 24);
  const repo = repoGithub();
  return `
    <div class="aviso-caja" role="status" style="margin-bottom:12px">
      ⚠️ Los precios son del <b>${fechaDatos()}</b> (hace ${dias} día${dias === 1 ? '' : 's'}).
      ${navigator.onLine === false
    ? 'Estás sin conexión; se actualizarán cuando vuelvas a tener internet.'
    : `La actualización automática puede haber fallado${repo ? `: <a href="${repo}/actions" target="_blank" rel="noopener">revísala en GitHub</a>` : ''}.`}
    </div>`;
}

/** URL del repositorio si la app está publicada en GitHub Pages (usuario.github.io/repo). */
function repoGithub() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return m && repo ? `https://github.com/${m[1]}/${repo}` : null;
}

// ----- Plan -----

function vistaPlan() {
  const obj = objetivoProt();
  const kcal = kcalDia();
  if (!estado.plan) {
    return `
      <div class="tarjeta vacio">
        <div class="grande">📅</div>
        <h2>Tu semana, alta en proteína</h2>
        <p class="sutil">Genero un menú de lunes a domingo con recetas baratas de Mercadona, pensado para unos
        <b>${obj} g de proteína</b> y <b>${kcal.toLocaleString('es-ES')} kcal al día</b>.
        Las comidas y cenas se repiten ${estado.ajustes.repetir} días seguidos para que cocines una vez y guardes tuppers.</p>
        <button class="btn primario" data-accion="generar-plan">✨ Generar mi plan</button>
        <p class="sutil peq">Para afinar las calorías, pon tu peso, altura, edad y actividad en <a href="#" data-accion="ir" data-vista="ajustes">Ajustes</a>.</p>
      </div>`;
  }
  const porId = recetasPlan();
  const factor = factorPlan();
  const dias = estado.plan.map(d => resumenDia(d, porId, ings));
  const conComida = dias.filter(d => d.kcal > 0);
  const media = k => (conComida.length ? Math.round(conComida.reduce((s, d) => s + d[k], 0) / conComida.length) : 0);
  const lista = listaCompra(estado.plan, porId, ings);
  const activas = COMIDAS.filter(c => estado.ajustes.activas.includes(c.id));
  const hayFuera = dias.some(d => d.fuera > 0);
  const ajuste = textoAjuste(factor);
  const desvio = media('kcal') && (media('kcal') - kcal) / kcal;
  const limite = desvio < -0.1 ? 'arriba' : desvio > 0.1 ? 'abajo' : null;

  return `
    <div class="tarjeta pila">
      <div class="cifras">
        <div class="cifra"><b>${media('prot')} g</b><span>proteína/día (objetivo ${obj} g)</span></div>
        <div class="cifra"><b>${media('kcal').toLocaleString('es-ES')}</b><span>kcal/día (objetivo ${kcal.toLocaleString('es-ES')})</span></div>
        <div class="cifra"><b>${euros(lista.totalCaja)}</b><span>compra de la semana</span></div>
      </div>
      ${ajuste || limite ? `<p class="sutil peq">${ajuste ? `⚖️ Para acercarte a tus calorías he ajustado las raciones: <b>${ajuste}</b>.` : ''}
        ${limite === 'arriba' ? 'Aun así te faltan calorías: añade un snack más (por ejemplo, frutos secos) o activa más comidas en Ajustes.' : limite === 'abajo' ? 'Aun así te pasas: quita algún snack o elige platos más ligeros.' : ''}</p>` : ''}
      <div class="fila envolver">
        <button class="btn primario" data-accion="generar-plan">🎲 Otro plan</button>
        <button class="btn" data-accion="ir" data-vista="compra">🛒 Ver la compra</button>
        <button class="btn-texto" data-accion="vaciar-plan">Vaciar</button>
      </div>
      <p class="sutil peq">Toca un plato para ver la receta. Con <b>⋯</b> lo cambias o marcas que <b>comes fuera</b>.
      Con <b>🔒</b> fijas un plato: "Otro plan" lo mantiene (los que eliges a mano se fijan solos).${hayFuera ? ' Los días que comes fuera, la media solo cuenta lo que comes en casa.' : ''}</p>
    </div>
    ${estado.plan.map((dia, d) => {
      const r = dias[d];
      const pct = Math.min(100, Math.round((r.prot / obj) * 100));
      return `
      <section class="tarjeta dia">
        <div class="fila entre">
          <h3>${DIAS[d]}</h3>
          <span class="sutil peq">${r.prot} g prot · ${r.kcal.toLocaleString('es-ES')} kcal · ${euros(r.coste)}</span>
        </div>
        <div class="barra" title="Proteína del día respecto al objetivo" style="margin:8px 0 4px"><i style="width:${pct}%"></i></div>
        ${activas.map(c => hueco(dia, d, c, porId)).join('')}
      </section>`;
    }).join('')}`;
}

function hueco(dia, d, comida, porId) {
  const valor = dia[comida.id];
  const r = valor && valor !== FUERA ? porId[valor] : null;
  const anterior = d > 0 ? estado.plan[d - 1][comida.id] : null;
  const repetido = r && anterior === r.id;
  const fijado = !!(r && estado.fijados[`${d}-${comida.id}`]);
  let contenido;
  if (valor === FUERA) contenido = `<span class="receta">🍽️ Como fuera</span>`;
  else if (r) {
    const a = analizarReceta(r, ings);
    contenido = `<button class="receta" data-accion="ver-receta" data-plan="1" data-id="${esc(r.id)}">${esc(r.nombre)}
      <small>${a.prot} g prot · ${a.kcal} kcal · ${euros(a.coste)}${repetido ? ' · 🍱 de tupper' : ''}${r.airfryer ? ' · airfryer' : ''}</small></button>`;
  } else contenido = `<span class="sutil">—</span>`;

  const opciones = recetas().filter(x => x.tipo.includes(comida.tipo))
    .map(x => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join('');
  return `
    <div class="hueco ${valor === FUERA ? 'fuera' : ''}">
      <span class="tipo">${comida.nombre}</span>
      ${contenido}
      <div class="acciones-hueco">
        ${r ? `<button class="candado ${fijado ? 'activo' : ''}" data-accion="fijar" data-dia="${d}" data-comida="${comida.id}"
          aria-pressed="${fijado}" aria-label="${fijado ? 'Desfijar' : 'Fijar'} ${comida.nombre} del ${DIAS[d]}" title="${fijado ? 'Fijado: Otro plan lo mantiene' : 'Fijar este plato'}">${fijado ? '🔒' : '🔓'}</button>` : ''}
        <select aria-label="Cambiar ${comida.nombre} del ${DIAS[d]}" data-accion="cambiar-hueco" data-dia="${d}" data-comida="${comida.id}">
          <option value="" selected disabled>⋯</option>
          <option value="${FUERA}">🍽️ Como fuera</option>
          <option value="__vacio">— Dejar vacío</option>
          <optgroup label="Recetas">${opciones}</optgroup>
        </select>
      </div>
    </div>`;
}

// ----- Recetas -----

function vistaRecetas() {
  const filtros = [
    ['todas', 'Todas'], ['desayuno', 'Desayunos'], ['principal', 'Comidas y cenas'], ['snack', 'Snacks'],
    ['airfryer', 'Airfryer'], ['tupper', 'Para tupper'], ['propias', 'Mis recetas'],
  ];
  const q = busquedaRecetas.toLowerCase();
  const lista = recetas()
    .filter(r => filtroRecetas === 'todas'
      || (filtroRecetas === 'airfryer' && r.airfryer)
      || (filtroRecetas === 'tupper' && r.tupper)
      || (filtroRecetas === 'propias' && r.propia)
      || r.tipo.includes(filtroRecetas))
    .filter(r => !q || r.nombre.toLowerCase().includes(q))
    .map(r => ({ r, a: analizarReceta(r, ings) }))
    .sort((x, y) => y.a.prot / Math.max(y.a.coste, .3) - x.a.prot / Math.max(x.a.coste, .3));

  return `
    ${tarjetaCrear()}
    <input type="search" placeholder="Buscar receta…" value="${esc(busquedaRecetas)}" data-accion="buscar-receta" aria-label="Buscar receta" style="margin-bottom:10px">
    <div class="chips">${filtros.map(([id, t]) => `<button class="chip ${filtroRecetas === id ? 'activa' : ''}" data-accion="filtro-recetas" data-filtro="${id}">${t}</button>`).join('')}</div>
    <p class="sutil peq">Ordenadas por proteína por euro. Precios por ración con los productos más baratos de Mercadona.</p>
    <div class="lista-recetas">
      ${lista.map(({ r, a }) => `
        <button class="tarjeta receta-tarjeta" data-accion="ver-receta" data-id="${esc(r.id)}">
          <h3>${esc(r.nombre)}</h3>
          <div class="macros">
            <span><b>${a.prot} g</b> proteína</span><span><b>${a.kcal}</b> kcal</span>
            <span><b>${euros(a.coste)}</b>/ración</span><span>⏱ ${r.tiempo} min</span>
          </div>
          <div class="fila envolver" style="margin-top:6px">
            ${r.tipo.map(t => `<span class="insignia">${{ desayuno: 'Desayuno', principal: 'Comida/cena', snack: 'Snack' }[t]}</span>`).join('')}
            ${r.airfryer ? '<span class="insignia">Airfryer</span>' : ''}
            ${r.tupper ? '<span class="insignia">Tupper</span>' : ''}
            ${r.propia ? '<span class="insignia aviso">Creada por ti</span>' : ''}
          </div>
        </button>`).join('') || '<p class="sutil">No hay recetas con ese filtro.</p>'}
    </div>`;
}

function tarjetaCrear() {
  const { tipo, metodo, proteina } = creador;
  const proteinas = proteinasDisponibles(tipo, tipo === 'principal' ? metodo : '', ings);
  return `
    <div class="tarjeta pila">
      <h3>🎲 Crear una receta nueva</h3>
      <p class="sutil peq">Combina una proteína, una base y verduras con lo más barato de Mercadona y ajusta las cantidades a tu objetivo de proteína. Gratis.</p>
      <div class="fila envolver">
        <select data-accion="creador" data-campo="tipo" aria-label="Tipo de receta" style="flex:1 1 120px">
          ${[['principal', 'Comida/cena'], ['desayuno', 'Desayuno'], ['snack', 'Snack']].map(([v, t]) => `<option value="${v}" ${tipo === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        ${tipo === 'principal' ? `
        <select data-accion="creador" data-campo="metodo" aria-label="Cómo cocinarla" style="flex:1 1 120px">
          ${METODOS.map(([v, t]) => `<option value="${v}" ${metodo === v ? 'selected' : ''}>${v ? t : 'Cualquier forma'}</option>`).join('')}
        </select>` : ''}
        <select data-accion="creador" data-campo="proteina" aria-label="Proteína" style="flex:1 1 120px">
          <option value="">Proteína: la más barata</option>
          ${proteinas.map(p => `<option value="${p.id}" ${proteina === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="fila"><button class="btn primario" data-accion="crear-receta">Crear receta</button><span id="crear-estado" class="sutil peq"></span></div>
    </div>`;
}

function detalleReceta(r, { pendiente = false } = {}) {
  recetaAbierta = r;
  const a = analizarReceta(r, ings);
  const filas = r.ingredientes.map(it => {
    const ing = ings[it.id];
    if (!ing) return '';
    if (ing.sin_precio) return `<li><span class="crece">${esc(ing.nombre)}</span></li>`;
    const el = ing.elegido;
    const selector = ing.candidatos.length > 1 ? `
      <select data-accion="elegir-producto" data-ing="${esc(ing.id)}" aria-label="Producto para ${esc(ing.nombre)}" style="margin-top:6px;font-size:.85rem">
        ${ing.candidatos.slice(0, 8).map(c => `<option value="${esc(c.producto.id)}" ${c === el ? 'selected' : ''}>
          ${esc(c.producto.nombre)} — ${euros(c.producto.precio)} (${euros(c.pu * (ing.u === 'g' ? 1000 : 1))}/${ing.u === 'g' ? 'kg' : 'ud'})</option>`).join('')}
      </select>` : '';
    return `
      <li>
        ${el?.producto.img ? `<img src="${esc(el.producto.img)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : ''}
        <div class="crece">
          <div><b>${textoCantidad(ing, it.cant)}</b> ${esc(ing.nombre)}</div>
          <div class="sutil peq">${el ? `${esc(el.producto.nombre)} · ${euros(el.producto.precio)} · ${enlaceMercadona(el.producto, 'Mercadona')}` : 'Sin producto en Mercadona'}</div>
          ${selector}
        </div>
        <span class="precio">${el ? euros(el.pu * it.cant) : ''}</span>
      </li>`;
  }).join('');

  return `
    <h2>${esc(r.nombre)}</h2>
    <div class="fila envolver" style="margin-bottom:10px">
      <span class="insignia">⏱ ${r.tiempo} min</span>
      ${r.airfryer ? '<span class="insignia">Airfryer</span>' : ''}
      ${r.tupper ? '<span class="insignia">Aguanta en tupper</span>' : ''}
      ${r.propia ? '<span class="insignia aviso">Creada por ti</span>' : ''}
    </div>
    <div class="cifras" style="margin-bottom:12px">
      <div class="cifra"><b>${a.prot} g</b><span>proteína</span></div>
      <div class="cifra"><b>${a.kcal}</b><span>kcal · ${a.hc} g HC · ${a.grasa} g grasa</span></div>
      <div class="cifra"><b>${euros(a.coste)}</b><span>por ración</span></div>
    </div>
    <h3>Ingredientes (1 ración)</h3>
    ${r.factor && textoAjuste(r.factor) ? `<p class="sutil peq">⚖️ Ración ajustada a tus calorías: ${textoAjuste(r.factor)}.</p>` : ''}
    <ul class="items">${filas}</ul>
    <p class="sutil peq">El coste es la parte proporcional de cada producto. Puedes cambiar el producto de Mercadona de cada ingrediente; se aplica a todas las recetas.</p>
    <h3>Preparación</h3>
    <ol class="pasos">${r.pasos.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
    <p class="sutil peq">Valores nutricionales orientativos.</p>
    ${pendiente ? `<div class="fila envolver"><button class="btn primario" data-accion="guardar-propia">Guardar en mis recetas</button>
      <button class="btn" data-accion="crear-receta">🎲 Otra distinta</button><button class="btn-texto" data-cerrar>Descartar</button></div>
      <p class="sutil peq">Al guardarla, también podrá salir en tus planes semanales.</p>` : ''}
    ${r.propia && !pendiente ? `<button class="btn-texto" data-accion="borrar-propia" data-id="${esc(r.id)}">Eliminar esta receta</button>` : ''}`;
}

// ----- Compra -----

function vistaCompra() {
  if (!estado.plan) {
    return `<div class="tarjeta vacio"><div class="grande">🛒</div><h2>Aún no hay lista</h2>
      <p class="sutil">La lista se crea sola a partir de tu plan semanal.</p>
      <button class="btn primario" data-accion="ir" data-vista="plan">Ir al plan</button></div>`;
  }
  const { items, totalCaja, totalConsumido } = listaCompra(estado.plan, recetasPlan(), ings);
  const compra = items.filter(i => !i.ing.despensa);
  const despensa = items.filter(i => i.ing.despensa);
  const grupos = {};
  for (const it of compra) (grupos[it.pasillo.nombre] ||= []).push(it);
  const hechos = compra.filter(i => estado.comprados[i.id]).length;

  const fila = it => {
    const p = it.producto;
    const cuanto = it.envases ? `${it.envases} × ${esc(p.nombre)}` : `≈ ${textoCantidad(it.ing, it.cant)} de ${esc(p?.nombre || it.ing.nombre)}`;
    return `
      <li class="${estado.comprados[it.id] ? 'hecho' : ''}">
        <input type="checkbox" data-accion="comprado" data-id="${esc(it.id)}" ${estado.comprados[it.id] ? 'checked' : ''} aria-label="Comprado: ${esc(it.ing.nombre)}">
        ${p?.img ? `<img src="${esc(p.img)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : ''}
        <div class="crece">
          <div class="nombre"><b>${esc(it.ing.nombre)}</b></div>
          <div class="sutil peq">${cuanto}${p?.formato ? ` (${esc(p.formato.toLowerCase())})` : ''}</div>
          <div class="sutil peq">Necesitas ${textoCantidad(it.ing, it.cant)} · ${enlaceMercadona(p, 'Mercadona')}</div>
        </div>
        <span class="precio">${euros(it.costeCaja)}</span>
      </li>`;
  };

  return `
    <div class="tarjeta pila">
      <div class="cifras">
        <div class="cifra"><b>${euros(totalCaja)}</b><span>en caja (aprox.)</span></div>
        <div class="cifra"><b>${euros(totalConsumido)}</b><span>lo que te comes esta semana</span></div>
        <div class="cifra"><b>${hechos}/${compra.length}</b><span>productos en el carro</span></div>
      </div>
      <p class="sutil peq">Ordenada por pasillos, con los congelados al final para que no se calienten en el carro.
      Para cada ingrediente elijo el envase que menos cuesta para la cantidad que necesitas;
      la diferencia entre "en caja" y "lo que te comes" es lo que te sobra para la semana siguiente.</p>
      <div class="fila envolver">
        <button class="btn" data-accion="copiar-lista">📋 Copiar lista</button>
        <button class="btn-texto" data-accion="desmarcar">Desmarcar todo</button>
      </div>
    </div>
    <div class="tarjeta">
      ${Object.entries(grupos).map(([cat, its]) => `<div class="grupo-titulo">${esc(cat)}</div><ul class="items">${its.map(fila).join('')}</ul>`).join('')}
    </div>
    ${despensa.length ? `
    <div class="tarjeta">
      <h3>Despensa</h3>
      <p class="sutil peq">Comprueba que te queda; no se suma al total.</p>
      <ul class="items">${despensa.map(fila).join('')}</ul>
    </div>` : ''}`;
}

function textoLista() {
  const { items, totalCaja } = listaCompra(estado.plan, recetasPlan(), ings);
  const lineas = [];
  let grupo = null;
  for (const i of items.filter(x => !x.ing.despensa && !estado.comprados[x.id])) {
    if (i.pasillo.nombre !== grupo) { grupo = i.pasillo.nombre; lineas.push(`\n*${grupo}*`); }
    lineas.push(`- ${i.envases ? `${i.envases} × ` : ''}${i.producto?.nombre || i.ing.nombre} (${euros(i.costeCaja)})`);
  }
  return `🛒 Lista de la compra (Mercadona)${lineas.join('\n')}\n\nTotal aprox.: ${euros(totalCaja)}`;
}

// ----- Precios -----

function vistaPrecios() {
  const subs = [['buscar', '🔎 Lo más barato'], ['proteina', '💪 Proteína barata'], ['bajadas', '📉 Bajadas de precio']];
  let cuerpo = '';
  if (subPrecios === 'buscar') {
    const cats = [...new Set(datos.productos.map(p => p.cat))].filter(c => !NO_COMIDA.includes(c)).sort();
    cuerpo = `
      <div class="tarjeta pila">
        <input type="search" id="buscador" placeholder="Busca un producto: atún, yogur, pechuga…" data-accion="buscar-producto" aria-label="Buscar producto">
        <select id="categoria" data-accion="buscar-producto" aria-label="Categoría">
          <option value="">Todas las categorías</option>
          ${cats.map(c => `<option>${esc(c)}</option>`).join('')}
        </select>
        <p class="sutil peq">Ordenado de más barato a más caro por precio de referencia (€/kg, €/L…), que es lo que de verdad compara.</p>
      </div>
      <div id="resultados"></div>`;
  } else if (subPrecios === 'proteina') {
    const ranking = rankingProteina(ings);
    cuerpo = `
      <div class="tarjeta">
        <p class="sutil peq">Cuánto cuesta conseguir <b>100 g de proteína</b> con cada fuente de proteína, usando el producto más barato de Mercadona.
        Solo incluye alimentos en los que al menos el 25 % de las calorías son proteína.</p>
        <ul class="items">
          ${ranking.map(({ ing, euros100gProt }, i) => `
            <li>
              <span class="sutil" style="width:22px">${i + 1}</span>
              <div class="crece">
                <div><b>${esc(ing.nombre)}</b> <span class="sutil peq">${ing.n[1]} g prot/100 g</span></div>
                <div class="sutil peq">${esc(ing.elegido.producto.nombre)} · ${enlaceMercadona(ing.elegido.producto, 'Mercadona')}</div>
              </div>
              <span class="precio">${euros(euros100gProt)}</span>
            </li>`).join('')}
        </ul>
      </div>`;
  } else {
    const bajadas = datos.productos
      .filter(p => p.bajada && p.precio_antes > p.precio && !NO_COMIDA.includes(p.cat))
      .map(p => ({ p, pct: (1 - p.precio / p.precio_antes) * 100 }))
      .sort((a, b) => b.pct - a.pct);
    cuerpo = `
      <div class="tarjeta">
        <p class="sutil peq">Productos de alimentación que han bajado de precio recientemente según Mercadona (${bajadas.length}).</p>
        <ul class="items">${bajadas.slice(0, 80).map(({ p, pct }) => filaProducto(p, `−${Math.round(pct)} %`)).join('') || '<li class="sutil">No hay bajadas ahora mismo.</li>'}</ul>
      </div>`;
  }
  return `
    <div class="chips">${subs.map(([id, t]) => `<button class="chip ${subPrecios === id ? 'activa' : ''}" data-accion="sub-precios" data-sub="${id}">${t}</button>`).join('')}</div>
    ${cuerpo}`;
}

function filaProducto(p, extra = '') {
  const cmp = precioComparable(p);
  return `
    <li>
      ${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : ''}
      <div class="crece">
        <div><b>${esc(p.nombre)}</b> ${extra ? `<span class="insignia">${extra}</span>` : ''}</div>
        <div class="sutil peq">${esc(p.sub)} · ${p.formato ? esc(p.formato) + ' · ' : ''}${enlaceMercadona(p, 'Mercadona')}</div>
      </div>
      <div style="text-align:right">
        <div class="precio">${euros(p.precio)}</div>
        <div class="sutil peq">${euros(cmp.valor)}/${esc(cmp.unidad)}</div>
        ${p.bajada && p.precio_antes ? `<div class="sutil peq"><s>${euros(p.precio_antes)}</s></div>` : ''}
      </div>
    </li>`;
}

function pintarResultados() {
  const caja = $('#resultados');
  if (!caja) return;
  const texto = $('#buscador')?.value || '';
  const categoria = $('#categoria')?.value || '';
  if (!texto.trim() && !categoria) {
    caja.innerHTML = '<p class="sutil" style="text-align:center">Escribe algo o elige una categoría.</p>';
    return;
  }
  const res = buscarProductos(datos.productos.filter(p => !NO_COMIDA.includes(p.cat) || categoria), texto, { categoria });
  caja.innerHTML = `<div class="tarjeta"><p class="sutil peq">${res.length} productos${res.length > 60 ? ' (mostrando los 60 más baratos)' : ''}</p>
    <ul class="items">${res.slice(0, 60).map(({ p }) => filaProducto(p, p.bajada ? 'Ha bajado' : '')).join('')}</ul></div>`;
}

// ----- Ajustes -----

function vistaAjustes() {
  const a = estado.ajustes;
  const num = (id, etiqueta, min, max, paso) => `
    <div class="crece"><label for="${id}">${etiqueta}</label>
      <input id="${id}" type="number" inputmode="decimal" min="${min}" max="${max}" step="${paso}" value="${a[id] || ''}" data-accion="ajuste" data-campo="${id}"></div>`;
  const opciones = (lista, actual) => lista.map(([v, t]) => `<option value="${v}" ${String(actual) === String(v) ? 'selected' : ''}>${t}</option>`).join('');
  return `
    <div class="tarjeta pila">
      <h3>Tu objetivo</h3>
      <div class="rejilla-2">
        ${num('peso', 'Peso (kg)', 30, 250, 0.5)}
        ${num('altura', 'Altura (cm)', 120, 230, 1)}
        ${num('edad', 'Edad', 14, 100, 1)}
        <div class="crece"><label for="sexo">Sexo (para la fórmula)</label>
          <select id="sexo" data-accion="ajuste" data-campo="sexo" data-tipo="texto">${opciones([['', 'Prefiero no decirlo'], ['h', 'Hombre'], ['m', 'Mujer']], a.sexo)}</select></div>
      </div>
      <div><label for="actividad">Actividad física</label>
        <select id="actividad" data-accion="ajuste" data-campo="actividad">${opciones(ACTIVIDADES, a.actividad)}</select></div>
      <div><label for="objetivo">Objetivo</label>
        <select id="objetivo" data-accion="ajuste" data-campo="objetivo" data-tipo="texto">${opciones(OBJETIVOS, a.objetivo)}</select></div>
      <div class="rejilla-2">
        ${num('gkg', 'Proteína (g por kg)', 0.8, 3, 0.1)}
        <div class="crece"><label for="kcalManual">Calorías a mano (opcional)</label>
          <input id="kcalManual" type="number" inputmode="numeric" min="0" max="6000" step="50" placeholder="Automático" value="${a.kcalManual || ''}" data-accion="ajuste" data-campo="kcalManual"></div>
      </div>
      <div class="cifras" style="grid-template-columns:1fr 1fr">
        <div class="cifra"><b>${kcalDia().toLocaleString('es-ES')} kcal</b><span>al día${a.kcalManual ? ' (fijadas a mano)' : ''}</span></div>
        <div class="cifra"><b>${objetivoProt()} g</b><span>de proteína al día</span></div>
      </div>
      <p class="sutil peq">Las calorías se calculan con la fórmula de Mifflin-St Jeor según tu actividad y objetivo, y el plan ajusta las
      raciones de arroz, pasta, patata, pan y avena para acercarse. Entre 1,6 y 2 g de proteína por kg es lo habitual si entrenas.
      Es una orientación general; si tienes alguna condición de salud, consúltalo con un profesional.</p>
    </div>
    <div class="tarjeta pila">
      <h3>Qué comidas planificar</h3>
      ${COMIDAS.map(c => `<label class="fila" style="margin:0"><input type="checkbox" data-accion="activa" data-comida="${c.id}" ${a.activas.includes(c.id) ? 'checked' : ''}> ${c.nombre}</label>`).join('')}
      <label for="repetir" style="margin-top:10px">Repetir comidas y cenas (batch cooking)</label>
      <select id="repetir" data-accion="ajuste" data-campo="repetir">
        ${[1, 2, 3].map(n => `<option value="${n}" ${a.repetir === n ? 'selected' : ''}>${n === 1 ? 'No, cada día algo distinto' : `${n} días seguidos el mismo plato`}</option>`).join('')}
      </select>
      <p class="sutil peq">Los cambios se aplican la próxima vez que generes el plan.</p>
    </div>
    ${tarjetaInstalar()}
    <div class="tarjeta pila">
      <h3>Copia de seguridad</h3>
      <p class="sutil peq">Tu plan, ajustes, recetas creadas y productos elegidos se guardan solo en este navegador.
      Exporta una copia para no perderlos o para pasarlos a otro móvil.</p>
      <div class="fila envolver">
        <button class="btn" data-accion="exportar">⬇️ Exportar copia</button>
        <label class="btn" style="margin:0">⬆️ Importar copia
          <input type="file" accept="application/json,.json" data-accion="importar" hidden></label>
      </div>
      <p id="copia-estado" class="sutil peq" role="status"></p>
    </div>
    <div class="tarjeta pila">
      <h3>Datos</h3>
      <p class="sutil peq">${datos.productos.length.toLocaleString('es-ES')} productos de Mercadona (almacén ${esc(datos.almacen)}),
      actualizados ${fechaDatos()}. Se descargan solos cada día desde la tienda online; los precios pueden variar un poco en tienda.</p>
      <button class="btn-texto" data-accion="reiniciar" style="color:var(--rojo)">Borrar todos mis datos de esta app</button>
    </div>`;
}

function tarjetaInstalar() {
  const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let contenido;
  if (instalada) contenido = '<p class="sutil peq">✓ Ya la tienes instalada. Funciona sin conexión con los últimos precios descargados.</p>';
  else if (avisoInstalar) contenido = '<button class="btn primario" data-accion="instalar">📲 Instalar en este móvil</button>';
  else if (ios) contenido = '<p class="sutil peq">En Safari, pulsa <b>Compartir</b> (□↑) y luego <b>Añadir a pantalla de inicio</b>.</p>';
  else contenido = '<p class="sutil peq">En Chrome, abre el menú <b>⋮</b> y pulsa <b>Instalar aplicación</b> o <b>Añadir a pantalla de inicio</b>.</p>';
  return `
    <div class="tarjeta pila">
      <h3>Instalar como app</h3>
      <p class="sutil peq">Con su icono en la pantalla de inicio y funcionando sin conexión: en el súper verás la lista aunque no tengas cobertura.</p>
      ${contenido}
    </div>`;
}

function exportarCopia() {
  const copia = { app: 'compra-sana', version: 1, fecha: new Date().toISOString(), estado };
  const blob = new Blob([JSON.stringify(copia, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `compra-sana-copia-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  const info = $('#copia-estado');
  if (info) info.textContent = '✓ Copia descargada. Guárdala en tus archivos o en la nube.';
}

async function importarCopia(archivo) {
  const info = $('#copia-estado');
  try {
    const copia = JSON.parse(await archivo.text());
    if (copia?.app !== 'compra-sana' || typeof copia.estado !== 'object') throw new Error('formato');
    const n = copia.estado.recetasPropias?.length || 0;
    const fecha = new Date(copia.fecha).toLocaleDateString('es-ES');
    if (!confirm(`¿Restaurar la copia del ${fecha}? Sustituirá tu plan, ajustes y recetas actuales (${n} recetas creadas en la copia).`)) return;
    estado = normalizarEstado(copia.estado);
    guardar(); recalcularIngredientes(); render();
    const nueva = $('#copia-estado');
    if (nueva) nueva.textContent = '✓ Copia restaurada.';
  } catch {
    if (info) info.textContent = 'Ese archivo no es una copia válida de Compra Sana.';
  }
}

function fechaDatos() {
  const f = new Date(datos.actualizado);
  return isNaN(f) ? 'hace poco' : f.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ---------- Acciones ----------

function generarNuevoPlan() {
  estado.plan = generarPlan({
    recetas: recetas(),
    ings,
    planActual: estado.plan,
    activas: estado.ajustes.activas,
    repetir: estado.ajustes.repetir,
    fijados: estado.fijados,
    semilla: Math.floor(Math.random() * 1e9),
  });
  estado.comprados = {};
  guardar();
  render();
}

function crearNuevaReceta() {
  const { tipo, metodo, proteina } = creador;
  const objetivo = Math.round(objetivoProt() * (tipo === 'principal' ? 0.3 : tipo === 'desayuno' ? 0.2 : 0.12));
  const receta = crearReceta({ tipo, metodo: tipo === 'principal' ? metodo : '', proteina, ings, objetivo, semilla: Math.floor(Math.random() * 1e9) });
  if (!receta) {
    const info = $('#crear-estado');
    if (info) info.textContent = 'No encuentro una combinación con esas opciones. Prueba con otras.';
    return;
  }
  recetaPendiente = receta;
  mostrarDialogo(detalleReceta(receta, { pendiente: true }));
}

document.addEventListener('click', async e => {
  if (e.target.closest('[data-cerrar]')) { cerrarDialogo(); return; }
  const nav = e.target.closest('.pestanas button');
  if (nav) { vista = nav.dataset.vista; render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-accion]');
  if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  if (el.tagName === 'A') e.preventDefault();
  const accion = el.dataset.accion;

  if (accion === 'generar-plan') generarNuevoPlan();
  else if (accion === 'vaciar-plan') {
    if (confirm('¿Vaciar el plan de la semana?')) { estado.plan = null; estado.fijados = {}; estado.comprados = {}; guardar(); render(); }
  } else if (accion === 'ir') { vista = el.dataset.vista; render(); window.scrollTo(0, 0); }
  else if (accion === 'ver-receta') {
    const r = (el.dataset.plan ? recetasPlan() : recetasPorId())[el.dataset.id];
    if (r) mostrarDialogo(detalleReceta(r));
  } else if (accion === 'fijar') {
    const clave = `${el.dataset.dia}-${el.dataset.comida}`;
    if (estado.fijados[clave]) delete estado.fijados[clave]; else estado.fijados[clave] = true;
    guardar(); render();
  } else if (accion === 'exportar') exportarCopia();
  else if (accion === 'instalar' && avisoInstalar) {
    avisoInstalar.prompt();
    await avisoInstalar.userChoice.catch(() => null);
    avisoInstalar = null; render();
  } else if (accion === 'filtro-recetas') { filtroRecetas = el.dataset.filtro; render(); }
  else if (accion === 'sub-precios') { subPrecios = el.dataset.sub; render(); }
  else if (accion === 'copiar-lista') {
    try { await navigator.clipboard.writeText(textoLista()); el.textContent = '✓ Copiada'; }
    catch { prompt('Copia la lista:', textoLista()); }
  } else if (accion === 'desmarcar') { estado.comprados = {}; guardar(); render(); }
  else if (accion === 'crear-receta') crearNuevaReceta();
  else if (accion === 'guardar-propia' && recetaPendiente) {
    estado.recetasPropias.push(recetaPendiente);
    recetaPendiente = null;
    guardar(); cerrarDialogo(); filtroRecetas = 'propias'; vista = 'recetas'; render();
  } else if (accion === 'borrar-propia') {
    if (confirm('¿Eliminar esta receta?')) {
      estado.recetasPropias = estado.recetasPropias.filter(r => r.id !== el.dataset.id);
      if (estado.plan) estado.plan.forEach(dia => Object.keys(dia).forEach(c => { if (dia[c] === el.dataset.id) dia[c] = null; }));
      guardar(); cerrarDialogo(); render();
    }
  }
  else if (accion === 'reiniciar') {
    if (confirm('Se borrarán tu plan, ajustes y recetas creadas de este navegador. ¿Seguro?')) {
      try { localStorage.removeItem(CLAVE); } catch { /* nada */ }
      estado = cargarEstado(); recalcularIngredientes(); render();
    }
  }
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-accion]');
  if (!el) return;
  const accion = el.dataset.accion;
  if (accion === 'cambiar-hueco') {
    const d = Number(el.dataset.dia), c = el.dataset.comida;
    estado.plan[d][c] = el.value === '__vacio' ? null : el.value;
    // Lo que eliges a mano se fija para que "Otro plan" no lo cambie
    if (el.value === '__vacio' || el.value === FUERA) delete estado.fijados[`${d}-${c}`];
    else estado.fijados[`${d}-${c}`] = true;
    guardar(); render();
  } else if (accion === 'comprado') {
    if (el.checked) estado.comprados[el.dataset.id] = true; else delete estado.comprados[el.dataset.id];
    guardar();
    render();
  } else if (accion === 'elegir-producto') {
    estado.elecciones[el.dataset.ing] = el.value;
    guardar(); recalcularIngredientes();
    const r = recetaAbierta;
    if (r) mostrarDialogo(detalleReceta(r, { pendiente: r === recetaPendiente }));
    render();
  } else if (accion === 'ajuste') {
    const campo = el.dataset.campo;
    if (el.dataset.tipo === 'texto') estado.ajustes[campo] = el.value;
    else {
      const v = el.value === '' ? 0 : Number(el.value);
      if (!Number.isFinite(v) || v < 0 || (v === 0 && campo !== 'kcalManual')) return;
      estado.ajustes[campo] = v;
    }
    guardar(); render();
  } else if (accion === 'importar') {
    const archivo = el.files?.[0];
    if (archivo) importarCopia(archivo);
    el.value = '';
  } else if (accion === 'activa') {
    const set = new Set(estado.ajustes.activas);
    if (el.checked) set.add(el.dataset.comida); else set.delete(el.dataset.comida);
    estado.ajustes.activas = COMIDAS.map(c => c.id).filter(id => set.has(id));
    guardar();
  } else if (accion === 'buscar-producto') pintarResultados();
  else if (accion === 'creador') {
    creador[el.dataset.campo] = el.value;
    if (el.dataset.campo !== 'proteina') creador.proteina = '';
    render();
  }
});

document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.accion === 'buscar-producto') pintarResultados();
  else if (el.dataset.accion === 'buscar-receta') {
    busquedaRecetas = el.value;
    const pos = el.selectionStart;
    render();
    const nuevo = document.querySelector('[data-accion="buscar-receta"]');
    nuevo.focus(); nuevo.setSelectionRange(pos, pos);
  }
});

$('#dialogo').addEventListener('click', e => { if (e.target.id === 'dialogo') cerrarDialogo(); });

// ---------- Arranque ----------

async function iniciar() {
  try {
    const [merc, ingr, rec] = await Promise.all(
      ['data/mercadona.json', 'data/ingredientes.json', 'data/recetas.json'].map(f => fetch(f).then(r => {
        if (!r.ok) throw new Error(`${f}: ${r.status}`);
        return r.json();
      })),
    );
    datos = merc;
    ingredientesBase = ingr;
    recetasBase = rec;
    recalcularIngredientes();
    pintarCabecera();
    render();
  } catch (e) {
    console.error(e);
    $('#estado-datos').textContent = 'No se han podido cargar los datos';
    $('#vista').innerHTML = `<div class="tarjeta aviso-caja">No se han podido cargar los precios (${esc(e.message)}).
      Si estás abriendo el archivo directamente, usa un servidor local: <code>python3 -m http.server</code>.</div>`;
  }
}

function pintarCabecera() {
  if (!datos) return;
  $('#estado-datos').textContent = `Precios de Mercadona · ${fechaDatos()}${navigator.onLine === false ? ' · sin conexión' : ''}`;
}

addEventListener('online', () => { pintarCabecera(); render(); });
addEventListener('offline', () => { pintarCabecera(); render(); });
addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  avisoInstalar = e;
  if (vista === 'ajustes') render();
});
addEventListener('appinstalled', () => { avisoInstalar = null; if (vista === 'ajustes') render(); });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Sin modo offline:', err));
}

iniciar();
