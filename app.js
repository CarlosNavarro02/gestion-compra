const CLAVE = 'gestion-compra:productos';

let productos = cargar();
let filtro = 'todos';

const form = document.getElementById('form-producto');
const lista = document.getElementById('lista');
const resumen = document.getElementById('resumen');

function cargar() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE)) || [];
  } catch {
    return [];
  }
}

function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(productos));
  } catch {
    /* almacenamiento no disponible */
  }
}

function render() {
  lista.innerHTML = '';

  const visibles = productos.filter(p =>
    filtro === 'todos' ||
    (filtro === 'pendientes' && !p.comprado) ||
    (filtro === 'comprados' && p.comprado)
  );

  const porCategoria = {};
  for (const p of visibles) {
    (porCategoria[p.categoria] ||= []).push(p);
  }

  for (const [categoria, items] of Object.entries(porCategoria)) {
    const titulo = document.createElement('li');
    titulo.className = 'categoria-titulo';
    titulo.style.cssText = 'background:none;border:none;padding:0';
    titulo.textContent = categoria;
    lista.appendChild(titulo);

    for (const p of items) {
      const li = document.createElement('li');
      if (p.comprado) li.classList.add('comprado');

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = p.comprado;
      check.addEventListener('change', () => {
        p.comprado = check.checked;
        guardar();
        render();
      });

      const info = document.createElement('div');
      info.className = 'info';
      const nombre = document.createElement('div');
      nombre.className = 'nombre';
      nombre.textContent = `${p.nombre}${p.cantidad > 1 ? ` × ${p.cantidad}` : ''}`;
      info.appendChild(nombre);

      const borrar = document.createElement('button');
      borrar.className = 'borrar';
      borrar.title = 'Eliminar';
      borrar.textContent = '✕';
      borrar.addEventListener('click', () => {
        productos = productos.filter(x => x.id !== p.id);
        guardar();
        render();
      });

      li.append(check, info, borrar);
      lista.appendChild(li);
    }
  }

  const pendientes = productos.filter(p => !p.comprado).length;
  resumen.textContent = `${pendientes} pendiente(s) de ${productos.length}`;
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const nombre = document.getElementById('nombre').value.trim();
  if (!nombre) return;

  productos.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    nombre,
    cantidad: Math.max(1, parseInt(document.getElementById('cantidad').value, 10) || 1),
    categoria: document.getElementById('categoria').value,
    comprado: false,
  });
  guardar();
  form.reset();
  document.getElementById('nombre').focus();
  render();
});

document.querySelectorAll('.filtros button').forEach(btn => {
  btn.addEventListener('click', () => {
    filtro = btn.dataset.filtro;
    document.querySelectorAll('.filtros button').forEach(b => b.classList.toggle('activo', b === btn));
    render();
  });
});

document.getElementById('limpiar').addEventListener('click', () => {
  productos = productos.filter(p => !p.comprado);
  guardar();
  render();
});

render();
