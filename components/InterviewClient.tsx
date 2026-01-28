"use client";

import { Fragment, useCallback, useMemo, useRef, useState } from "react";

type InterviewTurn = {
  question: string;
  answer: string;
};

type FeatureResult = {
  project: string;
  featureName: string;
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
const kebabCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

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
  const [featureMessageDrafts, setFeatureMessageDrafts] = useState<Record<number, string>>({});
  const [featureMessages, setFeatureMessages] = useState<Record<number, string[]>>({});
  const [storyMessageDrafts, setStoryMessageDrafts] = useState<Record<string, string>>({});
  const [storyMessages, setStoryMessages] = useState<Record<string, string[]>>({});
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

  const storyLookup = useMemo(() => {
    return previewStories.reduce<Record<string, FeatureResult["userStories"][0]>>(
      (acc, story) => {
        acc[story.id] = story;
        return acc;
      },
      {}
    );
  }, [previewStories]);

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

  const buildFeedback = useCallback(
    (
      featureMessagesArg: Record<number, string[]> = featureMessages,
      storyMessagesArg: Record<string, string[]> = storyMessages
    ) => {
      const feedback: string[] = [];
      const featureSource = previewFeatures;

      Object.entries(featureMessagesArg).forEach(([index, messages]) => {
        if (!Array.isArray(messages) || messages.length === 0) return;
        const idx = Number(index);
        const feature = featureSource[idx];
        const label = feature?.name ? `Feature "${feature.name}"` : `Feature ${idx + 1}`;
        messages.forEach((message) => {
          const trimmed = normalizeText(message).trim();
          if (trimmed) {
            feedback.push(`${label}: ${trimmed}`);
          }
        });
      });

      Object.entries(storyMessagesArg).forEach(([storyId, messages]) => {
        if (!Array.isArray(messages) || messages.length === 0) return;
        const story = storyLookup[storyId];
        const label = story ? `Story ${story.id}: ${story.title}` : `Story ${storyId}`;
        messages.forEach((message) => {
          const trimmed = normalizeText(message).trim();
          if (trimmed) {
            feedback.push(`${label}: ${trimmed}`);
          }
        });
      });

      return feedback;
    },
    [
      featureMessages,
      previewFeatures,
      storyLookup,
      storyMessages
    ]
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
    async (history: InterviewTurn[], overrideBrief?: string, feedbackOverride?: string[]) => {
      const activeBrief = normalizeText(
        typeof overrideBrief === "string" ? overrideBrief : brief
      ).trim();
      if (!activeBrief) {
        return;
      }
      const feedback = Array.isArray(feedbackOverride) ? feedbackOverride : buildFeedback();
      setLoadingPreview(true);
      try {
        const response = await fetch("/api/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brief: activeBrief, interview: history, feedback })
        });
        if (!response.ok) {
          throw new Error("Preview failed.");
        }
        const data = await response.json();
        const nextFeatures = Array.isArray(data.features) ? data.features : [];
        const nextStories = Array.isArray(data.userStories) ? data.userStories : [];
        setPreviewFeatures(nextFeatures);
        setPreviewStories(nextStories);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Preview error.");
      } finally {
        setLoadingPreview(false);
      }
    },
    [brief, buildFeedback]
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
    setFeatureMessageDrafts({});
    setFeatureMessages({});
    setStoryMessageDrafts({});
    setStoryMessages({});
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
    setFeatureMessageDrafts({});
    setFeatureMessages({});
    setStoryMessageDrafts({});
    setStoryMessages({});
  };

  const sendFeatureMessage = async (index: number) => {
    const nextMessage = normalizeText(featureMessageDrafts[index]).trim();
    if (!nextMessage) {
      return;
    }
    const nextFeatureMessages = {
      ...featureMessages,
      [index]: [...(featureMessages[index] || []), nextMessage]
    };
    setFeatureMessages(nextFeatureMessages);
    setFeatureMessageDrafts((prev) => ({ ...prev, [index]: "" }));
    await refreshPreview(interviewHistory, undefined, buildFeedback(nextFeatureMessages, storyMessages));
  };

  const sendStoryMessage = async (storyId: string) => {
    const nextMessage = normalizeText(storyMessageDrafts[storyId]).trim();
    if (!nextMessage) {
      return;
    }
    const nextStoryMessages = {
      ...storyMessages,
      [storyId]: [...(storyMessages[storyId] || []), nextMessage]
    };
    setStoryMessages(nextStoryMessages);
    setStoryMessageDrafts((prev) => ({ ...prev, [storyId]: "" }));
    await refreshPreview(interviewHistory, undefined, buildFeedback(featureMessages, nextStoryMessages));
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const feedback = buildFeedback();
      const payload = {
        brief,
        interview: interviewHistory,
        interviewSummary,
        feedback: feedback.length > 0 ? feedback : undefined
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

  const displayFeatures = previewFeatures;
  const interviewInProgress = interviewStarted && !interviewDone;
  const hasFirstAnswer = interviewHistory.length > 0;
  const currentQuestionNumber = interviewHistory.length + 1;
  const showQuestionNumber = interviewInProgress && currentQuestionNumber > 1;
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
                      <div className="mono">
                        {showQuestionNumber ? `Question ${currentQuestionNumber}` : "Current Question"}
                      </div>
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
                      {allowRecording ? (
                        <div className="record-panel">
                          <button
                            className={`mic-button hero${allowRecording ? "" : " disabled"}`}
                            aria-label={recordingTarget === "brief" ? "Stop recording" : "Record brief"}
                            onClick={() =>
                              recordingTarget === "brief"
                                ? stopRecording()
                                : startAudioRecording("brief", (value) => setBrief(normalizeText(value)))
                            }
                            disabled={!allowRecording || transcribingTarget === "brief"}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12 2.5a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0V6A3.5 3.5 0 0 0 12 2.5Z" />
                              <path d="M5 11.5v.5a7 7 0 1 0 14 0v-.5" />
                              <path d="M12 19.5v2" />
                              <path d="M8.5 21.5h7" />
                            </svg>
                          </button>
                          <div className="record-panel-text mono">
                            {recordingTarget === "brief" ? "Recording..." : "Tap to record your brief"}
                          </div>
                          {transcribingTarget === "brief" && <span className="mono">Transcribing...</span>}
                        </div>
                      ) : (
                        <textarea
                          value={brief}
                          onChange={(e) => setBrief(e.target.value)}
                          placeholder="Describe the product or feature. Keep it short."
                          readOnly={!allowTyping}
                        />
                      )}
                      <div className="button-row">
                        <button className="primary" onClick={() => handleStartInterview()} disabled={loadingInterview}>
                          {loadingInterview ? "Starting..." : startButtonLabel}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {allowRecording ? (
                        <div className="record-panel">
                          <button
                            className={`mic-button hero${allowRecording ? "" : " disabled"}`}
                            aria-label={recordingTarget === "answer" ? "Stop recording answer" : "Record answer"}
                            onClick={() =>
                              recordingTarget === "answer"
                                ? stopRecording()
                                : startAudioRecording("answer", (value) => {
                                    setAnswerDraft(normalizeText(value));
                                  })
                            }
                            disabled={!allowRecording || transcribingTarget === "answer"}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12 2.5a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0V6A3.5 3.5 0 0 0 12 2.5Z" />
                              <path d="M5 11.5v.5a7 7 0 1 0 14 0v-.5" />
                              <path d="M12 19.5v2" />
                              <path d="M8.5 21.5h7" />
                            </svg>
                          </button>
                          <div className="record-panel-text mono">
                            {recordingTarget === "answer" ? "Recording..." : "Tap to record your answer"}
                          </div>
                          {transcribingTarget === "answer" && <span className="mono">Transcribing...</span>}
                        </div>
                      ) : (
                        <textarea
                          value={answerDraft}
                          onChange={(e) => setAnswerDraft(e.target.value)}
                          placeholder="Answer the current question."
                          readOnly={!allowTyping}
                        />
                      )}
                      <div className="button-row">
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

        <div className={`workspace-right${loadingPreview ? " is-loading" : ""}`}>
          {loadingPreview && (
            <div className="right-loading-overlay" aria-live="polite">
              <div className="right-loading-content">
                <svg className="cooking-icon" viewBox="0 0 64 64" aria-hidden="true">
                  <path
                    d="M22 18c0-4 3-7 7-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M32 16c0-4 3-7 7-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M42 18c0-4 3-7 7-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <rect
                    x="14"
                    y="28"
                    width="36"
                    height="20"
                    rx="4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M20 28l4-8h16l4 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 34h-4m50 0h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M24 24h16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="mono">Cooking up your feature table...</div>
              </div>
            </div>
          )}
          <section className="section">
            <div className="container">
              <h2 className="section-title feature-table-title">Feature Table</h2>
              <p className="muted">
                Features and user stories update as the interview progresses.
              </p>
              {displayFeatures.length > 0 ? (
                displayFeatures.map((feature, index) => (
                  <details
                    key={`${feature.name}-${index}`}
                    className="feature-block"
                    open={index === 0}
                  >
                    <summary className="feature-summary-row">
                      <div className="feature-summary-header">
                        <span className="feature-label mono">Feature {index + 1}</span>
                        <span className="feature-name">{feature.name || `Feature ${index + 1}`}</span>
                      </div>
                      {feature.summary && <p className="feature-short">{feature.summary}</p>}
                    </summary>
                    <div className="feature-content">
                      {interviewDone && (
                        <div className="message-panel">
                          <div className="mono">Message about this feature</div>
                          <div className="edit-control">
                            <textarea
                              value={featureMessageDrafts[index] || ""}
                              onChange={(e) =>
                                setFeatureMessageDrafts((prev) => ({
                                  ...prev,
                                  [index]: e.target.value
                                }))
                              }
                              placeholder={
                                inputMode === "record"
                                  ? "Recording mode: use the mic to capture a feature note."
                                  : "Type a note about this feature."
                              }
                              readOnly={!allowTyping}
                            />
                            <button
                              className={`mic-button small${allowRecording ? "" : " disabled"}`}
                              aria-label="Record feature message"
                              onClick={() =>
                                recordingTarget === `feature-message-${index}`
                                  ? stopRecording()
                                  : startAudioRecording(`feature-message-${index}`, (value) =>
                                      setFeatureMessageDrafts((prev) => ({
                                        ...prev,
                                        [index]: normalizeText(value)
                                      }))
                                    )
                              }
                              disabled={!allowRecording || transcribingTarget === `feature-message-${index}`}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 2.5a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0V6A3.5 3.5 0 0 0 12 2.5Z" />
                                <path d="M5 11.5v.5a7 7 0 1 0 14 0v-.5" />
                                <path d="M12 19.5v2" />
                                <path d="M8.5 21.5h7" />
                              </svg>
                            </button>
                          </div>
                          <div className="message-actions">
                            <button
                              className="secondary"
                              onClick={() => sendFeatureMessage(index)}
                              disabled={loadingPreview}
                            >
                              Send Message
                            </button>
                            {transcribingTarget === `feature-message-${index}` && (
                              <span className="mono">Transcribing...</span>
                            )}
                          </div>
                          {featureMessages[index] && featureMessages[index].length > 0 && (
                            <ul className="message-list">
                              {featureMessages[index].map((message, messageIndex) => (
                                <li key={`${index}-feature-message-${messageIndex}`}>{message}</li>
                              ))}
                            </ul>
                          )}
                        </div>
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
                            <Fragment key={story.id}>
                              <tr>
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
                              <tr className="story-message-row">
                                <td colSpan={3}>
                                  {interviewDone && (
                                    <div className="message-panel story-message">
                                      <div className="mono">Message about {story.id}</div>
                                      <div className="edit-control">
                                        <textarea
                                          value={storyMessageDrafts[story.id] || ""}
                                          onChange={(e) =>
                                            setStoryMessageDrafts((prev) => ({
                                              ...prev,
                                              [story.id]: e.target.value
                                            }))
                                          }
                                          placeholder={
                                            inputMode === "record"
                                              ? "Recording mode: use the mic to capture a story note."
                                              : "Type a note about this story."
                                          }
                                          readOnly={!allowTyping}
                                        />
                                        <button
                                          className={`mic-button small${allowRecording ? "" : " disabled"}`}
                                          aria-label={`Record message for ${story.id}`}
                                          onClick={() =>
                                            recordingTarget === `story-message-${story.id}`
                                              ? stopRecording()
                                              : startAudioRecording(`story-message-${story.id}`, (value) =>
                                                  setStoryMessageDrafts((prev) => ({
                                                    ...prev,
                                                    [story.id]: normalizeText(value)
                                                  }))
                                                )
                                          }
                                          disabled={!allowRecording || transcribingTarget === `story-message-${story.id}`}
                                        >
                                          <svg viewBox="0 0 24 24" aria-hidden="true">
                                            <path d="M12 2.5a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0V6A3.5 3.5 0 0 0 12 2.5Z" />
                                            <path d="M5 11.5v.5a7 7 0 1 0 14 0v-.5" />
                                            <path d="M12 19.5v2" />
                                            <path d="M8.5 21.5h7" />
                                          </svg>
                                        </button>
                                      </div>
                                      <div className="message-actions">
                                        <button
                                          className="secondary"
                                          onClick={() => sendStoryMessage(story.id)}
                                          disabled={loadingPreview}
                                        >
                                          Send Message
                                        </button>
                                        {transcribingTarget === `story-message-${story.id}` && (
                                          <span className="mono">Transcribing...</span>
                                        )}
                                      </div>
                                      {storyMessages[story.id] && storyMessages[story.id].length > 0 && (
                                        <ul className="message-list">
                                          {storyMessages[story.id].map((message, messageIndex) => (
                                            <li key={`${story.id}-story-message-${messageIndex}`}>
                                              {message}
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </details>
                ))
              ) : (
                <div className="card">
                  <div className="mono">Waiting for interview input</div>
                  <p>Answer a few questions to see features and stories appear here.</p>
                </div>
              )}
            </div>
          </section>

          {result && (
            <section className="section">
              <div className="container">
                <h2 className="section-title">Exports</h2>
                <div className="download-row">
                  <button
                    className="primary"
                    onClick={() => {
                      const filename = result.featureName
                        ? `prd-${kebabCase(result.featureName)}.md`
                        : "prd.md";
                      downloadFile(result.prdMarkdown, filename);
                    }}
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
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
