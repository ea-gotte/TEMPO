import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import { useWork } from "../projects/workStore";
import type { Role, User } from "../types";
import { Avatar, Empty } from "../components/ui";
import { buildForest, buildLayout, teamIds, CARD_W, CARD_H } from "../orgTree";
import { visibleProjects } from "../projects/visibility";
import { projectOrgTree, rolesByUser, userProjects, type UserRoleItem } from "../projects/projectOrg";

/**
 * Organigrama del perfil profesional con dos vistas:
 * 1) "Por proyecto": estructura del equipo según los roles asignados en el proyecto.
 * 2) "Cadena de mando": jerarquía según el supervisor asignado a cada persona.
 */

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  supervisor: "Supervisor",
  usuario: "Usuario",
};

const PROJECT_CARD_W = 190;
const PROJECT_CARD_H = CARD_H;

/**
 * Genera el title detallado y el texto de la segunda línea de la tarjeta en la vista de Cadena de mando.
 * Concatena el rol en el sistema con el conteo de roles en proyectos visibles (ej: "Supervisor · PM en 2").
 */
function formatMandoCard(
  user: User,
  systemRoleLabel: string,
  userRoles: UserRoleItem[],
): { title: string; subtitle: string } {
  const baseTitle = `${user.name} · ${systemRoleLabel}`;
  if (userRoles.length === 0) {
    return { title: baseTitle, subtitle: systemRoleLabel };
  }

  // En el title se lista el detalle por proyecto
  const byProj = new Map<string, string[]>();
  for (const r of userRoles) {
    if (!byProj.has(r.projectName)) byProj.set(r.projectName, []);
    const labels = byProj.get(r.projectName)!;
    if (!labels.includes(r.roleLabel)) labels.push(r.roleLabel);
  }
  const lines = Array.from(byProj.entries()).map(([pName, labels]) => `${pName}: ${labels.join(", ")}`);
  const title = `${baseTitle}\n${lines.join("\n")}`;

  // En la segunda línea se resume la cantidad de proyectos por rol (ej: "PM en 2")
  const roleProjectCounts = new Map<string, { label: string; projects: Set<string>; rank: number }>();
  for (const r of userRoles) {
    let short = r.roleLabel;
    let rank = 3;
    if (r.roleLabel === "Project Manager" || r.roleLabel === "PM") {
      short = "PM";
      rank = 0;
    } else if (r.roleLabel === "Líder Funcional" || r.roleLabel === "LF") {
      short = "LF";
      rank = 1;
    } else if (r.roleLabel === "Coordinador" || r.roleLabel === "Coord") {
      short = "Coord";
      rank = 2;
    }

    if (!roleProjectCounts.has(short)) {
      roleProjectCounts.set(short, { label: short, projects: new Set(), rank });
    }
    roleProjectCounts.get(short)!.projects.add(r.projectId);
  }

  const summaries = Array.from(roleProjectCounts.values())
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
    .map((item) => `${item.label} en ${item.projects.size}`);

  const summary = summaries.join(", ");
  const subtitle = summary ? `${systemRoleLabel} · ${summary}` : systemRoleLabel;

  return { title, subtitle };
}

export function OrgChart({ meId }: { meId: string }) {
  const { state } = useStore();
  const work = useWork();

  const [view, setView] = useState<"proyecto" | "mando">("proyecto");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  // Quien usa la app actualmente
  const currentUserId = state.currentUserId;
  const currentUser = useMemo(
    () => state.users.find((u) => u.id === currentUserId) ?? null,
    [state.users, currentUserId],
  );

  // La persona dueña del perfil consultado
  const me = useMemo(
    () => state.users.find((u) => u.id === meId) ?? { id: meId, name: "", role: "usuario" as Role, active: true },
    [state.users, meId],
  );
  // La empresa completa solo la ve un admin en su propio perfil: mirar el perfil de un admin no alcanza
  const isAdmin = me.role === "admin" && currentUserId === meId;

  // Árbol de cadena de mando
  const mandoRoots = useMemo(() => {
    const active = state.users.filter((u) => u.active);
    if (isAdmin) return buildForest(active);
    const ids = teamIds(active, meId);
    return buildForest(active.filter((u) => ids.has(u.id)));
  }, [state.users, isAdmin, meId]);

  const mandoLayout = useMemo(() => buildLayout(mandoRoots), [mandoRoots]);

  // Proyectos que quien usa la app tiene permiso de ver
  const appUserVisibleProjects = useMemo(() => {
    if (!currentUser) return [];
    return visibleProjects(state.projects, work.assignments, currentUser);
  }, [state.projects, work.assignments, currentUser]);

  const appUserVisibleProjectIds = useMemo(
    () => new Set(appUserVisibleProjects.map((p) => p.id)),
    [appUserVisibleProjects],
  );

  // Proyectos no archivados para el selector de "Por proyecto":
  // Si la persona es gerente o admin y mira su propio perfil, todos los no archivados.
  // En caso contrario, los no archivados en los que participa, limitados a los visibles para quien usa la app.
  const selectableProjects = useMemo(() => {
    const unarchived = state.projects.filter((p) => p.status !== "archivado");
    const isSelf = currentUserId === meId;
    const isStaff = currentUser?.role === "admin" || currentUser?.role === "gerente";

    if (isSelf && isStaff) {
      return unarchived;
    }

    const personProjects = userProjects(unarchived, work.assignments, meId);
    return personProjects.filter((p) => appUserVisibleProjectIds.has(p.id));
  }, [state.projects, currentUserId, meId, currentUser?.role, work.assignments, appUserVisibleProjectIds]);

  // Proyecto activo seleccionado
  const activeProjectId = useMemo(() => {
    if (selectedProjectId && selectableProjects.some((p) => p.id === selectedProjectId)) {
      return selectedProjectId;
    }
    return selectableProjects[0]?.id ?? "";
  }, [selectedProjectId, selectableProjects]);

  const selectedProject = useMemo(
    () => selectableProjects.find((p) => p.id === activeProjectId) ?? null,
    [selectableProjects, activeProjectId],
  );

  // Asignaciones del proyecto activo
  const projectAssignments = useMemo(() => {
    if (!selectedProject) return [];
    return work.assignments.filter((a) => a.projectId === selectedProject.id);
  }, [selectedProject, work.assignments]);

  // Árbol y roles del proyecto
  const projectOrg = useMemo(() => {
    if (!selectedProject) {
      return { roots: [], roleLabels: new Map<string, string[]>() };
    }
    return projectOrgTree(selectedProject, work.assignments, work.roles, state.users);
  }, [selectedProject, work.assignments, work.roles, state.users]);

  const projectLayout = useMemo(() => {
    return buildLayout(projectOrg.roots, PROJECT_CARD_W, PROJECT_CARD_H);
  }, [projectOrg.roots]);

  // Mapa de roles por usuario en todos los proyectos para tooltips y subtítulos de Cadena de mando
  const allRolesByUser = useMemo(() => {
    return rolesByUser(work.assignments, work.roles, state.projects);
  }, [work.assignments, work.roles, state.projects]);

  return (
    <div className="card">
      <div
        style={{
          padding: "16px 18px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div className="card-title" style={{ marginBottom: 0 }}>
          {view === "mando" ? (isAdmin ? "Organigrama de la empresa" : "Organigrama") : "Organigrama por proyecto"}
        </div>
        <div className="tabs">
          <button
            type="button"
            className={view === "proyecto" ? "active" : ""}
            onClick={() => setView("proyecto")}
          >
            Por proyecto
          </button>
          <button
            type="button"
            className={view === "mando" ? "active" : ""}
            onClick={() => setView("mando")}
          >
            Cadena de mando
          </button>
        </div>
      </div>

      {view === "proyecto" ? (
        selectableProjects.length === 0 ? (
          <div style={{ padding: "20px 18px 30px" }}>
            <Empty
              icon="folder"
              text="Sin proyectos"
              sub="Esta persona no participa en proyectos visibles."
            />
          </div>
        ) : (
          <>
            <div style={{ padding: "0 18px 12px", display: "flex", alignItems: "center", gap: 10 }}>
              <label htmlFor="org-project-select" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>
                Proyecto:
              </label>
              <select
                id="org-project-select"
                className="select"
                style={{ maxWidth: 320, cursor: "pointer" }}
                value={activeProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                {selectableProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {projectLayout.nodes.length === 0 ? (
              <div style={{ padding: "20px 18px 30px" }}>
                <Empty icon="users" text="Este proyecto todavía no tiene equipo ni roles asignados" />
              </div>
            ) : (
              <div style={{ overflowX: "auto", padding: "10px 18px 20px" }}>
                {projectAssignments.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10 }}>
                    Todavía no hay roles asignados en este proyecto: se muestra solo el equipo.
                  </div>
                )}
                <div style={{ position: "relative", width: projectLayout.totalWidth, height: projectLayout.totalHeight }}>
                  <svg
                    width={projectLayout.totalWidth}
                    height={projectLayout.totalHeight}
                    style={{ position: "absolute", inset: 0, overflow: "visible" }}
                  >
                    {projectLayout.edges.map((e, i) => {
                      const midX = (e.x1 + e.x2) / 2;
                      return (
                        <path
                          key={i}
                          d={`M ${e.x1} ${e.y1} H ${midX} V ${e.y2} H ${e.x2}`}
                          fill="none"
                          stroke="var(--border-strong)"
                          strokeWidth={1.5}
                        />
                      );
                    })}
                  </svg>
                  {projectLayout.nodes.map((n) => {
                    const roleLabelsList = projectOrg.roleLabels.get(n.user.id) ?? ["Equipo"];
                    const roleLabelsText = roleLabelsList.join(", ");
                    const systemRoleText = ROLE_LABEL[n.user.role];
                    const secondLineText = `${roleLabelsText} · ${systemRoleText}`;
                    const cardTitle = `${n.user.name} · ${secondLineText}`;

                    return (
                      <div
                        key={n.user.id}
                        className={`org-card${n.user.id === meId ? " me" : ""}`}
                        style={{
                          position: "absolute",
                          left: n.x,
                          top: n.y,
                          width: PROJECT_CARD_W,
                          height: PROJECT_CARD_H,
                        }}
                        title={cardTitle}
                      >
                        <Avatar name={n.user.name} size={26} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="org-name">{n.user.name}</div>
                          <div
                            className="org-role"
                            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            {secondLineText}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )
      ) : mandoLayout.nodes.length <= 1 ? (
        <div style={{ textAlign: "center", color: "var(--text-3)", padding: 30 }}>
          Todavía no hay una jerarquía definida (asigná un supervisor en Equipo).
        </div>
      ) : (
        <div style={{ overflowX: "auto", padding: "10px 18px 20px" }}>
          <div style={{ position: "relative", width: mandoLayout.totalWidth, height: mandoLayout.totalHeight }}>
            <svg
              width={mandoLayout.totalWidth}
              height={mandoLayout.totalHeight}
              style={{ position: "absolute", inset: 0, overflow: "visible" }}
            >
              {mandoLayout.edges.map((e, i) => {
                const midX = (e.x1 + e.x2) / 2;
                return (
                  <path
                    key={i}
                    d={`M ${e.x1} ${e.y1} H ${midX} V ${e.y2} H ${e.x2}`}
                    fill="none"
                    stroke="var(--border-strong)"
                    strokeWidth={1.5}
                  />
                );
              })}
            </svg>
            {mandoLayout.nodes.map((n) => {
              const userRolesInVisible = (allRolesByUser.get(n.user.id) ?? []).filter((r) =>
                appUserVisibleProjectIds.has(r.projectId),
              );
              const { title, subtitle } = formatMandoCard(
                n.user,
                ROLE_LABEL[n.user.role],
                userRolesInVisible,
              );

              return (
                <div
                  key={n.user.id}
                  className={`org-card${n.user.id === meId ? " me" : ""}`}
                  style={{ position: "absolute", left: n.x, top: n.y, width: CARD_W, height: CARD_H }}
                  title={title}
                >
                  <Avatar name={n.user.name} size={26} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="org-name">{n.user.name}</div>
                    <div
                      className="org-role"
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {subtitle}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
