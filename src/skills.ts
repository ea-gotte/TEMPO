import type { AppState, SurveyQuestionType } from "./types";

/**
 * Habilidades: se alimentan de lo que la persona respondió en las encuestas
 * (autopercepción), nunca de la experiencia real de proyectos (eso es Horas
 * de vuelo, ver flightHours.ts). Las preguntas son libres por encuesta —no
 * hay catálogo fijo de habilidades— así que acá se toma, por cada pregunta
 * (identificada por su texto), la respuesta más reciente entre todas las
 * rondas de encuesta que la persona respondió.
 */
export interface SkillEntry {
  label: string;
  type: SurveyQuestionType;
  value: string;
  surveyTitle: string;
  submittedAt: string;
}

export function computeSkills(state: AppState, userId: string): SkillEntry[] {
  const responses = state.surveyResponses
    .filter((r) => r.userId === userId)
    .map((r) => ({ r, survey: state.surveys.find((s) => s.id === r.surveyId) }))
    .filter((x) => x.survey)
    .sort((a, b) => b.r.submittedAt.localeCompare(a.r.submittedAt));

  const seen = new Set<string>();
  const out: SkillEntry[] = [];
  for (const { r, survey } of responses) {
    if (!survey) continue;
    for (const ans of r.answers) {
      const q = survey.questions.find((x) => x.id === ans.questionId);
      if (!q || !ans.value.trim()) continue;
      const key = q.label.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label: q.label, type: q.type, value: ans.value, surveyTitle: survey.title, submittedAt: r.submittedAt });
    }
  }
  return out;
}
