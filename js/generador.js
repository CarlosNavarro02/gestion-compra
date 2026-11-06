// Generador de recetas sin IA y sin coste: combina una proteína, una base y verduras
// según un método de cocina, ajusta las cantidades al objetivo de proteína y prioriza
// los ingredientes con más proteína por euro en Mercadona.

const CORTO = {
  pollo_pechuga: 'pollo', pollo_contramuslo: 'contramuslos de pollo', pavo_filetes: 'pavo', lomo_cerdo: 'lomo de cerdo',
  salmon: 'salmón', merluza: 'merluza', gambas: 'gambas', tofu: 'tofu', pollo_picado: 'carne picada de pollo',
  atun_natural: 'atún', huevo: 'huevo', patata: 'patata', arroz: 'arroz', quinoa: 'quinoa', pasta: 'pasta',
  tortilla_integral: 'tortillas integrales', calabacin: 'calabacín', pimiento: 'pimiento', brocoli: 'brócoli',
  champinon: 'champiñones', zanahoria: 'zanahoria', judia_verde: 'judías verdes', salteado_verduras: 'verduras salteadas',
  espinacas: 'espinacas', tomate: 'tomate', lechuga: 'lechuga', edamame: 'edamame', aguacate: 'aguacate',
  garbanzo_cocido: 'garbanzos', lenteja_cocida: 'lentejas', alubia_cocida: 'alubias blancas',
  queso_batido: 'queso batido', yogur_griego_light: 'yogur griego', avena: 'avena', platano: 'plátano',
  frutos_rojos: 'frutos rojos', manzana: 'manzana', cacahuete: 'cacahuete', crema_cacahuete: 'crema de cacahuete',
  pavo_lonchas: 'pavo', hummus: 'hummus', claras: 'claras', pan_integral: 'pan integral',
};
const corto = id => CORTO[id] || id;
const mayus = s => s.charAt(0).toUpperCase() + s.slice(1);
const unir = l => (l.length > 1 ? `${l.slice(0, -1).join(', ')} y ${l.at(-1)}` : l[0] || '');

// Tiempos y forma de cocinar cada proteína
const COCCION = {
  airfryer: {
    pollo_pechuga: 'Corta el pollo en dados, especíalo y añádelo a la cesta: 12-14 minutos a 190 °C.',
    pollo_contramuslo: 'Adoba los contramuslos y ponlos en la cesta: 18-20 minutos a 190 °C, dándoles la vuelta a mitad.',
    lomo_cerdo: 'Corta el lomo en filetes o dados, especíalo y añádelo: 12 minutos a 190 °C.',
    salmon: 'Añade el salmón con sal y limón: 10-12 minutos a 180 °C (si va congelado, 4 minutos más).',
    merluza: 'Pon la merluza con ajo, perejil y unas gotas de aceite: 10-12 minutos a 180 °C.',
    tofu: 'Escurre el tofu, córtalo en dados y hazlo 15 minutos a 200 °C, agitando dos veces, hasta que esté crujiente.',
  },
  sarten: {
    pollo_pechuga: 'Saltea el pollo en tiras a fuego fuerte 6-8 minutos, hasta que esté dorado.',
    pavo_filetes: 'Haz el pavo en tiras a la plancha, 4-5 minutos a fuego fuerte.',
    lomo_cerdo: 'Saltea el lomo en tiras 5-6 minutos a fuego fuerte.',
    gambas: 'Saltea las gambas con ajo 2-3 minutos, hasta que cambien de color.',
    tofu: 'Dora el tofu en dados 8 minutos, moviéndolo para que se haga por todos los lados.',
    pollo_picado: 'Dora la carne picada 6-8 minutos, deshaciéndola con la cuchara.',
  },
};

const BASES = {
  airfryer: ['patata', 'arroz', 'quinoa'],
  sarten: ['arroz', 'quinoa', 'pasta', 'tortilla_integral'],
  frio: ['arroz', 'quinoa', 'pasta', 'garbanzo_cocido'],
};
const BASE_CANT = { patata: 200, arroz: 70, quinoa: 70, pasta: 80, tortilla_integral: 80, garbanzo_cocido: 150 };
const VERDURAS = {
  airfryer: ['calabacin', 'pimiento', 'brocoli', 'champinon', 'zanahoria', 'judia_verde'],
  sarten: ['salteado_verduras', 'brocoli', 'pimiento', 'champinon', 'espinacas', 'judia_verde', 'calabacin'],
  guiso: ['espinacas', 'pimiento', 'zanahoria', 'calabacin', 'judia_verde'],
  frio: ['tomate', 'pimiento', 'lechuga', 'zanahoria', 'edamame', 'aguacate'],
};
const VERDURA_CANT = { lechuga: 40, aguacate: 50, edamame: 80, zanahoria: 60, pimiento: 80 };
const PROTEINAS = {
  airfryer: Object.keys(COCCION.airfryer),
  sarten: Object.keys(COCCION.sarten),
  guiso: ['garbanzo_cocido', 'lenteja_cocida', 'alubia_cocida'],
  frio: ['atun_natural', 'huevo', 'gambas'],
};

export const METODOS = [
  ['', 'Cualquiera'], ['airfryer', 'Airfryer'], ['sarten', 'Sartén / salteado'], ['guiso', 'Guiso de legumbre'], ['frio', 'Bol frío / ensalada'],
];

/** Proteínas que se pueden elegir para un tipo y método (para el selector). */
export function proteinasDisponibles(tipo, metodo, ings) {
  let ids;
  if (tipo === 'principal') {
    ids = metodo ? PROTEINAS[metodo] : [...new Set(Object.values(PROTEINAS).flat())];
  } else {
    ids = ['queso_batido', 'yogur_griego_light', 'huevo', 'claras', 'pavo_lonchas', 'atun_natural', 'hummus'];
  }
  return ids.filter(id => ings[id]?.elegido).map(id => ({ id, nombre: mayus(corto(id)) }));
}

function aleatorio(semilla) {
  let s = semilla >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

const disponible = (ings, id) => !!ings[id]?.elegido;
const protPorEuro = (ing) => {
  const gramos = ing.u === 'ud' ? (ing.g_ud || 1) : 1;
  return (ing.n[1] * gramos / 100) / Math.max(ing.elegido.pu, 0.0001);
};

/** Elige al azar entre las opciones, dando más peso a las primeras (más baratas). */
function elegir(lista, rnd) {
  if (!lista.length) return null;
  const top = lista.slice(0, Math.min(3, lista.length));
  return top[Math.floor(rnd() * top.length)];
}
function variasAlAzar(lista, n, rnd) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
const proteinaDe = (ings, id, cant) => {
  const ing = ings[id];
  const g = ing.u === 'ud' ? cant * (ing.g_ud || 0) : cant;
  return (ing.n[1] * g) / 100;
};
const redondear = (g, paso = 10) => Math.round(g / paso) * paso;

/** Cantidad de proteína principal para llegar al objetivo, teniendo en cuenta lo que ya aportan el resto. */
function cantidadProteina(ings, id, objetivo, resto) {
  const ing = ings[id];
  const falta = Math.max(objetivo - resto, 12);
  if (ing.u === 'ud') {
    const porUd = (ing.n[1] * (ing.g_ud || 55)) / 100;
    return Math.min(4, Math.max(2, Math.round(falta / porUd)));
  }
  return Math.min(250, Math.max(100, redondear(falta / (ing.n[1] / 100))));
}

/**
 * Crea una receta nueva.
 * @param {object} o
 * @param {'principal'|'desayuno'|'snack'} o.tipo
 * @param {string} [o.metodo]   airfryer | sarten | guiso | frio (solo principal; vacío = cualquiera)
 * @param {string} [o.proteina] id de ingrediente, o vacío para la más barata
 * @param {object} o.ings       ingredientes preparados (con producto y precio)
 * @param {number} o.objetivo   proteína objetivo de la ración (g)
 * @param {number} [o.semilla]
 */
export function crearReceta({ tipo, metodo = '', proteina = '', ings, objetivo, semilla = Date.now() }) {
  const rnd = aleatorio(semilla);
  const receta = tipo === 'principal'
    ? crearPrincipal({ metodo, proteina, ings, objetivo, rnd })
    : crearDesayunoSnack({ tipo, proteina, ings, objetivo, rnd });
  if (!receta) return null;
  receta.id = `propia-${Date.now().toString(36)}${Math.floor(rnd() * 1000)}`;
  receta.propia = true;
  receta.ingredientes = receta.ingredientes.filter(it => ings[it.id]);
  return receta;
}

function crearPrincipal({ metodo, proteina, ings, objetivo, rnd }) {
  // Método: si se ha elegido proteína, uno que la admita
  let metodos = metodo ? [metodo] : ['airfryer', 'sarten', 'guiso', 'frio'];
  if (proteina) metodos = metodos.filter(m => PROTEINAS[m].includes(proteina));
  if (!metodos.length) return null;
  const m = metodos[Math.floor(rnd() * metodos.length)];

  const ordenar = ids => ids.filter(id => disponible(ings, id)).sort((a, b) => protPorEuro(ings[b]) - protPorEuro(ings[a]));
  const p = proteina && disponible(ings, proteina) ? proteina : elegir(ordenar(PROTEINAS[m]), rnd);
  if (!p) return null;

  if (m === 'guiso') return guiso({ p, ings, objetivo, rnd });

  const bases = BASES[m].filter(id => disponible(ings, id) && id !== p);
  const base = bases[Math.floor(rnd() * bases.length)];
  const verduras = variasAlAzar(VERDURAS[m].filter(id => disponible(ings, id)), m === 'frio' ? 3 : 2, rnd);

  const ingredientes = [];
  if (base) ingredientes.push({ id: base, cant: BASE_CANT[base] });
  for (const v of verduras) ingredientes.push({ id: v, cant: VERDURA_CANT[v] || (m === 'frio' ? 100 : 150) });
  const resto = ingredientes.reduce((s, it) => s + proteinaDe(ings, it.id, it.cant), 0);
  ingredientes.unshift({ id: p, cant: cantidadProteina(ings, p, objetivo, resto) });
  if (m === 'sarten' && rnd() < 0.5 && disponible(ings, 'soja')) ingredientes.push({ id: 'soja', cant: 15 });
  ingredientes.push({ id: 'aceite', cant: m === 'airfryer' ? 8 : 10 }, { id: 'especias', cant: 1 });

  const vTxt = verduras.map(corto);
  const listaV = unir(vTxt) || 'verduras';
  const conBase = unir([...(base ? [corto(base)] : []), ...vTxt]) || 'verduras';
  const pasos = [];
  let nombre, tiempo, airfryer = false;

  if (m === 'airfryer') {
    airfryer = true;
    nombre = `${mayus(corto(p))} a la airfryer con ${conBase}`;
    if (base === 'patata') pasos.push('Corta la patata en dados o gajos, alíñala con la mitad del aceite, sal y pimentón: airfryer a 190 °C 10 minutos.');
    else if (base) pasos.push(base === 'arroz' ? 'Cuece el arroz 15-18 minutos y escúrrelo.' : 'Cuece la quinoa 12-15 minutos y escúrrela.');
    pasos.push(`Trocea ${listaV} y mézclalo con el aceite y sal. Añádelo a la cesta${base === 'patata' ? ' con la patata' : ''}.`);
    pasos.push(COCCION.airfryer[p]);
    pasos.push('Agita la cesta a mitad de tiempo y comprueba que todo está dorado antes de servir.');
    tiempo = p === 'pollo_contramuslo' ? 30 : 25;
  } else if (m === 'sarten') {
    if (base === 'tortilla_integral') nombre = `Wraps de ${corto(p)} con ${listaV}`;
    else if (base === 'pasta') nombre = `Pasta con ${corto(p)} y ${listaV}`;
    else nombre = `Salteado de ${corto(p)} con ${conBase}`;
    if (base === 'arroz') pasos.push('Cuece el arroz 15-18 minutos y escúrrelo.');
    if (base === 'quinoa') pasos.push('Lava la quinoa y cuécela 12-15 minutos en el doble de agua.');
    if (base === 'pasta') pasos.push('Cuece la pasta el tiempo que indique el paquete.');
    pasos.push(COCCION.sarten[p] + ' Resérvalo.');
    pasos.push(`En la misma sartén, saltea ${listaV} con el resto del aceite 5-7 minutos (si son congeladas, sin descongelar).`);
    if (base === 'tortilla_integral') pasos.push('Calienta las tortillas y rellénalas con el salteado. Puedes añadir un poco de queso batido con limón como salsa.');
    else pasos.push(`Junta todo${ingredientes.some(i => i.id === 'soja') ? ', añade la salsa de soja' : ''} y ajusta de sal.`);
    tiempo = 20;
  } else { // frío
    nombre = `Bol frío de ${corto(p)} con ${conBase}`;
    if (base === 'arroz') pasos.push('Cuece el arroz 15-18 minutos, escúrrelo y déjalo enfriar.');
    if (base === 'quinoa') pasos.push('Cuece la quinoa 12-15 minutos, escúrrela y déjala enfriar.');
    if (base === 'pasta') pasos.push('Cuece la pasta, escúrrela y pásala por agua fría.');
    if (base === 'garbanzo_cocido') pasos.push('Escurre y lava los garbanzos.');
    if (p === 'huevo') pasos.push('Cuece los huevos 10 minutos, enfríalos y pártelos en cuartos.');
    if (p === 'gambas') pasos.push('Saltea las gambas 2-3 minutos con ajo y deja que se enfríen.');
    if (p === 'atun_natural') pasos.push('Escurre el atún.');
    pasos.push(`Trocea ${listaV}${verduras.includes('edamame') ? ' (el edamame, cocido 4 minutos)' : ''}.`);
    pasos.push('Monta el bol con todo y aliña con el aceite, vinagre o limón y sal. Aguanta bien en tupper; si lleva aguacate, añádelo al servir.');
    tiempo = 20;
  }
  return { nombre, tipo: ['principal'], tiempo, airfryer, tupper: true, ingredientes, pasos };
}

function guiso({ p, ings, objetivo, rnd }) {
  const verduras = variasAlAzar(VERDURAS.guiso.filter(id => disponible(ings, id)), 2, rnd);
  const ingredientes = [{ id: p, cant: 220 }];
  for (const v of verduras) ingredientes.push({ id: v, cant: VERDURA_CANT[v] || 120 });
  if (disponible(ings, 'cebolla')) ingredientes.push({ id: 'cebolla', cant: 50 });
  if (disponible(ings, 'tomate_triturado')) ingredientes.push({ id: 'tomate_triturado', cant: 100 });
  let resto = ingredientes.reduce((s, it) => s + proteinaDe(ings, it.id, it.cant), 0);
  // Complemento proteico si la legumbre sola no llega
  let extra = null;
  if (resto < objetivo - 5) {
    const opciones = ['huevo', 'pollo_pechuga'].filter(id => disponible(ings, id));
    extra = opciones[Math.floor(rnd() * opciones.length)] || null;
    if (extra) ingredientes.push({ id: extra, cant: cantidadProteina(ings, extra, objetivo, resto) });
  }
  ingredientes.push({ id: 'aceite', cant: 8 }, { id: 'especias', cant: 1 });

  const vTxt = unir(verduras.map(corto));
  const nombre = `${mayus(corto(p))} guisad${p === 'garbanzo_cocido' ? 'os' : 'as'} con ${unir([...verduras.map(corto), ...(extra ? [corto(extra)] : [])])}`;
  const pasos = [];
  if (extra === 'huevo') pasos.push('Cuece los huevos 10 minutos.');
  pasos.push('Sofríe la cebolla picada en el aceite 5 minutos.');
  if (extra === 'pollo_pechuga') pasos.push('Añade el pollo en dados y dóralo.');
  pasos.push(`Incorpora ${vTxt} troceados, el tomate triturado, una cucharadita de pimentón y otra de comino.`);
  pasos.push(`Añade ${corto(p)} lavad${p === 'garbanzo_cocido' ? 'os' : 'as'} con un vaso pequeño de agua y deja 10-12 minutos a fuego suave.`);
  if (extra === 'huevo') pasos.push('Sirve con los huevos cocidos en cuartos.');
  pasos.push('Aguanta 3-4 días en la nevera y se puede congelar.');
  return { nombre, tipo: ['principal'], tiempo: 25, airfryer: false, tupper: true, ingredientes, pasos };
}

function crearDesayunoSnack({ tipo, proteina, ings, objetivo, rnd }) {
  const escala = tipo === 'snack' ? 0.6 : 1;
  const c = g => redondear(g * escala, 5);
  const plantillas = ['bol', 'tostada', 'revuelto'];
  let plantilla = plantillas[Math.floor(rnd() * plantillas.length)];
  if (['queso_batido', 'yogur_griego_light'].includes(proteina)) plantilla = 'bol';
  if (['pavo_lonchas', 'atun_natural', 'hummus'].includes(proteina)) plantilla = 'tostada';
  if (proteina === 'claras') plantilla = 'revuelto';
  if (proteina === 'huevo') plantilla = rnd() < 0.5 ? 'tostada' : 'revuelto';

  const ingredientes = [];
  const pasos = [];
  let nombre;

  if (plantilla === 'bol') {
    const lacteo = proteina || (rnd() < 0.7 ? 'queso_batido' : 'yogur_griego_light');
    const fruta = variasAlAzar(['platano', 'frutos_rojos', 'manzana'].filter(id => disponible(ings, id)), 1, rnd)[0];
    const extra = variasAlAzar(['cacahuete', 'crema_cacahuete'].filter(id => disponible(ings, id)), 1, rnd)[0];
    ingredientes.push({ id: lacteo, cant: 0 });
    if (disponible(ings, 'avena')) ingredientes.push({ id: 'avena', cant: c(40) });
    if (fruta) ingredientes.push({ id: fruta, cant: c(110) });
    if (extra) ingredientes.push({ id: extra, cant: c(12) });
    const resto = ingredientes.reduce((s, it) => s + proteinaDe(ings, it.id, it.cant), 0);
    ingredientes[0].cant = Math.min(350, Math.max(c(150), redondear((objetivo - resto) / (ings[lacteo].n[1] / 100), 25)));
    nombre = `Bol de ${corto(lacteo)} con avena${fruta ? `, ${corto(fruta)}` : ''}${extra ? ` y ${corto(extra)}` : ''}`;
    if (fruta === 'frutos_rojos') pasos.push('Descongela los frutos rojos la noche anterior en la nevera (o 1 minuto en el microondas).');
    pasos.push(`Pon el ${corto(lacteo)} en un bol y mézclalo con la avena.`);
    pasos.push(`Añade${fruta ? ` ${fruta === 'frutos_rojos' ? 'los frutos rojos' : `el ${corto(fruta)} troceado`}` : ''}${extra ? ` y el ${corto(extra)} por encima` : ''}. Un poco de canela le va muy bien.`);
  } else if (plantilla === 'tostada') {
    const prot = proteina || variasAlAzar(['huevo', 'pavo_lonchas', 'atun_natural'].filter(id => disponible(ings, id)), 1, rnd)[0];
    const acomp = variasAlAzar(['tomate', 'aguacate'].filter(id => disponible(ings, id)), 1, rnd)[0];
    ingredientes.push({ id: 'pan_integral', cant: c(60) });
    if (acomp) ingredientes.push({ id: acomp, cant: acomp === 'aguacate' ? c(40) : c(80) });
    const resto = ingredientes.reduce((s, it) => s + proteinaDe(ings, it.id, it.cant), 0);
    const cant = prot === 'huevo' ? Math.max(tipo === 'snack' ? 1 : 2, Math.min(3, Math.round((objetivo - resto) / 7)))
      : prot === 'hummus' ? c(40)
        : Math.min(120, Math.max(c(50), redondear((objetivo - resto) / (ings[prot].n[1] / 100))));
    ingredientes.unshift({ id: prot, cant });
    if (prot === 'huevo') ingredientes.push({ id: 'aceite', cant: 3 });
    const como = { huevo: 'huevos revueltos', pavo_lonchas: 'pavo', atun_natural: 'atún', hummus: 'hummus' }[prot];
    nombre = `Tostadas integrales con ${como}${acomp ? ` y ${corto(acomp)}` : ''}`;
    pasos.push('Tuesta el pan.');
    if (acomp === 'tomate') pasos.push('Ralla o corta el tomate en rodajas y ponlo sobre el pan con una pizca de sal.');
    if (acomp === 'aguacate') pasos.push('Machaca el aguacate con sal y limón y úntalo en el pan.');
    if (prot === 'huevo') pasos.push('Bate los huevos con sal y cuájalos en la sartén con unas gotas de aceite, removiendo. Ponlos encima.');
    else pasos.push(`Añade el ${como} por encima.`);
  } else { // revuelto
    const verdura = variasAlAzar(['espinacas', 'champinon', 'pimiento'].filter(id => disponible(ings, id)), 1, rnd)[0];
    ingredientes.push({ id: 'claras', cant: 0 }, { id: 'huevo', cant: 1 });
    if (verdura) ingredientes.push({ id: verdura, cant: c(90) });
    if (disponible(ings, 'pan_integral')) ingredientes.push({ id: 'pan_integral', cant: c(40) });
    ingredientes.push({ id: 'aceite', cant: 3 }, { id: 'especias', cant: 1 });
    const resto = ingredientes.reduce((s, it) => s + proteinaDe(ings, it.id, it.cant), 0);
    ingredientes[0].cant = Math.min(300, Math.max(c(100), redondear((objetivo - resto) / (ings.claras.n[1] / 100), 25)));
    nombre = `Revuelto de claras${verdura ? ` con ${corto(verdura)}` : ''} y tostada`;
    if (verdura) pasos.push(`Saltea ${verdura === 'espinacas' ? 'las espinacas' : `el ${corto(verdura)} troceado`} 2-3 minutos con unas gotas de aceite.`);
    pasos.push('Bate las claras con el huevo, sal y pimienta, y échalo a la sartén.');
    pasos.push('Remueve a fuego medio hasta que cuaje y sirve con el pan tostado.');
  }
  return { nombre, tipo: [tipo], tiempo: plantilla === 'bol' ? 5 : 10, airfryer: false, tupper: false, ingredientes, pasos };
}
