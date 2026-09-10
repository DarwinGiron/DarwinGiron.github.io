/**
 * Modal de formulario genérico, compartido por las pantallas de
 * administración del hub (editor del checklist SIG-FO-115 y gestión de
 * usuarios). Antes vivía dentro de admin.js; se extrajo al separar la
 * gestión de usuarios en su propia página, para no tener dos copias.
 *
 * Recibe los nodos del modal de cada página y devuelve sus funciones:
 *
 *   const { abrirModal } = crearModalFormulario({ modalFondo, modalTitulo,
 *                                                 formModal, btnCerrarModal });
 */
import { escaparHtml } from "./utils.js";

export function crearModalFormulario({ modalFondo, modalTitulo, formModal, btnCerrarModal }) {
  function abrirModal({ titulo, campos, valores = {}, alGuardar }) {
    modalTitulo.textContent = titulo;
    formModal.innerHTML = "";

    for (const campo of campos) {
      const contenedor = document.createElement("div");
      contenedor.className = "campo";

      if (campo.type === "checkbox") {
        contenedor.innerHTML = `
          <label class="check-linea">
            <input type="checkbox" name="${campo.name}" ${
          valores[campo.name] ? "checked" : ""
        } />
            ${escaparHtml(campo.label)}
          </label>
        `;
      } else if (campo.type === "textarea") {
        contenedor.innerHTML = `
          <label>${escaparHtml(campo.label)}</label>
          <textarea name="${campo.name}" ${campo.required ? "required" : ""} placeholder="${escaparHtml(
          campo.placeholder || ""
        )}">${escaparHtml(valores[campo.name] || "")}</textarea>
        `;
      } else if (campo.type === "select") {
        contenedor.innerHTML = `
          <label>${escaparHtml(campo.label)}</label>
          <select name="${campo.name}">
            ${campo.opciones
              .map(
                (op) =>
                  `<option value="${op.value}" ${
                    valores[campo.name] === op.value ? "selected" : ""
                  }>${escaparHtml(op.label)}</option>`
              )
              .join("")}
          </select>
        `;
      } else {
        contenedor.innerHTML = `
          <label>${escaparHtml(campo.label)}</label>
          <input
            type="${campo.type || "text"}"
            name="${campo.name}"
            ${campo.required ? "required" : ""}
            ${campo.disabled ? "disabled" : ""}
            ${campo.step ? `step="${campo.step}"` : ""}
            value="${escaparHtml(valores[campo.name] ?? "")}"
            placeholder="${escaparHtml(campo.placeholder || "")}"
          />
        `;
      }

      if (campo.ayuda) {
        const ayuda = document.createElement("p");
        ayuda.className = "campo-ayuda";
        ayuda.textContent = campo.ayuda;
        contenedor.appendChild(ayuda);
      }

      formModal.appendChild(contenedor);
    }

    const acciones = document.createElement("div");
    acciones.className = "grupo-botones";
    acciones.innerHTML = `
      <button type="submit" class="btn btn-primario btn-ancho-auto">Guardar</button>
      <button type="button" class="btn btn-secundario btn-ancho-auto" data-cerrar>Cancelar</button>
    `;
    formModal.appendChild(acciones);

    formModal.querySelector("[data-cerrar]").addEventListener("click", cerrarModal);

    formModal.onsubmit = async (evento) => {
      evento.preventDefault();
      const datos = new FormData(formModal);
      const resultado = {};
      for (const campo of campos) {
        if (campo.type === "checkbox") {
          resultado[campo.name] = formModal.querySelector(`[name="${campo.name}"]`).checked;
        } else if (campo.type === "number") {
          resultado[campo.name] = Number(datos.get(campo.name));
        } else {
          resultado[campo.name] = (datos.get(campo.name) || "").toString().trim();
        }
      }
      try {
        await alGuardar(resultado);
        cerrarModal();
      } catch (error) {
        // El error ya fue mostrado por la función guardarCampos/alGuardar.
      }
    };

    modalFondo.classList.remove("oculto");
  }

  function cerrarModal() {
    modalFondo.classList.add("oculto");
    formModal.onsubmit = null;
  }

  btnCerrarModal.addEventListener("click", cerrarModal);
  modalFondo.addEventListener("click", (evento) => {
    if (evento.target === modalFondo) cerrarModal();
  });

  return { abrirModal, cerrarModal };
}
