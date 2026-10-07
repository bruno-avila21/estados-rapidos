// Pantalla "Plantillas" (pedido 2026-10-07): la galería de TODOS los estilos de imagen en un lugar
// propio, con favoritas, para que no ocupen Ajustes ni el editor. Antes vivía repartida en dos
// galerías dentro del editor de plantilla ("Estilo de las imágenes" + "Presets de diseño rápidos").
// Tocar una tarjeta la deja como estilo general; "Editar" abre el editor de ESE estilo; la estrella
// la marca como favorita (filtro "Favoritas"). Misma tarjeta con miniatura en vivo de siempre
// (`tarjetaEstilo`/`mostrarMiniatura`, ajustes.js).
import * as repo from '../repositorio.js';
import { componerMiniatura, componerSegunEstilo } from '../componer.js';
import { cargarFuentes } from '../fuentes.js';
import { ESTILOS_IMAGEN, ESTILOS_CON_AJUSTES, ETIQUETA_ESTILO, esAjustePersonalizado, resolverDescripcion, resolverSeccionNombre } from '../modelo.js';
import { crearIcono } from '../utils/iconos.js';
import { mostrarToast } from '../utils/toast.js';
import { fotoDeEjemploPorDefecto } from '../utils/foto-ejemplo.js';
import { abrirVisorImagen } from '../utils/visor-imagen.js';
import { tarjetaEstilo, mostrarMiniatura } from './ajustes.js';

// Urls de objeto de las miniaturas: se revocan al volver a entrar, para no perder memoria.
let urlsMiniaturas = [];
// El filtro elegido se recuerda mientras la app esté abierta (ir a editar una y volver no lo pisa).
let filtroRecordado = null;

export async function render(contenedor, { navegar } = {}) {
  contenedor.textContent = '';
  urlsMiniaturas.forEach((u) => URL.revokeObjectURL(u));
  urlsMiniaturas = [];

  const [config, general, productos, secciones] = await Promise.all([
    repo.obtenerPlantillaConfig(),
    repo.obtenerAjustesGenerales(),
    repo.listarProductos(),
    repo.listarSecciones(),
  ]);
  const formatoPrecio = config.formatoPrecio;
  const productoEjemplo = productos[0] || { nombre: 'Producto de ejemplo', precio: 12500, descripcion: '' };
  const fotoBlob = productos[0]?.fotoId ? await repo.obtenerFotoBlob(productos[0].fotoId) : null;
  const fotoEjemplo = fotoBlob ? await createImageBitmap(fotoBlob) : await fotoDeEjemploPorDefecto();
  const plantillaImagen = await createImageBitmap(await repo.obtenerImagenPlantillaBlob());
  const datosDe = (valor) => ({
    estilo: valor,
    plantillaImagen,
    fotoImagen: fotoEjemplo,
    producto: productoEjemplo,
    ajustes: config.ajustesPorEstilo[valor] ?? {},
    formatoPrecio,
    descripcion: resolverDescripcion(productoEjemplo, { ...general, formatoPrecio }),
    encuadreFoto: general.encuadreFoto,
    general,
    seccionNombre: resolverSeccionNombre(productoEjemplo, secciones, general),
    posicion: { n: 1, m: 3 },
  });

  const favoritas = new Set(general.plantillasFavoritas.filter((v) => ESTILOS_IMAGEN.includes(v)));
  let filtro = filtroRecordado ?? (favoritas.size ? 'favoritas' : 'todas');

  const wrap = document.createElement('div');
  wrap.className = 'pila pantalla-plantillas';

  const barra = document.createElement('div');
  barra.className = 'barra-volver barra-volver--plantilla';
  const btnVolver = document.createElement('button');
  btnVolver.type = 'button';
  btnVolver.className = 'enlace-volver';
  btnVolver.setAttribute('data-accion', 'ir-ajustes');
  const etiquetaVolver = document.createElement('span');
  etiquetaVolver.textContent = 'Volver a Ajustes';
  btnVolver.append(crearIcono('volver'), etiquetaVolver);
  btnVolver.addEventListener('click', () => navegar?.('#/ajustes'));
  const titulo = document.createElement('h1');
  titulo.className = 'barra-volver__titulo';
  titulo.textContent = 'Plantillas';
  barra.append(btnVolver, titulo, document.createElement('span'));

  const subtitulo = document.createElement('p');
  subtitulo.className = 'panel__subtitulo';
  subtitulo.textContent =
    'Tocá una para usarla en todos tus estados. Con la estrella la guardás en Favoritas; "Editar" abre el editor de esa plantilla.';

  // --- Filtro Todas / Favoritas ---
  const filtros = document.createElement('div');
  filtros.className = 'pantalla-plantillas__filtros';
  filtros.setAttribute('role', 'group');
  filtros.setAttribute('aria-label', 'Qué plantillas mostrar');
  const botonesFiltro = {};
  for (const [valor, etiqueta, icono] of [
    ['todas', 'Todas', 'grilla'],
    ['favoritas', 'Favoritas', 'estrella'],
  ]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip pantalla-plantillas__filtro';
    btn.setAttribute('data-accion', `filtro-${valor}`);
    const cuenta = document.createElement('span');
    cuenta.className = 'pantalla-plantillas__cuenta';
    btn.append(crearIcono(icono), document.createTextNode(etiqueta), cuenta);
    btn.addEventListener('click', () => {
      filtro = valor;
      filtroRecordado = valor;
      pintar();
    });
    botonesFiltro[valor] = { btn, cuenta };
    filtros.append(btn);
  }

  // --- Grilla ---
  const grilla = document.createElement('div');
  grilla.className = 'grilla-estilos grilla-estilos--general';
  const tarjetas = {};
  for (const valor of ESTILOS_IMAGEN) {
    const editable = ESTILOS_CON_AJUSTES.includes(valor);
    const tarjeta = tarjetaEstilo(valor, general.estiloGeneral === valor, {
      editable,
      mostrarActivoPill: true,
      onSeleccionar: async () => {
        await repo.guardarEstiloGeneral(valor);
        general.estiloGeneral = valor;
        mostrarToast(`Plantilla en uso: ${ETIQUETA_ESTILO[valor]}`);
      },
      onEditar: editable ? () => navegar(`#/plantilla?estilo=${valor}`) : null,
      onVerCompleta: () => abrirVisorImagen({ titulo: ETIQUETA_ESTILO[valor], obtenerBlob: () => componerSegunEstilo(datosDe(valor)) }),
      prefijo: 'estilo-general',
    });
    const btnFavorita = document.createElement('button');
    btnFavorita.type = 'button';
    btnFavorita.className = 'tarjeta-estilo__favorita';
    btnFavorita.setAttribute('data-accion', `favorita-${valor}`);
    btnFavorita.addEventListener('click', async () => {
      if (favoritas.has(valor)) favoritas.delete(valor);
      else favoritas.add(valor);
      pintar();
      await repo.guardarPlantillasFavoritas([...favoritas]);
      mostrarToast(favoritas.has(valor) ? `${ETIQUETA_ESTILO[valor]}: en Favoritas` : `${ETIQUETA_ESTILO[valor]}: fuera de Favoritas`);
    });
    tarjeta.raiz.append(btnFavorita);
    tarjeta.raiz.setAttribute('data-estilo', valor);
    tarjetas[valor] = { ...tarjeta, btnFavorita };
    grilla.append(tarjeta.raiz);
  }

  // --- Estado vacío de "Favoritas" (regla 5: diseñado, con salida) ---
  const vacio = document.createElement('div');
  vacio.className = 'estado-vacio pantalla-plantillas__vacio';
  vacio.setAttribute('data-estado', 'sin-favoritas');
  const iconoVacio = crearIcono('estrella');
  const tituloVacio = document.createElement('p');
  tituloVacio.className = 'estado-vacio__titulo';
  tituloVacio.textContent = 'Todavía no marcaste favoritas';
  const textoVacio = document.createElement('p');
  textoVacio.className = 'texto-tenue';
  textoVacio.textContent = 'Tocá la estrella de una plantilla para tenerla siempre a mano acá.';
  const btnVerTodas = document.createElement('button');
  btnVerTodas.type = 'button';
  btnVerTodas.className = 'boton boton--primario';
  btnVerTodas.setAttribute('data-accion', 'ver-todas-plantillas');
  btnVerTodas.textContent = 'Ver todas las plantillas';
  btnVerTodas.addEventListener('click', () => {
    filtro = 'todas';
    filtroRecordado = 'todas';
    pintar();
  });
  vacio.append(iconoVacio, tituloVacio, textoVacio, btnVerTodas);

  function pintar() {
    for (const [valor, { btn, cuenta }] of Object.entries(botonesFiltro)) {
      const activo = filtro === valor;
      btn.classList.toggle('chip--activo', activo);
      btn.setAttribute('aria-pressed', String(activo));
      cuenta.textContent = String(valor === 'todas' ? ESTILOS_IMAGEN.length : favoritas.size);
    }
    for (const valor of ESTILOS_IMAGEN) {
      const esFavorita = favoritas.has(valor);
      const { raiz, btnFavorita } = tarjetas[valor];
      raiz.hidden = filtro === 'favoritas' && !esFavorita;
      btnFavorita.classList.toggle('tarjeta-estilo__favorita--activa', esFavorita);
      btnFavorita.setAttribute('aria-pressed', String(esFavorita));
      btnFavorita.setAttribute('aria-label', `${esFavorita ? 'Quitar de' : 'Agregar a'} favoritas: ${ETIQUETA_ESTILO[valor]}`);
      btnFavorita.replaceChildren(crearIcono(esFavorita ? 'estrella-llena' : 'estrella'));
    }
    const sinFavoritas = filtro === 'favoritas' && favoritas.size === 0;
    vacio.hidden = !sinFavoritas;
    grilla.hidden = sinFavoritas;
  }

  wrap.append(barra, subtitulo, filtros, grilla, vacio);
  contenedor.append(wrap);
  pintar();

  await cargarFuentes();
  await Promise.all(
    ESTILOS_IMAGEN.map(async (valor) => {
      try {
        const url = URL.createObjectURL(await componerMiniatura(datosDe(valor)));
        urlsMiniaturas.push(url);
        mostrarMiniatura(tarjetas[valor].marco, url, `Vista previa de la plantilla ${ETIQUETA_ESTILO[valor]}`);
        const ajustesEstilo = config.ajustesPorEstilo[valor];
        if (tarjetas[valor].badge) tarjetas[valor].badge.hidden = !(ajustesEstilo && esAjustePersonalizado(valor, ajustesEstilo));
      } catch {
        // una miniatura que falla no rompe el resto de la galería
      }
    })
  );
}
