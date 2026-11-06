// Generación de recetas con Claude (API de Anthropic) directamente desde el navegador.
// La API key la pone el usuario en Ajustes y solo se guarda en su navegador (localStorage).
// El SDK se carga bajo demanda, solo cuando se pulsa "Generar".

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.0.0/+esm';
const MODELO = 'claude-opus-5-5';

let sdk = null;
async function cargarSdk() {
  if (!sdk) sdk = await import(SDK_URL);
  return sdk;
}

function esquema(idsIngredientes) {
  return {
    type: 'object',
    properties: {
      nombre: { type: 'string' },
      tipo: { type: 'array', items: { type: 'string', enum: ['desayuno', 'principal', 'snack'] } },
      tiempo: { type: 'integer', description: 'Minutos de preparación' },
      airfryer: { type: 'boolean' },
      tupper: { type: 'boolean', description: 'Si aguanta bien en tupper 2-3 días' },
      ingredientes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', enum: idsIngredientes },
            cant: { type: 'number', description: 'Gramos (o unidades si el ingrediente se mide en ud) para UNA ración' },
          },
          required: ['id', 'cant'],
          additionalProperties: false,
        },
      },
      pasos: { type: 'array', items: { type: 'string' } },
    },
    required: ['nombre', 'tipo', 'tiempo', 'airfryer', 'tupper', 'ingredientes', 'pasos'],
    additionalProperties: false,
  };
}

/**
 * Pide a Claude una receta alta en proteína usando solo ingredientes del catálogo
 * (así se le puede poner precio con Mercadona).
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.peticion  Lo que pide el usuario ("algo con pollo para cenar", ...)
 * @param {string} opts.tipo      desayuno | principal | snack
 * @param {object} opts.ings      Ingredientes preparados (con producto elegido y precio)
 * @param {number} opts.objetivoProt  Proteína objetivo por ración (g)
 */
export async function generarReceta({ apiKey, peticion, tipo, ings, objetivoProt }) {
  const { default: Anthropic } = await cargarSdk();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const disponibles = Object.values(ings).filter(i => i.elegido || i.sin_precio);
  const catalogo = disponibles.map(i => {
    const precio = i.elegido ? `${(i.elegido.pu * (i.u === 'g' ? 1000 : 1)).toFixed(2)} €/${i.u === 'g' ? 'kg' : 'ud'}` : 'sin precio';
    return `- ${i.id}: ${i.nombre} (se mide en ${i.u === 'g' ? 'gramos' : 'unidades'}; ${i.n[1]} g proteína/100 g; ${precio})`;
  }).join('\n');

  const system = `Eres un cocinero y nutricionista que crea recetas caseras, sanas y baratas para una persona.
Prioridades: mucha proteína, ingredientes baratos de Mercadona, poca complicación. La persona tiene airfryer y le parece bien usar congelados.
Usa SOLO ingredientes de esta lista (por su id); las cantidades son para UNA ración:
${catalogo}
Escribe en español de España, con pasos cortos y concretos.`;

  const tipoTexto = { desayuno: 'un desayuno', principal: 'una comida o cena', snack: 'un snack' }[tipo] || 'una comida';
  const usuario = `Crea ${tipoTexto} con unos ${objetivoProt} g de proteína por ración.${peticion ? ` Petición: ${peticion}` : ''}`;

  let respuesta;
  try {
    respuesta = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: esquema(disponibles.map(i => i.id)) },
      },
      system,
      messages: [{ role: 'user', content: usuario }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('La API key no es válida. Revísala en Ajustes.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error('Tu API key no tiene permiso para usar este modelo.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Demasiadas peticiones seguidas. Espera un momento y vuelve a probar.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('No se pudo conectar con la API de Anthropic. Revisa tu conexión.');
    if (e instanceof Anthropic.APIError) throw new Error(`Error de la API (${e.status ?? '?'}): ${e.message}`);
    throw e;
  }

  if (respuesta.stop_reason === 'refusal') throw new Error('El modelo no ha podido generar esta receta. Prueba con otra petición.');
  if (respuesta.stop_reason === 'max_tokens') throw new Error('La respuesta se ha cortado. Vuelve a intentarlo.');
  const texto = respuesta.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const receta = JSON.parse(texto);
  receta.id = `ia-${Date.now().toString(36)}`;
  receta.ia = true;
  receta.ingredientes = receta.ingredientes.filter(it => ings[it.id] && it.cant > 0);
  return receta;
}
