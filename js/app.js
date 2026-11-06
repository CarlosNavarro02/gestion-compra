import {
  DIAS, COMIDAS, FUERA, prepararIngredientes, analizarReceta, generarPlan, resumenDia,
  listaCompra, buscarProductos, precioComparable, rankingProteina, textoCantidad,
} from './motor.js';

// ---------- Estado ----------

const CLAVE = 'compra-sana:v1';
const AJUSTES_INICIALES = {
  peso: 70,
  gkg: 1.8,
  activas: COMIDAS.map(c => c.id),
  repetir: 2,
  apiKey: '',
};

let estado = cargarEstado();
let datos = null;        // { productos, actualizado, almacen }
let ingredientesBase = null;
let recetasBase = [];
let ings = {};
let vista = 'plan';
let filtroRecetas = 'todas';
let busquedaRecetas = '';
let subPrecios = 'buscar';
let recetaPendiente = null; // receta IA generada aún sin guardar
let recetaAbierta = null;   // receta mostrada en el diálogo

function cargarEstado() {
  try {
    const e = JSON.parse(localStorage.getItem(CLAVE)) || {};
    return {
      ajustes: { ...AJUSTES_INICIALES, ...(e.ajustes || {}) },
      plan: e.plan || null,
      elecciones: e.elecciones || {},
      comprados: e.comprados || {},
      recetasIA: e.recetasIA || [],
    };
  } catch {
    return { ajustes: { ...AJUSTES_INICIALES }, plan: null, elecciones: {}, comprados: {}, recetasIA: [] };
  }
}

function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch { /* sin almacenamiento */ }
}

const recetas = () => [...recetasBase, ...estado.recetasIA];
const recetasPorId = () => Object.fromEntries(recetas().map(r => [r.id, r]));
const objetivoProt = () => Math.round(estado.ajustes.peso * estado.ajustes.gkg);

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
  $('#vista').innerHTML = vistas[vista]();
  if (vista === 'precios' && subPrecios === 'buscar') pintarResultados();
}

// ----- Plan -----

function vistaPlan() {
  const obj = objetivoProt();
  if (!estado.plan) {
    return `
      <div class="tarjeta vacio">
        <div class="grande">📅</div>
        <h2>Tu semana, alta en proteína</h2>
        <p class="sutil">Genero un menú de lunes a domingo con recetas baratas de Mercadona, pensado para unos
        <b>${obj} g de proteína al día</b> (${estado.ajustes.peso} kg × ${String(estado.ajustes.gkg).replace('.', ',')} g/kg).
        Las comidas y cenas se repiten ${estado.ajustes.repetir} días seguidos para que cocines una vez y guardes tuppers.</p>
        <button class="btn primario" data-accion="generar-plan">✨ Generar mi plan</button>
        <p class="sutil peq">Puedes cambiar tu peso y qué comidas planificar en Ajustes.</p>
      </div>`;
  }
  const porId = recetasPorId();
  const dias = estado.plan.map(d => resumenDia(d, porId, ings));
  const conComida = dias.filter(d => d.kcal > 0);
  const media = k => (conComida.length ? Math.round(conComida.reduce((s, d) => s + d[k], 0) / conComida.length) : 0);
  const lista = listaCompra(estado.plan, porId, ings);
  const activas = COMIDAS.filter(c => estado.ajustes.activas.includes(c.id));

  return `
    <div class="tarjeta pila">
      <div class="cifras">
        <div class="cifra"><b>${media('prot')} g</b><span>proteína/día (objetivo ${obj} g)</span></div>
        <div class="cifra"><b>${media('kcal')}</b><span>kcal/día de media</span></div>
        <div class="cifra"><b>${euros(lista.totalCaja)}</b><span>compra de la semana</span></div>
      </div>
      <div class="fila envolver">
        <button class="btn primario" data-accion="generar-plan">🎲 Otro plan</button>
        <button class="btn" data-accion="ir" data-vista="compra">🛒 Ver la compra</button>
        <button class="btn-texto" data-accion="vaciar-plan">Vaciar</button>
      </div>
      <p class="sutil peq">Toca un plato para ver la receta. Con <b>⋯</b> lo cambias o marcas que <b>comes fuera</b>
      (no cuenta para la compra). Al generar otro plan se respetan las comidas fuera.</p>
    </div>
    ${estado.plan.map((dia, d) => {
      const r = dias[d];
      const pct = Math.min(100, Math.round((r.prot / obj) * 100));
      return `
      <section class="tarjeta dia">
        <div class="fila entre">
          <h3>${DIAS[d]}</h3>
          <span class="sutil peq">${r.prot} g prot · ${r.kcal} kcal · ${euros(r.coste)}</span>
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
  let contenido;
  if (valor === FUERA) contenido = `<span class="receta">🍽️ Como fuera</span>`;
  else if (r) {
    const a = analizarReceta(r, ings);
    contenido = `<button class="receta" data-accion="ver-receta" data-id="${esc(r.id)}">${esc(r.nombre)}
      <small>${a.prot} g prot · ${a.kcal} kcal · ${euros(a.coste)}${repetido ? ' · 🍱 de tupper' : ''}${r.airfryer ? ' · airfryer' : ''}</small></button>`;
  } else contenido = `<span class="sutil">—</span>`;

  const opciones = recetas().filter(x => x.tipo.includes(comida.tipo))
    .map(x => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join('');
  return `
    <div class="hueco ${valor === FUERA ? 'fuera' : ''}">
      <span class="tipo">${comida.nombre}</span>
      ${contenido}
      <select aria-label="Cambiar ${comida.nombre} del ${DIAS[d]}" data-accion="cambiar-hueco" data-dia="${d}" data-comida="${comida.id}">
        <option value="" selected disabled>⋯</option>
        <option value="${FUERA}">🍽️ Como fuera</option>
        <option value="__vacio">— Dejar vacío</option>
        <optgroup label="Recetas">${opciones}</optgroup>
      </select>
    </div>`;
}

// ----- Recetas -----

function vistaRecetas() {
  const filtros = [
    ['todas', 'Todas'], ['desayuno', 'Desayunos'], ['principal', 'Comidas y cenas'], ['snack', 'Snacks'],
    ['airfryer', 'Airfryer'], ['tupper', 'Para tupper'], ['ia', 'Mis recetas IA'],
  ];
  const q = busquedaRecetas.toLowerCase();
  const lista = recetas()
    .filter(r => filtroRecetas === 'todas'
      || (filtroRecetas === 'airfryer' && r.airfryer)
      || (filtroRecetas === 'tupper' && r.tupper)
      || (filtroRecetas === 'ia' && r.ia)
      || r.tipo.includes(filtroRecetas))
    .filter(r => !q || r.nombre.toLowerCase().includes(q))
    .map(r => ({ r, a: analizarReceta(r, ings) }))
    .sort((x, y) => y.a.prot / Math.max(y.a.coste, .3) - x.a.prot / Math.max(x.a.coste, .3));

  return `
    ${tarjetaIA()}
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
            ${r.ia ? '<span class="insignia aviso">IA</span>' : ''}
          </div>
        </button>`).join('') || '<p class="sutil">No hay recetas con ese filtro.</p>'}
    </div>`;
}

function tarjetaIA() {
  if (!estado.ajustes.apiKey) {
    return `
      <div class="tarjeta">
        <div class="fila entre"><h3>✨ Recetas nuevas con IA</h3><span class="insignia aviso">Sin activar</span></div>
        <p class="sutil">Cuando tengas una API key de Anthropic, podrás pedir recetas nuevas ("algo con salmón para cenar")
        y la app les pondrá precio con Mercadona. Cuesta unos céntimos por receta.</p>
        <button class="btn peq" data-accion="ir" data-vista="ajustes">Añadir API key</button>
      </div>`;
  }
  return `
    <div class="tarjeta pila">
      <h3>✨ Receta nueva con IA</h3>
      <div class="fila">
        <select id="ia-tipo" aria-label="Tipo de receta" style="max-width:150px">
          <option value="principal">Comida/cena</option><option value="desayuno">Desayuno</option><option value="snack">Snack</option>
        </select>
        <input id="ia-peticion" type="text" placeholder="Ej.: algo con salmón y arroz" aria-label="Qué te apetece">
      </div>
      <div class="fila"><button class="btn primario" data-accion="generar-ia" id="btn-ia">Generar</button><span id="ia-estado" class="sutil peq"></span></div>
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
      ${r.ia ? '<span class="insignia aviso">Generada con IA</span>' : ''}
    </div>
    <div class="cifras" style="margin-bottom:12px">
      <div class="cifra"><b>${a.prot} g</b><span>proteína</span></div>
      <div class="cifra"><b>${a.kcal}</b><span>kcal · ${a.hc} g HC · ${a.grasa} g grasa</span></div>
      <div class="cifra"><b>${euros(a.coste)}</b><span>por ración</span></div>
    </div>
    <h3>Ingredientes (1 ración)</h3>
    <ul class="items">${filas}</ul>
    <p class="sutil peq">El coste es la parte proporcional de cada producto. Puedes cambiar el producto de Mercadona de cada ingrediente; se aplica a todas las recetas.</p>
    <h3>Preparación</h3>
    <ol class="pasos">${r.pasos.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
    <p class="sutil peq">Valores nutricionales orientativos.</p>
    ${pendiente ? `<div class="fila"><button class="btn primario" data-accion="guardar-ia">Guardar en mis recetas</button><button class="btn" data-cerrar>Descartar</button></div>` : ''}
    ${r.ia && !pendiente ? `<button class="btn-texto" data-accion="borrar-ia" data-id="${esc(r.id)}">Eliminar esta receta</button>` : ''}`;
}

// ----- Compra -----

function vistaCompra() {
  if (!estado.plan) {
    return `<div class="tarjeta vacio"><div class="grande">🛒</div><h2>Aún no hay lista</h2>
      <p class="sutil">La lista se crea sola a partir de tu plan semanal.</p>
      <button class="btn primario" data-accion="ir" data-vista="plan">Ir al plan</button></div>`;
  }
  const { items, totalCaja, totalConsumido } = listaCompra(estado.plan, recetasPorId(), ings);
  const compra = items.filter(i => !i.ing.despensa);
  const despensa = items.filter(i => i.ing.despensa);
  const grupos = {};
  for (const it of compra) (grupos[it.producto?.cat || 'Otros'] ||= []).push(it);
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
      <p class="sutil peq">Para cada ingrediente elijo el envase que menos cuesta para la cantidad que necesitas.
      La diferencia entre "en caja" y "lo que te comes" es lo que te sobra para la semana siguiente.</p>
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
  const { items, totalCaja } = listaCompra(estado.plan, recetasPorId(), ings);
  const lineas = items.filter(i => !i.ing.despensa && !estado.comprados[i.id]).map(i =>
    `- ${i.envases ? `${i.envases} × ` : ''}${i.producto?.nombre || i.ing.nombre} (${euros(i.costeCaja)})`);
  return `🛒 Lista de la compra (Mercadona)\n${lineas.join('\n')}\nTotal aprox.: ${euros(totalCaja)}`;
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
  return `
    <div class="tarjeta pila">
      <h3>Tu objetivo</h3>
      <div class="fila">
        <div class="crece"><label for="peso">Peso (kg)</label><input id="peso" type="number" min="30" max="250" step="0.5" value="${a.peso}" data-accion="ajuste" data-campo="peso"></div>
        <div class="crece"><label for="gkg">Proteína (g por kg)</label><input id="gkg" type="number" min="0.8" max="3" step="0.1" value="${a.gkg}" data-accion="ajuste" data-campo="gkg"></div>
      </div>
      <p class="sutil peq">Objetivo: <b>${objetivoProt()} g de proteína al día</b>. Entre 1,6 y 2 g/kg es lo habitual si entrenas.
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
    <div class="tarjeta pila">
      <h3>Recetas con IA</h3>
      <p class="sutil peq">Pega aquí tu API key de Anthropic (se crea en console.anthropic.com). Se guarda <b>solo en este navegador</b>,
      nunca se sube al repositorio. Cada receta cuesta unos céntimos.</p>
      <div class="fila">
        <input id="api-key" type="password" placeholder="sk-ant-…" value="${esc(a.apiKey)}" autocomplete="off" aria-label="API key de Anthropic">
        <button class="btn primario" data-accion="guardar-key">Guardar</button>
      </div>
      ${a.apiKey ? '<button class="btn-texto" data-accion="borrar-key">Borrar API key</button>' : ''}
    </div>
    <div class="tarjeta pila">
      <h3>Datos</h3>
      <p class="sutil peq">${datos.productos.length.toLocaleString('es-ES')} productos de Mercadona (almacén ${esc(datos.almacen)}),
      actualizados ${fechaDatos()}. Se descargan solos cada día desde la tienda online; los precios pueden variar un poco en tienda.</p>
      <button class="btn-texto" data-accion="reiniciar" style="color:var(--rojo)">Borrar todos mis datos de esta app</button>
    </div>`;
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
    semilla: Math.floor(Math.random() * 1e9),
  });
  estado.comprados = {};
  guardar();
  render();
}

async function generarConIA() {
  const boton = $('#btn-ia');
  const info = $('#ia-estado');
  boton.disabled = true;
  info.innerHTML = '<span class="cargando"></span> Pensando la receta…';
  try {
    const { generarReceta } = await import('./ia.js');
    const tipo = $('#ia-tipo').value;
    const objetivo = tipo === 'principal' ? Math.round(objetivoProt() * 0.3) : Math.round(objetivoProt() * 0.18);
    recetaPendiente = await generarReceta({
      apiKey: estado.ajustes.apiKey, peticion: $('#ia-peticion').value.trim(), tipo, ings, objetivoProt: objetivo,
    });
    info.textContent = '';
    mostrarDialogo(detalleReceta(recetaPendiente, { pendiente: true }));
  } catch (e) {
    console.error(e);
    info.textContent = e.message || 'No se pudo generar la receta.';
  } finally {
    boton.disabled = false;
  }
}

document.addEventListener('click', async e => {
  if (e.target.closest('[data-cerrar]')) { cerrarDialogo(); return; }
  const nav = e.target.closest('.pestanas button');
  if (nav) { vista = nav.dataset.vista; render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-accion]');
  if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const accion = el.dataset.accion;

  if (accion === 'generar-plan') generarNuevoPlan();
  else if (accion === 'vaciar-plan') {
    if (confirm('¿Vaciar el plan de la semana?')) { estado.plan = null; estado.comprados = {}; guardar(); render(); }
  } else if (accion === 'ir') { vista = el.dataset.vista; render(); window.scrollTo(0, 0); }
  else if (accion === 'ver-receta') {
    const r = recetasPorId()[el.dataset.id];
    if (r) mostrarDialogo(detalleReceta(r));
  } else if (accion === 'filtro-recetas') { filtroRecetas = el.dataset.filtro; render(); }
  else if (accion === 'sub-precios') { subPrecios = el.dataset.sub; render(); }
  else if (accion === 'copiar-lista') {
    try { await navigator.clipboard.writeText(textoLista()); el.textContent = '✓ Copiada'; }
    catch { prompt('Copia la lista:', textoLista()); }
  } else if (accion === 'desmarcar') { estado.comprados = {}; guardar(); render(); }
  else if (accion === 'generar-ia') generarConIA();
  else if (accion === 'guardar-ia' && recetaPendiente) {
    estado.recetasIA.push(recetaPendiente);
    recetaPendiente = null;
    guardar(); cerrarDialogo(); filtroRecetas = 'ia'; render();
  } else if (accion === 'borrar-ia') {
    if (confirm('¿Eliminar esta receta?')) {
      estado.recetasIA = estado.recetasIA.filter(r => r.id !== el.dataset.id);
      guardar(); cerrarDialogo(); render();
    }
  } else if (accion === 'guardar-key') {
    estado.ajustes.apiKey = $('#api-key').value.trim();
    guardar(); render();
  } else if (accion === 'borrar-key') { estado.ajustes.apiKey = ''; guardar(); render(); }
  else if (accion === 'reiniciar') {
    if (confirm('Se borrarán tu plan, ajustes, recetas IA y API key de este navegador. ¿Seguro?')) {
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
    const v = Number(el.value);
    if (!Number.isFinite(v) || v <= 0) return;
    estado.ajustes[el.dataset.campo] = v;
    guardar(); render();
  } else if (accion === 'activa') {
    const set = new Set(estado.ajustes.activas);
    if (el.checked) set.add(el.dataset.comida); else set.delete(el.dataset.comida);
    estado.ajustes.activas = COMIDAS.map(c => c.id).filter(id => set.has(id));
    guardar();
  } else if (accion === 'buscar-producto') pintarResultados();
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
    $('#estado-datos').textContent = `Precios de Mercadona · ${fechaDatos()}`;
    render();
  } catch (e) {
    console.error(e);
    $('#estado-datos').textContent = 'No se han podido cargar los datos';
    $('#vista').innerHTML = `<div class="tarjeta aviso-caja">No se han podido cargar los precios (${esc(e.message)}).
      Si estás abriendo el archivo directamente, usa un servidor local: <code>python3 -m http.server</code>.</div>`;
  }
}

iniciar();
