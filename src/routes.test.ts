import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseRoute, buildPath, PAGE_SLUGS } from "./routes";
import type { PageKey } from "./components/Shell";

// routes.ts usa import.meta.env.BASE_URL y window — mockeamos lo necesario
// para las funciones puras (parseRoute y buildPath no necesitan window).

// ---------------------------------------------------------------------------
// parseRoute
// ---------------------------------------------------------------------------
describe("parseRoute — base /", () => {
  it("un slug que coincide con una propiedad de Object no es una página", () => {
    for (const s of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(parseRoute("/" + s, "/")).toEqual({ page: null, rest: [] });
    }
  });

  it("raíz '/' → page null", () => {
    expect(parseRoute("/", "/")).toEqual({ page: null, rest: [] });
  });

  it("barra final '/calendario/' → calendar", () => {
    expect(parseRoute("/calendario/", "/")).toMatchObject({ page: "calendar" });
  });

  it("slug exacto '/registro' → tracker", () => {
    expect(parseRoute("/registro", "/")).toMatchObject({ page: "tracker" });
  });

  it("slug desconocido '/foo' → page null", () => {
    expect(parseRoute("/foo", "/")).toEqual({ page: null, rest: [] });
  });

  it("subsegmentos decodificados '/proyectos/mi%20proyecto/tarea%201'", () => {
    const { page, rest } = parseRoute("/proyectos/mi%20proyecto/tarea%201", "/");
    expect(page).toBe("projects");
    expect(rest).toEqual(["mi proyecto", "tarea 1"]);
  });

  it("subsegmentos con acentos '/proyectos/dise%C3%B1o'", () => {
    const { page, rest } = parseRoute("/proyectos/dise%C3%B1o", "/");
    expect(page).toBe("projects");
    expect(rest).toEqual(["diseño"]);
  });
});

describe("parseRoute — base /TEMPO/", () => {
  it("raíz '/TEMPO/' → page null", () => {
    expect(parseRoute("/TEMPO/", "/TEMPO/")).toEqual({ page: null, rest: [] });
  });

  it("'/TEMPO' sin barra → page null (es la raíz sin trailing slash)", () => {
    expect(parseRoute("/TEMPO", "/TEMPO/")).toEqual({ page: null, rest: [] });
  });

  it("'/TEMPO/calendario' → calendar", () => {
    expect(parseRoute("/TEMPO/calendario", "/TEMPO/")).toMatchObject({ page: "calendar" });
  });

  it("'/TEMPO/calendario/' con barra → calendar", () => {
    expect(parseRoute("/TEMPO/calendario/", "/TEMPO/")).toMatchObject({ page: "calendar" });
  });

  it("slug desconocido '/TEMPO/unknown' → page null", () => {
    expect(parseRoute("/TEMPO/unknown", "/TEMPO/")).toEqual({ page: null, rest: [] });
  });

  it("subsegmentos '/TEMPO/proyectos/p1/t2' → rest correcto", () => {
    const { page, rest } = parseRoute("/TEMPO/proyectos/p1/t2", "/TEMPO/");
    expect(page).toBe("projects");
    expect(rest).toEqual(["p1", "t2"]);
  });

  it("URL de otra app '/OTRA/' → page null", () => {
    expect(parseRoute("/OTRA/calendario", "/TEMPO/")).toEqual({ page: null, rest: [] });
  });
});

// ---------------------------------------------------------------------------
// buildPath
// ---------------------------------------------------------------------------
describe("buildPath — base /", () => {
  it("calendar sin rest → '/calendario'", () => {
    expect(buildPath("calendar", [], "/")).toBe("/calendario");
  });

  it("projects con rest ['mi proyecto'] → encodeURIComponent", () => {
    expect(buildPath("projects", ["mi proyecto"], "/")).toBe("/proyectos/mi%20proyecto");
  });
});

describe("buildPath — base /TEMPO/", () => {
  it("calendar sin rest → '/TEMPO/calendario'", () => {
    expect(buildPath("calendar", [], "/TEMPO/")).toBe("/TEMPO/calendario");
  });

  it("projects con rest ['diseño'] → codificado", () => {
    expect(buildPath("projects", ["diseño"], "/TEMPO/")).toBe("/TEMPO/proyectos/dise%C3%B1o");
  });
});

// ---------------------------------------------------------------------------
// Ida y vuelta: buildPath → parseRoute para todas las páginas
// ---------------------------------------------------------------------------
describe("ida y vuelta buildPath → parseRoute", () => {
  const bases = ["/", "/TEMPO/"] as const;

  for (const base of bases) {
    describe(`base = "${base}"`, () => {
      for (const [key, slug] of Object.entries(PAGE_SLUGS)) {
        it(`${key} (slug=${slug})`, () => {
          const path = buildPath(key as PageKey, [], base);
          const { page, rest } = parseRoute(path, base);
          expect(page).toBe(key);
          expect(rest).toEqual([]);
        });
      }

      it("ida y vuelta con rest ['a b', 'ñ']", () => {
        const path = buildPath("projects", ["a b", "ñ"], base);
        const { page, rest } = parseRoute(path, base);
        expect(page).toBe("projects");
        expect(rest).toEqual(["a b", "ñ"]);
      });
    });
  }
});
