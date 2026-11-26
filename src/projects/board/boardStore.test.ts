import { describe, expect, it } from "vitest";
import { boardEpoch, clearAllBoards, loadBoard, parseBoardDoc, saveBoard, type BoardDoc } from "./boardStore";

const ok: BoardDoc = {
  projectId: "p1", version: 1, fabric: { objects: [] }, viewport: { x: 0, y: 0, zoom: 1 }, updatedAt: "2026-10-08T10:00:00.000Z",
};

describe("parseBoardDoc", () => {
  it("acepta un registro válido", () => {
    expect(parseBoardDoc(ok, "p1")).toEqual(ok);
  });
  it("rechaza otro proyecto, otra versión o datos rotos", () => {
    expect(parseBoardDoc({ ...ok, projectId: "p2" }, "p1")).toBeNull();
    expect(parseBoardDoc({ ...ok, version: 2 }, "p1")).toBeNull();
    expect(parseBoardDoc({ ...ok, fabric: { objects: "x" } }, "p1")).toBeNull();
    expect(parseBoardDoc({ ...ok, viewport: { x: 0, y: 0, zoom: 0 } }, "p1")).toBeNull();
    expect(parseBoardDoc({ ...ok, viewport: { x: Number.NaN, y: 0, zoom: 1 } }, "p1")).toBeNull();
    expect(parseBoardDoc({ ...ok, updatedAt: 5 }, "p1")).toBeNull();
    expect(parseBoardDoc("hola", "p1")).toBeNull();
    expect(parseBoardDoc(null, "p1")).toBeNull();
  });
});

describe("sin IndexedDB", () => {
  it("cargar y guardar avisan que no está disponible", async () => {
    expect(await loadBoard("p1")).toEqual({ status: "unavailable" });
    expect(await saveBoard(ok)).toBe("unavailable");
  });
  it("clearAllBoards cambia la época igual", async () => {
    const before = boardEpoch();
    await clearAllBoards();
    expect(boardEpoch()).toBe(before + 1);
  });
});
