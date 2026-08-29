import React, { useState } from "react";
import { useStore } from "../store";
import type { Survey } from "../types";
import { Modal, useToast } from "./ui";
import { Icon } from "./Icon";
import { uid } from "../utils";

export function SurveyModal({ survey, onClose }: { survey: Survey; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const existing = state.surveyResponses.find((r) => r.surveyId === survey.id && r.userId === state.currentUserId);
  const initial: Record<string, string> = {};
  for (const a of existing?.answers ?? []) initial[a.questionId] = a.value;
  const [answers, setAnswers] = useState<Record<string, string>>(initial);

  function setAnswer(qid: string, value: string) {
    setAnswers((a) => ({ ...a, [qid]: value }));
  }

  /** "checkbox" permite elegir varias: se guardan unidas por "; " en el mismo string de respuesta */
  function toggleCheckbox(qid: string, option: string) {
    const current = (answers[qid] ?? "").split("; ").filter(Boolean);
    const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option];
    setAnswer(qid, next.join("; "));
  }

  const allAnswered = survey.questions.every((q) => (answers[q.id] ?? "").trim() !== "");

  function submit() {
    if (!allAnswered) return;
    const response = {
      id: existing?.id ?? uid(),
      surveyId: survey.id,
      userId: state.currentUserId,
      answers: survey.questions.map((q) => ({ questionId: q.id, value: answers[q.id] ?? "" })),
      submittedAt: new Date().toISOString(),
    };
    dispatch({
      type: "patch",
      patch: {
        surveyResponses: existing
          ? state.surveyResponses.map((r) => (r.id === existing.id ? response : r))
          : [...state.surveyResponses, response],
      },
    });
    dispatch({ type: "audit", action: "Encuesta respondida", detail: survey.title });
    toast("¡Gracias por responder la encuesta!");
    onClose();
  }

  return (
    <Modal
      title={survey.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
          <button className="btn btn-primary" onClick={submit} disabled={!allAnswered}>
            {existing ? "Actualizar respuestas" : "Enviar respuestas"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {survey.questions.map((q) => (
          <div className="field" key={q.id}>
            <label>{q.label}</label>
            {q.type === "rating5" && (
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`btn btn-sm ${answers[q.id] === String(n) ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setAnswer(q.id, String(n))}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
            {q.type === "yesno" && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${answers[q.id] === "si" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setAnswer(q.id, "si")}
                >
                  Sí
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${answers[q.id] === "no" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setAnswer(q.id, "no")}
                >
                  No
                </button>
              </div>
            )}
            {q.type === "text" && (
              <textarea className="textarea" rows={3} value={answers[q.id] ?? ""} onChange={(e) => setAnswer(q.id, e.target.value)} />
            )}
            {q.type === "choice" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(q.options ?? []).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={`btn btn-sm ${answers[q.id] === opt ? "btn-primary" : "btn-secondary"}`}
                    style={{ justifyContent: "flex-start" }}
                    onClick={() => setAnswer(q.id, opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
            {q.type === "checkbox" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(q.options ?? []).map((opt) => {
                  const selected = (answers[q.id] ?? "").split("; ").filter(Boolean).includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      className={`btn btn-sm ${selected ? "btn-primary" : "btn-secondary"}`}
                      style={{ justifyContent: "flex-start" }}
                      onClick={() => toggleCheckbox(q.id, opt)}
                    >
                      <Icon name="check" size={12} style={{ opacity: selected ? 1 : 0.25 }} /> {opt}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
