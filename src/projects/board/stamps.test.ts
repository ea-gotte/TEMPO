import { describe, expect, it } from "vitest";
import { STAMPS, stampText } from "./stamps";

describe("sellos de revisión", () => {
  it("hay sellos para aprobar, observar, pedir revisión, rechazar e informar", () => {
    expect(STAMPS.map((s) => s.label)).toEqual(["Aprobado", "Aprobado con observaciones", "Revisar y reenviar", "Rechazado", "Para información"]);
  });
  it("el texto del sello va en mayúsculas con la fecha", () => {
    expect(stampText(STAMPS[0], "2026-10-09")).toBe("APROBADO\n09/10/2026");
  });
});
