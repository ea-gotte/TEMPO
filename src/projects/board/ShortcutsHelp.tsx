import React from "react";
import { Icon } from "../../components/Icon";
import { TOOLS } from "./tools";

/** Lista de atajos del tablero (tecla ?). Se dibuja dentro del tablero: también se ve en pantalla completa. */

const EDIT: [string, string][] = [
  ["Ctrl + Z", "Deshacer"],
  ["Ctrl + Y  ·  Ctrl + Shift + Z", "Rehacer"],
  ["Ctrl + C  ·  Ctrl + X  ·  Ctrl + V", "Copiar, cortar y pegar (también entre proyectos)"],
  ["Ctrl + D", "Duplicar"],
  ["Ctrl + A", "Seleccionar todo (menos lo bloqueado)"],
  ["Ctrl + F", "Buscar texto en el tablero"],
  ["Ctrl + ]  ·  Ctrl + [", "Traer al frente  ·  Enviar al fondo"],
  ["Supr  ·  Retroceso", "Eliminar"],
  ["Flechas  ·  Shift + flechas", "Mover 1 px  ·  10 px"],
  ["Doble clic", "Escribir en una nota, forma, flecha o línea"],
  ["Shift al dibujar", "Formas proporcionadas · rectas horizontales, verticales o a 45°"],
  ["Shift al girar", "De a 15°"],
  ["Clic derecho", "Más acciones"],
  ["Esc", "Soltar la selección y volver a Seleccionar"],
];

const VIEW: [string, string][] = [
  ["Rueda del mouse", "Acercar o alejar"],
  ["Espacio + arrastrar", "Desplazar la vista"],
  ["Shift + 1", "Ajustar al contenido"],
  ["Shift + 2", "Encuadrar la selección"],
  ["G", "Ajustar a la cuadrícula (activar o desactivar)"],
  ["?", "Esta ayuda"],
];

function Table({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section>
      <h3>{title}</h3>
      <dl>
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt><kbd>{k}</kbd></dt>
            <dd>{v}</dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  );
}

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const tools = TOOLS.map((t): [string, string] => [t.shortcut, t.label.replace(/ \(.*\)$/, "")]);
  return (
    <div className="bd-help" role="dialog" aria-label="Atajos de teclado" onClick={onClose}>
      <div className="bd-help-card" onClick={(e) => e.stopPropagation()}>
        <div className="bd-help-head">
          <b>Atajos de teclado</b>
          <button type="button" className="bd-btn" aria-label="Cerrar" title="Cerrar (Esc)" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="bd-help-cols">
          <Table title="Herramientas" rows={tools} />
          <Table title="Edición" rows={EDIT} />
          <Table title="Vista" rows={VIEW} />
        </div>
      </div>
    </div>
  );
}
