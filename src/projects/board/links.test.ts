import { describe, expect, it } from "vitest";
import { normalizeLink } from "./links";

describe("enlaces en los objetos", () => {
  it("acepta direcciones web y de correo", () => {
    expect(normalizeLink("https://quantia.sharepoint.com/sites/obra/plano.pdf")).toBe("https://quantia.sharepoint.com/sites/obra/plano.pdf");
    expect(normalizeLink("  http://intranet.local/x  ")).toBe("http://intranet.local/x");
    expect(normalizeLink("mailto:obra@quantia.com")).toBe("mailto:obra@quantia.com");
  });
  it("completa https:// si se pegó sin él", () => {
    expect(normalizeLink("www.quantia.com")).toBe("https://www.quantia.com");
    expect(normalizeLink("quantia.sharepoint.com/sites/obra")).toBe("https://quantia.sharepoint.com/sites/obra");
  });
  it("vacío = quitar el enlace", () => {
    expect(normalizeLink("   ")).toBe("");
  });
  it("rechaza lo que no es una dirección web (y lo peligroso)", () => {
    expect(normalizeLink("javascript:alert(1)")).toBeNull();
    expect(normalizeLink("JavaScript:alert(1)")).toBeNull();
    expect(normalizeLink("data:text/html,hola")).toBeNull();
    expect(normalizeLink("file:///C:/planos/p1.pdf")).toBeNull();
    expect(normalizeLink("revisar plano")).toBeNull();
  });
});
