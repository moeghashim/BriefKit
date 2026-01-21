"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type InterviewTurn = {
  question: string;
  answer: string;
};

type FeatureResult = {
  project: string;
  branchName: string;
  description: string;
  introduction: string;
  goals: string[];
  features: Array<{
    name: string;
    summary: string;
    userStoryIds: string[];
  }>;
  userStories: Array<{
    id: string;
    title: string;
    description: string;
    acceptanceCriteria: string[];
  }>;
  functionalRequirements: string[];
  nonGoals: string[];
  designConsiderations: string[];
  technicalConsiderations: string[];
  successMetrics: string[];
  openQuestions: string[];
  prdMarkdown: string;
  prdJson: Record<string, unknown>;
};

type InputMode = "record" | "type";

const INPUT_MODES: Array<{ id: InputMode; label: string }> = [
  { id: "record", label: "Record" },
  { id: "type", label: "Type" }
];

const normalizeText = (value: unknown) => (typeof value === "string" ? value : "");

const extractTranscript = (payload: unknown) => {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  if (record.text && typeof (record.text as Record<string, unknown>).text === "string") {
    return (record.text as Record<string, unknown>).text as string;
  }
  if (typeof record.transcript === "string") return record.transcript;
  if (Array.isArray(record.segments)) {
    return record.segments
      .map((segment) => {
        if (typeof segment === "string") return segment;
        if (segment && typeof (segment as Record<string, unknown>).text === "string") {
          return (segment as Record<string, unknown>).text as string;
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }
  return "";
};

export default function InterviewClient() {
  const [brief, setBrief] = useState("");
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [interviewHistory, setInterviewHistory] = useState<InterviewTurn[]>([]);
  const [interviewSummary, setInterviewSummary] = useState<string[] | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [previewFeatures, setPreviewFeatures] = useState<FeatureResult["features"]>([]);
  const [previewStories, setPreviewStories] = useState<FeatureResult["userStories"]>([]);
  const [editableFeatures, setEditableFeatures] = useState<FeatureResult["features"]>([]);
  const [hasFeatureEdits, setHasFeatureEdits] = useState(false);
  const [interviewDone, setInterviewDone] = useState(false);
  const [loadingInterview, setLoadingInterview] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [recordingTarget, setRecordingTarget] = useState<string | null>(null);
  const [transcribingTarget, setTranscribingTarget] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<FeatureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>("record");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (interviewDone && !hasFeatureEdits && previewFeatures.length > 0) {
      setEditableFeatures(previewFeatures);
    }
  }, [interviewDone, hasFeatureEdits, previewFeatures]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.stop();
    }
  }, []);

  const startAudioRecording = useCallback(
    async (target: string, onText: (value: string) => void) => {
      setError(null);
      if (recordingTarget) {
        stopRecording();
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        recorderRef.current = recorder;
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };
        recorder.onstop = async () => {
          setRecordingTarget(null);
          setTranscribingTarget(target);
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          chunksRef.current = [];
          try {
            const formData = new FormData();
            formData.append("file", blob, "interview.webm");
            const response = await fetch("/api/transcribe", {
              method: "POST",
              body: formData
            });
            if (!response.ok) {
              throw new Error("Transcription failed.");
            }
            const data = await response.json();
            onText(extractTranscript(data));
          } catch (err) {
            setError(err instanceof Error ? err.message : "Transcription error.");
          } finally {
            setTranscribingTarget(null);
            streamRef.current?.getTracks().forEach((track) => track.stop());
          }
        };
        recorder.start();
        setRecordingTarget(target);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to access microphone.");
      }
    },
    [recordingTarget, stopRecording]
  );

  const requestNextQuestion = useCallback(
    async (history: InterviewTurn[], overrideBrief?: string) => {
      const activeBrief = normalizeText(
        typeof overrideBrief === "string" ? overrideBrief : brief
      ).trim();
      if (!activeBrief) {
        setCurrentQuestion(null);
        return;
      }
      setLoadingInterview(true);
      try {
        const response = await fetch("/api/interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brief: activeBrief, history })
        });
        if (!response.ok) {
          throw new Error("Interview request failed.");
        }
        const data = await response.json();
        setCurrentQuestion(data.message || null);
        setInterviewDone(Boolean(data.done));
        setInterviewSummary(Array.isArray(data.summary) ? data.summary : null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Interview error.");
      } finally {
        setLoadingInterview(false);
      }
    },
    [brief]
  );

  const refreshPreview = useCallback(
    async (history: InterviewTurn[], overrideBrief?: string) => {
      const activeBrief = normalizeText(
        typeof overrideBrief === "string" ? overrideBrief : brief
      ).trim();
      if (!activeBrief) {
        return;
      }
      setLoadingPreview(true);
      try {
        const response = await fetch("/api/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brief: activeBrief, interview: history })
        });
        if (!response.ok) {
          throw new Error("Preview failed.");
        }
        const data = await response.json();
        const nextFeatures = Array.isArray(data.features) ? data.features : [];
        const nextStories = Array.isArray(data.userStories) ? data.userStories : [];
        setPreviewFeatures(nextFeatures);
        setPreviewStories(nextStories);
        if (!hasFeatureEdits) {
          setEditableFeatures(nextFeatures);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Preview error.");
      } finally {
        setLoadingPreview(false);
      }
    },
    [brief, hasFeatureEdits]
  );

  const handleStartInterview = async (overrideBrief?: string) => {
    const resolvedBrief = typeof overrideBrief === "string" ? overrideBrief : brief;
    const nextBrief = normalizeText(resolvedBrief).trim();
    if (!nextBrief) {
      setError("Add a short brief to begin.");
      return;
    }
    if (overrideBrief && overrideBrief !== brief) {
      setBrief(overrideBrief);
    }
    setError(null);
    setResult(null);
    setInterviewStarted(true);
    setInterviewHistory([]);
    setInterviewSummary(null);
    setInterviewDone(false);
    await requestNextQuestion([], nextBrief);
  };

  const handleSendAnswer = async (overrideAnswer?: string) => {
    if (!currentQuestion) {
      return;
    }
    const resolvedAnswer = typeof overrideAnswer === "string" ? overrideAnswer : answerDraft;
    const nextAnswer = normalizeText(resolvedAnswer).trim();
    if (!nextAnswer) {
      setError("Add a response before sending.");
      return;
    }
    setError(null);
    const nextHistory = [...interviewHistory, { question: currentQuestion, answer: nextAnswer }];
    setInterviewHistory(nextHistory);
    setAnswerDraft("");
    await Promise.all([
      refreshPreview(nextHistory),
      requestNextQuestion(nextHistory)
    ]);
  };

  const handleStopInterview = () => {
    setInterviewDone(true);
    setCurrentQuestion(null);
    setError(null);
  };

  const handleRestartInterview = async () => {
    setError(null);
    setResult(null);
    setInterviewStarted(false);
    setInterviewHistory([]);
    setInterviewSummary(null);
    setInterviewDone(false);
    setCurrentQuestion(null);
  };

  const updateFeatureField = (index: number, field: "name" | "summary", value: string) => {
    setEditableFeatures((prev) => {
      const base = prev.length > 0 ? [...prev] : [...previewFeatures];
      const current = base[index] || { name: "", summary: "", userStoryIds: [] };
      base[index] = { ...current, [field]: value };
      return base;
    });
    setHasFeatureEdits(true);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const payload = {
        brief,
        interview: interviewHistory,
        interviewSummary,
        featureOverrides: hasFeatureEdits ? editableFeatures : undefined
      };
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error("Generation failed.");
      }
      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation error.");
    } finally {
      setGenerating(false);
    }
  };

  const downloadFile = (content: string, filename: string, type = "text/plain") => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const displayFeatures = interviewDone && editableFeatures.length > 0 ? editableFeatures : previewFeatures;
  const storyLookup = previewStories.reduce<Record<string, FeatureResult["userStories"][0]>>(
    (acc, story) => {
      acc[story.id] = story;
      return acc;
    },
    {}
  );
  const interviewInProgress = interviewStarted && !interviewDone;
  const hasFirstAnswer = interviewHistory.length > 0;
  const startButtonLabel = interviewStarted ? "Restart Interview" : "Start Interview";
  const allowRecording = inputMode === "record";
  const allowTyping = inputMode === "type";

  return (
    <main>
      <div className={`workspace${hasFirstAnswer ? " split" : ""}`}>
        <div className="workspace-left">
          <div className="content-scroll-area">
            <section className="section compact brief-section" id="brief">
              <div className="container narrow">
                {!interviewStarted ? (
                  <>
                    <div className="simple-header">
                      <div className="mono">BriefKit</div>
                      <h1 className="hero-title">Say what you want to build.</h1>
                    </div>
                    <div className="rule-row compact">
                      <div className="rule" />
                      <a
                        className="repo-link mono"
                        href="https://github.com/moeghashim/BriefKit"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Repo
                      </a>
                    </div>
                    {error && <p className="muted">{error}</p>}
                  </>
                ) : (
                  <>
                    <div className="simple-header">
                      <div className="mono">Current Question</div>
                      <h1 className="hero-title question-title">
                        {currentQuestion || "Preparing the first question..."}
                      </h1>
                    </div>
                    <div className="rule-row compact">
                      <div className="rule" />
                      <a
                        className="repo-link mono"
                        href="https://github.com/moeghashim/BriefKit"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Repo
                      </a>
                    </div>
                    
                    {interviewHistory.length > 0 && (
                      <details className="history-toggle">
                        <summary className="mono">Show previous answers</summary>
                        <div className="history-block">
                          {interviewHistory.map((turn, index) => (
                            <div key={`${turn.question}-${index}`} className="history-item">
                              <div className="mono">Q{index + 1}</div>
                              <p>{turn.question}</p>
                              <div className="mono">A{index + 1}</div>
                              <p>{turn.answer}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {interviewSummary && interviewSummary.length > 0 && (
                      <div className="card" style={{ marginTop: "2rem" }}>
                        <div className="mono">Summary</div>
                        <ul>
                          {interviewSummary.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {error && <p className="muted">{error}</p>}
                  </>
                )}
              </div>
            </section>
          </div>

          <div className="fixed-input-area">
            <div className="container narrow" style={{ padding: "1.5rem" }}>
              {!interviewDone ? (
                <div className="chat-box" style={{ border: "none", padding: 0, background: "transparent" }}>
                  <div className="mode-toggle" role="group" aria-label="Input mode">
                    {INPUT_MODES.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        className={`mode-button${inputMode === mode.id ? " active" : ""}`}
                        onClick={() => setInputMode(mode.id)}
                        aria-pressed={inputMode === mode.id}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                  
                  {!interviewStarted ? (
                    <>
                      <textarea
                        value={brief}
                        onChange={(e) => setBrief(e.target.value)}
                        placeholder={
                          inputMode === "record"
                            ? "Recording mode: use the mic to capture your brief."
                            : "Describe the product or feature. Keep it short."
                        }
                        readOnly={!allowTyping}
                      />
                      <div className="button-row">
                        {allowRecording && (
                          <button
                            className="mic-button"
                            aria-label={recordingTarget === "brief" ? "Stop recording" : "Record brief"}
                            onClick={() =>
                              recordingTarget === "brief"
                                ? stopRecording()
                                : startAudioRecording("brief", (value) => setBrief(normalizeText(value)))
                            }
                            disabled={transcribingTarget === "brief"}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12 2.5a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0V6A3.5 3.5 0 0 0 12 2.5Z" />
                              <path d="M5 11.5v.5a7 7 0 1 0 14 0v-.5" />
                              <path d="M12 19.5v2" />
                              <path d="M8.5 21.5h7" />
                            </svg>
                          </button>
                        )}
                        {transcribingTarget === "brief" && <span className="mono">Transcribing...</span>}
                        <button className="primary" onClick={() => handleStartInterview()} disabled={loadingInterview}>
                          {loadingInterview ? "Starting..." : startButtonLabel}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <textarea
                        value={answerDraft}
                        onChange={(e) => setAnswerDraft(e.target.value)}
                        placeholder={
                          inputMode === "record"
                            ? "Recording mode: use the mic to capture your answer."
                            : "Answer the current question."
                        }
                        readOnly={!allowTyping}
                      />
                      <div className="button-row">
                        {allowRecording && (
                          <button
                            className="mic-button"
                            aria-label={recordingTarget === "answer" ? "Stop recording answer" : "Record answer"}
                            onClick={() =>
                              recordingTarget === "answer"
                                ? stopRecording()
                                : startAudioRecording("answer", (value) => {
                                    setAnswerDraft(normalizeText(value));
                                  })
                            }
                            disabled={transcribingTarget === "answer"}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12 2.5a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0V6A3.5 3.5 0 0 0 12 2.5Z" />
                              <path d="M5 11.5v.5a7 7 0 1 0 14 0v-.5" />
                              <path d="M12 19.5v2" />
                              <path d="M8.5 21.5h7" />
                            </svg>
                          </button>
                        )}
                        {transcribingTarget === "answer" && <span className="mono">Transcribing...</span>}
                        <button className="primary" onClick={() => handleSendAnswer()} disabled={loadingInterview}>
                          {loadingInterview ? "Waiting..." : "Send Answer"}
                        </button>
                        <button className="secondary" onClick={handleStopInterview} disabled={loadingInterview}>
                          Finish Interview
                        </button>
                        <button className="ghost" onClick={handleRestartInterview} disabled={loadingInterview}>
                          Restart
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="card">
                  <div className="mono">Interview Complete</div>
                  <p>Generate the PRD and exports when you are ready.</p>
                  <div className="button-row">
                     <button className="primary" onClick={handleGenerate} disabled={generating || loadingInterview}>
                      {generating ? "Generating..." : "Generate PRD"}
                    </button>
                    <button className="secondary" onClick={handleRestartInterview} disabled={loadingInterview}>
                      Restart Interview
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="workspace-right">
          <section className="section">
            <div className="container">
              <h2>Feature Table</h2>
              <p className="muted">
                Features and user stories update as the interview progresses.
                {loadingPreview ? " Updating..." : ""}
              </p>
              {loadingPreview && (
                <div className="loading-indicator" aria-live="polite">
                  <span className="mono">Finalizing table</span>
                  <span className="loading-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              )}
              {displayFeatures.length > 0 ? (
                displayFeatures.map((feature, index) => (
                  <div key={`${feature.name}-${index}`} className="feature-block">
                    {interviewDone ? (
                      <div className="feature-edit">
                        <label className="mono">Feature Name</label>
                        <div className="edit-control">
                          <input
                            value={feature.name}
                            onChange={(e) => updateFeatureField(index, "name", e.target.value)}
                          />
                          <button
                            className="mic-button small"
                            aria-label="Record feature name"
                            onClick={() =>
                              recordingTarget === `feature-name-${index}`
                                ? stopRecording()
                                : startAudioRecording(`feature-name-${index}`, (value) =>
                                    updateFeatureField(index, "name", value)
                                  )
                            }
                            disabled={transcribingTarget === `feature-name-${index}`}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12 2.5a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0V6A3.5 3.5 0 0 0 12 2.5Z" />
                              <path d="M5 11.5v.5a7 7 0 1 0 14 0v-.5" />
                              <path d="M12 19.5v2" />
                              <path d="M8.5 21.5h7" />
                            </svg>
                          </button>
                        </div>
                        <label className="mono">Summary</label>
                        <div className="edit-control">
                          <textarea
                            value={feature.summary}
                            onChange={(e) => updateFeatureField(index, "summary", e.target.value)}
                          />
                          <button
                            className="mic-button small"
                            aria-label="Record feature summary"
                            onClick={() =>
                              recordingTarget === `feature-summary-${index}`
                                ? stopRecording()
                                : startAudioRecording(`feature-summary-${index}`, (value) =>
                                    updateFeatureField(index, "summary", value)
                                  )
                            }
                            disabled={transcribingTarget === `feature-summary-${index}`}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12 2.5a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0V6A3.5 3.5 0 0 0 12 2.5Z" />
                              <path d="M5 11.5v.5a7 7 0 1 0 14 0v-.5" />
                              <path d="M12 19.5v2" />
                              <path d="M8.5 21.5h7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="feature-title">{feature.name}</div>
                        <p className="feature-summary">{feature.summary}</p>
                      </>
                    )}
                    <table className="feature-table">
                      <thead>
                        <tr>
                          <th>Story</th>
                          <th>Description</th>
                          <th>Acceptance Criteria</th>
                        </tr>
                      </thead>
                      <tbody>
                        {feature.userStoryIds.map((storyId) => {
                          const story = storyLookup?.[storyId];
                          if (!story) return null;
                          return (
                            <tr key={story.id}>
                              <td>
                                {story.id}: {story.title}
                              </td>
                              <td>{story.description}</td>
                              <td>
                                <ul>
                                  {story.acceptanceCriteria.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))
              ) : (
                <div className="card">
                  <div className="mono">Waiting for interview input</div>
                  <p>Answer a few questions to see features and stories appear here.</p>
                </div>
              )}
            </div>
          </section>

          <section className="section">
            <div className="container">
              <h2>Exports</h2>
              {result ? (
                <div className="download-row">
                  <button
                    className="primary"
                    onClick={() => downloadFile(result.prdMarkdown, "prd.md")}
                  >
                    Download PRD
                  </button>
                  <button
                    className="secondary"
                    onClick={() =>
                      downloadFile(JSON.stringify(result.prdJson, null, 2), "prd.json", "application/json")
                    }
                  >
                    Download JSON
                  </button>
                </div>
              ) : (
                <div className="card">
                  <div className="mono">Not ready yet</div>
                  <p>Complete the interview to generate exports.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
