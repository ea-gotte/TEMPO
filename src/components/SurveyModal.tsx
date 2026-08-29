import React, { useState } from "react";
import { useStore } from "../store";
import type { Survey } from "../types";
import { Modal, useToast } from "./ui";
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
          </div>
        ))}
      </div>
    </Modal>
  );
}
