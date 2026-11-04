import { describe, it, expect } from "vitest";
import { changeReportSheets, escapeExcelFormula, buildReportFilename } from "./changeReport";
import type { Baseline, ChangeRequest } from "./types";

describe("changeReport — protección contra inyección de fórmulas", () => {
  it("antepone apóstrofe a textos que empiezan con =, +, -, @, tabulador o retorno de carro", () => {
    expect(escapeExcelFormula("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
    expect(escapeExcelFormula("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
    expect(escapeExcelFormula("-texto")).toBe("'-texto");
    expect(escapeExcelFormula("@usuario")).toBe("'@usuario");
    expect(escapeExcelFormula("\tdato")).toBe("'\tdato");
    expect(escapeExcelFormula("\rdato")).toBe("'\rdato");
  });

  it("mantiene los números como números y los textos seguros sin cambios", () => {
    expect(escapeExcelFormula("Texto normal")).toBe("Texto normal");
    expect(escapeExcelFormula(123)).toBe(123);
    expect(escapeExcelFormula(-45.5)).toBe(-45.5);
    expect(escapeExcelFormula(0)).toBe(0);
    expect(escapeExcelFormula(null)).toBe(null);
  });

  it("escapa campos de usuario en las hojas generadas si empiezan con =", () => {
    const maliciousChange: ChangeRequest = {
      id: "ch-mal",
      projectId: "p1",
      title: "=cmd|' /C calc'!A0",
      description: "=2+2",
      requestedBy: "=cliente",
      registeredBy: null,
      createdAt: "2026-05-01",
      urgent: false,
      impactHours: 10,
      impactDays: 2,
      status: "pendiente",
      decidedBy: null,
      decidedAt: null,
      decisionNote: "=rechazo",
      taskId: null,
      duringSprint: false,
    };

    const sheets = changeReportSheets({
      project: { name: "=ProyectoMalicioso" },
      code: "=CODE",
      clientName: "=ClienteMalicioso",
      changes: [maliciousChange],
      baselines: [],
      users: [],
    });

    // En Resumen
    const resumen = sheets["Resumen"];
    const mapResumen = Object.fromEntries(resumen);
    expect(mapResumen["Proyecto"]).toBe("'=ProyectoMalicioso");
    expect(mapResumen["Código"]).toBe("'=CODE");
    expect(mapResumen["Cliente"]).toBe("'=ClienteMalicioso");

    // En Cambios (fila 1, tras los encabezados)
    const row = sheets["Cambios"][1];
    expect(row[1]).toBe("'=cmd|' /C calc'!A0"); // Título
    expect(row[2]).toBe("'=2+2"); // Descripción
    expect(row[3]).toBe("'=cliente"); // Pedido por
    expect(row[6]).toBe(10); // Los números siguen siendo números
    expect(row[7]).toBe(2);
  });
});

describe("changeReport — orden de las solicitudes", () => {
  it("ordena la hoja Cambios de la más vieja a la más nueva (cronológico)", () => {
    const c1: ChangeRequest = {
      id: "c1",
      projectId: "p1",
      title: "Cambio marzo",
      description: "",
      requestedBy: "Cliente",
      registeredBy: null,
      createdAt: "2026-03-15",
      urgent: false,
      impactHours: 5,
      impactDays: 1,
      status: "aprobado",
      decidedBy: null,
      decidedAt: "2026-03-16",
      decisionNote: "",
      taskId: null,
      duringSprint: false,
    };
    const c2: ChangeRequest = {
      id: "c2",
      projectId: "p1",
      title: "Cambio enero",
      description: "",
      requestedBy: "Cliente",
      registeredBy: null,
      createdAt: "2026-01-10",
      urgent: false,
      impactHours: 4,
      impactDays: 0,
      status: "pendiente",
      decidedBy: null,
      decidedAt: null,
      decisionNote: "",
      taskId: null,
      duringSprint: false,
    };
    const c3: ChangeRequest = {
      id: "c3",
      projectId: "p1",
      title: "Cambio febrero",
      description: "",
      requestedBy: "Cliente",
      registeredBy: null,
      createdAt: "2026-02-20",
      urgent: false,
      impactHours: 8,
      impactDays: 2,
      status: "rechazado",
      decidedBy: null,
      decidedAt: "2026-02-21",
      decisionNote: "No corresponde",
      taskId: null,
      duringSprint: false,
    };

    // Pasamos desordenadas: marzo, enero, febrero
    const sheets = changeReportSheets({
      project: { name: "Proyecto Test" },
      changes: [c1, c2, c3],
      baselines: [],
      users: [],
    });

    const rows = sheets["Cambios"];
    expect(rows).toHaveLength(4); // 1 header + 3 datos
    // Fila 1: enero (10/01/2026)
    expect(rows[1][0]).toBe("10/01/2026");
    expect(rows[1][1]).toBe("Cambio enero");
    // Fila 2: febrero (20/02/2026)
    expect(rows[2][0]).toBe("20/02/2026");
    expect(rows[2][1]).toBe("Cambio febrero");
    // Fila 3: marzo (15/03/2026)
    expect(rows[3][0]).toBe("15/03/2026");
    expect(rows[3][1]).toBe("Cambio marzo");
  });
});

describe("changeReport — resolución de nombres y Sí/No", () => {
  it("resuelve nombres de usuarios, cliente, tarea creada y solicitud relacionada en líneas base", () => {
    const change: ChangeRequest = {
      id: "ch-100",
      projectId: "p1",
      title: "Mover accesos",
      description: "Reubicación de portón",
      requestedBy: "Arq. Rossi (cliente)",
      registeredBy: "u-reg",
      createdAt: "2026-04-05",
      urgent: true,
      impactHours: 16,
      impactDays: 3,
      status: "aprobado",
      decidedBy: "u-dec",
      decidedAt: "2026-04-06",
      decisionNote: "Aprobado en reunión",
      taskId: "task-50",
      duringSprint: true,
    };

    const task = {
      id: "task-50",
      name: "Ajustar modelo de accesos",
    };

    const baseline: Baseline = {
      id: "base-1",
      projectId: "p1",
      version: 2,
      date: "2026-04-06",
      scopeHours: 116,
      endDate: "2026-08-30",
      reason: "Aprobación de cambio Mover accesos",
      changeRequestId: "ch-100",
    };

    const sheets = changeReportSheets({
      project: { name: "Torre Alvear", clientId: "c-1", code: "ALV-01" },
      clients: [{ id: "c-1", name: "Inversiones SA" }],
      users: [
        { id: "u-reg", name: "Lucía Fernández" },
        { id: "u-dec", name: "Esteban Quito" },
      ],
      changes: [change],
      baselines: [baseline],
      tasks: [task],
      reportDate: "2026-04-10",
    });

    // 1. Resumen
    const resumen = Object.fromEntries(sheets["Resumen"]);
    expect(resumen["Proyecto"]).toBe("Torre Alvear");
    expect(resumen["Código"]).toBe("ALV-01");
    expect(resumen["Cliente"]).toBe("Inversiones SA");
    expect(resumen["Fecha del informe"]).toBe("10/04/2026");

    // 2. Cambios
    const changeRow = sheets["Cambios"][1];
    expect(changeRow[0]).toBe("05/04/2026"); // Fecha solicitud
    expect(changeRow[1]).toBe("Mover accesos"); // Título
    expect(changeRow[3]).toBe("Arq. Rossi (cliente)"); // Pedido por
    expect(changeRow[4]).toBe("Lucía Fernández"); // Registrado por (resuelto)
    expect(changeRow[5]).toBe("Sí"); // Urgente (booleano Sí/No)
    expect(changeRow[6]).toBe(16); // Horas
    expect(changeRow[7]).toBe(3); // Días
    expect(changeRow[8]).toBe("Aprobado"); // Estado
    expect(changeRow[9]).toBe("Esteban Quito"); // Decidido por (resuelto)
    expect(changeRow[10]).toBe("06/04/2026"); // Fecha decisión
    expect(changeRow[11]).toBe("Aprobado en reunión"); // Nota decisión
    expect(changeRow[12]).toBe("Ajustar modelo de accesos"); // Tarea creada (resuelta)
    expect(changeRow[13]).toBe("Sí"); // Entró en pleno sprint (booleano Sí/No)

    // 3. Líneas base
    const baseRow = sheets["Líneas base"][1];
    expect(baseRow[0]).toBe(2); // Versión
    expect(baseRow[1]).toBe("06/04/2026"); // Fecha
    expect(baseRow[2]).toBe(116); // Alcance
    expect(baseRow[3]).toBe("30/08/2026"); // Fin previsto
    expect(baseRow[4]).toBe("Aprobación de cambio Mover accesos");
    expect(baseRow[5]).toBe("Mover accesos"); // Solicitud relacionada (resuelta)
  });

  it("muestra 'No' para booleanos en falso", () => {
    const change: ChangeRequest = {
      id: "ch-falsy",
      projectId: "p1",
      title: "Detalle menor",
      description: "",
      requestedBy: "Cliente",
      registeredBy: null,
      createdAt: "2026-05-10",
      urgent: false,
      impactHours: null,
      impactDays: null,
      status: "pendiente",
      decidedBy: null,
      decidedAt: null,
      decisionNote: "",
      taskId: null,
      duringSprint: false,
    };

    const sheets = changeReportSheets({
      project: { name: "P" },
      changes: [change],
      baselines: [],
      users: [],
    });

    const row = sheets["Cambios"][1];
    expect(row[5]).toBe("No"); // Urgente
    expect(row[13]).toBe("No"); // Entró en pleno sprint
  });
});

describe("changeReport — independencia del filtro de pantalla", () => {
  it("exporta todo el historial del proyecto sin importar filtros de estado", () => {
    const changes: ChangeRequest[] = [
      { id: "1", projectId: "p", title: "C1", description: "", requestedBy: "", registeredBy: null, createdAt: "2026-01-01", urgent: false, impactHours: 5, impactDays: null, status: "pendiente", decidedBy: null, decidedAt: null, decisionNote: "", taskId: null, duringSprint: false },
      { id: "2", projectId: "p", title: "C2", description: "", requestedBy: "", registeredBy: null, createdAt: "2026-01-02", urgent: false, impactHours: 10, impactDays: null, status: "aprobado", decidedBy: null, decidedAt: "2026-01-03", decisionNote: "", taskId: null, duringSprint: false },
      { id: "3", projectId: "p", title: "C3", description: "", requestedBy: "", registeredBy: null, createdAt: "2026-01-03", urgent: false, impactHours: 2, impactDays: null, status: "diferido", decidedBy: null, decidedAt: "2026-01-04", decisionNote: "", taskId: null, duringSprint: false },
      { id: "4", projectId: "p", title: "C4", description: "", requestedBy: "", registeredBy: null, createdAt: "2026-01-04", urgent: false, impactHours: 4, impactDays: null, status: "rechazado", decidedBy: null, decidedAt: "2026-01-05", decisionNote: "", taskId: null, duringSprint: false },
    ];

    // En la UI, el filtro de pantalla podría tener solo las pendientes (1 cambio).
    // Pero la función exportadora recibe el array completo de changes del proyecto:
    const sheets = changeReportSheets({
      project: { name: "Proyecto Filtros" },
      changes,
      baselines: [],
      users: [],
    });

    // Se exportaron los 4 cambios
    expect(sheets["Cambios"]).toHaveLength(5); // 1 header + 4 rows

    // Totales en resumen
    const resumen = Object.fromEntries(sheets["Resumen"]);
    expect(resumen["Solicitudes"]).toBe(4);
    expect(resumen["Aprobadas"]).toBe(1);
    expect(resumen["Diferidas"]).toBe(1);
    expect(resumen["Rechazadas"]).toBe(1);
    expect(resumen["Pendientes"]).toBe(1);
    expect(resumen["Horas absorbidas"]).toBe(10);
  });
});

describe("changeReport — nombres de archivo y sanitización", () => {
  it("arma el nombre con código de proyecto y fecha, limpiando caracteres inválidos", () => {
    const fn = buildReportFilename({
      code: "PRJ:01/B",
      project: { name: "Mi Proyecto" },
      reportDate: "2026-11-04",
    });
    expect(fn).toBe("Historial_cambios_PRJ_01_B_2026-11-04.xlsx");
    expect(fn).not.toMatch(/[:/\\?%*|"<>]/);
  });

  it("si no hay código usa el nombre del proyecto sanitizado", () => {
    const fn = buildReportFilename({
      code: null,
      project: { name: "Torre 1 / Fase 2 <Final>" },
      reportDate: "2026-11-04",
    });
    expect(fn).toBe("Historial_cambios_Torre_1___Fase_2__Final__2026-11-04.xlsx");
  });
});
