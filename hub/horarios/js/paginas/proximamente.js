export async function render(contenedor, titulo = 'Próximamente') {
  contenedor.innerHTML = `
    <div class="pagina">
      <div class="encabezado"><div class="encabezado-titulo">${titulo}</div></div>
      <div class="estado-vacio" style="margin:40px 20px;">
        Esta pantalla llega en la siguiente entrega.
      </div>
    </div>
  `;
}
