"use client";

import { Fragment, useCallback, useMemo, useState } from "react";

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
  promptMarkdown: string;
};

const normalizeText = (value: unknown) => (typeof value === "string" ? value : "");
const kebabCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

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
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<FeatureResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const storyLookup = useMemo(() => {
    return previewStories.reduce<Record<string, FeatureResult["userStories"][0]>>(
      (acc, story) => {
        acc[story.id] = story;
        return acc;
      },
      {}
    );
  }, [previewStories]);

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
  const currentQuestionNumber = interviewHistory.length + 1;
  const showQuestionNumber = interviewInProgress && currentQuestionNumber > 1;
  const startButtonLabel = interviewStarted ? "Restart Interview" : "Start Interview";

  return (
    <main className="dt-page">
      <section className="dt-hero" aria-label="Hero">
        <div className="container dt-hero-grid">
          <div className="dt-hero-left dt-animate-up">
            <div className="dt-version">
              <span className="dt-version-tag">v2.0 RELEASED</span>
            </div>
            <h1 className="dt-hero-title">PRDs, but with DevTools energy.</h1>
            <p className="dt-hero-sub">
              Write a brief, answer a few questions, export `prd.md`, `prd.json`, and `prompt.md`.
              <span className="dt-cursor" aria-hidden="true" />
            </p>
            <div className="dt-hero-actions">
              <a className="dt-btn dt-btn-primary" href="#workspace">
                <span className="dt-btn-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path
                      d="M12 4l7 4v8l-7 4-7-4V8l7-4Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M9.5 12h5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                Open Workspace
              </a>
              <a className="dt-btn" href="#readme">
                Read the manifesto
              </a>
            </div>
          </div>

          <div className="dt-hero-right dt-animate-up" aria-label="Demo window">
            <div className="dt-window">
              <div className="dt-window-bar">
                <div className="dt-window-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="dt-window-title mono">preview.html</div>
                <div className="dt-window-spacer" />
              </div>
              <div className="dt-window-body">
                <div className="dt-demo-cards" aria-hidden="true">
                  <div className="dt-demo-card">Card A</div>
                  <div className="dt-demo-card">Card B</div>
                  <div className="dt-demo-card">Card C</div>
                </div>
                <div className="dt-demo-cursor" aria-hidden="true" />
                <div className="dt-demo-tooltip" aria-hidden="true">
                  <div className="mono">.selection-ring</div>
                  <div className="dt-tooltip-props">
                    <div>
                      <span className="dt-prop">outline</span>: <span className="dt-val">2px solid</span>{" "}
                      <span className="dt-val cyan">#06B6D4</span>;
                    </div>
                    <div>
                      <span className="dt-prop">box-shadow</span>: <span className="dt-val">0 0 0 4px</span>{" "}
                      <span className="dt-val cyan">rgba(6,182,212,0.18)</span>;
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="dt-release" aria-label="Release notes">
        <div className="container dt-release-grid">
          <div className="dt-release-left">
            <div className="dt-label">CHANGELOG</div>
          </div>
          <div className="dt-release-right">
            <div className="dt-mono-list mono">
              <div>
                <span className="dt-plus">+</span> live preview while interviewing
              </div>
              <div>
                <span className="dt-plus">+</span> export `prd.md`, `prd.json`, `prompt.md`
              </div>
              <div>
                <span className="dt-plus">+</span> feedback messages per feature and story
              </div>
              <div>
                <span className="dt-plus">+</span> keyboard-first flow: Ctrl/Cmd+Enter to submit
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="dt-workspace" id="workspace" aria-label="Interactive workspace">
        <div className="container">
          <div className="dt-ide">
            <aside className="dt-ide-left" aria-label="Explorer">
              <div className="dt-ide-left-header mono">Explorer</div>
              <div className="dt-ide-nav">
                <a className="dt-ide-item" href="#workspace">
                  <span className="dt-ide-icon" aria-hidden="true" />
                  Workspace
                </a>
                <a className="dt-ide-item" href="#preview">
                  <span className="dt-ide-icon" aria-hidden="true" />
                  Preview
                </a>
                <a className="dt-ide-item" href="#exports">
                  <span className="dt-ide-icon" aria-hidden="true" />
                  Exports
                </a>
                <a className="dt-ide-item" href="#faq">
                  <span className="dt-ide-icon" aria-hidden="true" />
                  FAQ
                </a>
              </div>

              <div className="dt-shortcuts">
                <div className="dt-shortcuts-title mono">Shortcuts</div>
                <div className="dt-shortcut-row">
                  <span className="dt-kbd mono">Ctrl</span>
                  <span className="dt-kbd mono">Enter</span>
                  <span className="dt-shortcut-desc">Submit</span>
                </div>
                <div className="dt-shortcut-row">
                  <span className="dt-kbd mono">Esc</span>
                  <span className="dt-shortcut-desc">Finish</span>
                </div>
              </div>
            </aside>

            <section className="dt-ide-center" aria-label="Canvas">
              <div className="dt-canvas">
                <div className="dt-dim-label mono" aria-hidden="true">
                  1200x400
                </div>
                <div className="dt-focus selection-ring dt-animate-up">
                  <div className="dt-panel-head">
                    <div className="dt-panel-title">
                      {!interviewStarted ? "Brief" : interviewDone ? "Interview complete" : `Question ${currentQuestionNumber}`}
                    </div>
                    <div className="dt-panel-meta mono">
                      {interviewStarted ? `${interviewHistory.length} answered` : "start here"}
                    </div>
                  </div>

                  {error && <div className="dt-alert mono">{error}</div>}

                  {!interviewStarted ? (
                    <>
                      <textarea
                        value={brief}
                        onChange={(e) => setBrief(e.target.value)}
                        placeholder="Describe what you want to build..."
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                            e.preventDefault();
                            handleStartInterview();
                          }
                        }}
                      />
                      <div className="dt-actions">
                        <button className="primary" onClick={() => handleStartInterview()} disabled={loadingInterview}>
                          {loadingInterview ? "Starting..." : startButtonLabel}
                        </button>
                      </div>
                    </>
                  ) : interviewDone ? (
                    <>
                      <div className="dt-inline">
                        Generate exports when you are ready.
                      </div>
                      <div className="dt-actions">
                        <button className="primary" onClick={handleGenerate} disabled={generating || loadingInterview}>
                          {generating ? "Generating..." : "Generate PRD"}
                        </button>
                        <button className="secondary" onClick={handleRestartInterview} disabled={loadingInterview}>
                          Restart
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="dt-question">
                        {currentQuestion || "Preparing the first question..."}
                      </div>
                      <textarea
                        value={answerDraft}
                        onChange={(e) => setAnswerDraft(e.target.value)}
                        placeholder="Type your answer..."
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            handleStopInterview();
                          }
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                            e.preventDefault();
                            handleSendAnswer();
                          }
                        }}
                      />
                      <div className="dt-actions">
                        <button className="primary" onClick={() => handleSendAnswer()} disabled={loadingInterview}>
                          {loadingInterview ? "Waiting..." : "Send Answer"}
                        </button>
                        <button className="secondary" onClick={handleStopInterview} disabled={loadingInterview}>
                          Finish
                        </button>
                        <button className="ghost" onClick={handleRestartInterview} disabled={loadingInterview}>
                          Restart
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {interviewStarted && interviewHistory.length > 0 && (
                <details className="dt-history dt-animate-up">
                  <summary className="mono">History</summary>
                  <div className="dt-history-body">
                    {interviewHistory.map((turn, index) => (
                      <div key={`${turn.question}-${index}`} className="dt-history-item">
                        <div className="mono">Q{index + 1}</div>
                        <div className="dt-history-text">{turn.question}</div>
                        <div className="mono">A{index + 1}</div>
                        <div className="dt-history-text">{turn.answer}</div>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <div className="dt-panel dt-animate-up" id="preview" aria-label="Preview">
                <div className="dt-panel-head">
                  <div className="dt-panel-title">Preview</div>
                  <div className="dt-panel-meta mono">
                    {previewFeatures.length} features · {previewStories.length} stories
                  </div>
                </div>

                {loadingPreview && (
                  <div className="dt-overlay" aria-live="polite">
                    <div className="dt-overlay-inner mono">Updating preview...</div>
                  </div>
                )}

                {displayFeatures.length > 0 ? (
                  displayFeatures.map((feature, index) => (
                    <details key={`${feature.name}-${index}`} className="feature-block" open={index === 0}>
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
                                placeholder="Type a note about this feature."
                              />
                            </div>
                            <div className="message-actions">
                              <button className="secondary" onClick={() => sendFeatureMessage(index)} disabled={loadingPreview}>
                                Send Message
                              </button>
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
                                              placeholder="Type a note about this story."
                                            />
                                          </div>
                                          <div className="message-actions">
                                            <button
                                              className="secondary"
                                              onClick={() => sendStoryMessage(story.id)}
                                              disabled={loadingPreview}
                                            >
                                              Send Message
                                            </button>
                                          </div>
                                          {storyMessages[story.id] && storyMessages[story.id].length > 0 && (
                                            <ul className="message-list">
                                              {storyMessages[story.id].map((message, messageIndex) => (
                                                <li key={`${story.id}-story-message-${messageIndex}`}>{message}</li>
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
                  <div className="dt-empty mono">No preview yet. Answer a question to populate the table.</div>
                )}
              </div>
            </section>

            <aside className="dt-ide-right" aria-label="Inspector">
              <div className="dt-ide-right-header mono">Inspector</div>

              <div className="dt-inspector-section">
                <div className="dt-inspector-title mono">Status</div>
                <div className="dt-kv mono">
                  <div>
                    <span className="dt-k">interview.started</span> <span className="dt-v">{String(interviewStarted)}</span>
                  </div>
                  <div>
                    <span className="dt-k">interview.done</span> <span className="dt-v">{String(interviewDone)}</span>
                  </div>
                  <div>
                    <span className="dt-k">answers</span> <span className="dt-v">{interviewHistory.length}</span>
                  </div>
                  <div>
                    <span className="dt-k">features</span> <span className="dt-v">{previewFeatures.length}</span>
                  </div>
                </div>
              </div>

              <div className="dt-inspector-section">
                <div className="dt-inspector-title mono">Typography</div>
                <div className="dt-field">
                  <label className="dt-field-label mono">Font</label>
                  <select className="dt-select" defaultValue="Inter" aria-label="Font">
                    <option>Inter</option>
                    <option>System</option>
                  </select>
                </div>
                <div className="dt-field">
                  <label className="dt-field-label mono">Code</label>
                  <select className="dt-select" defaultValue="JetBrains Mono" aria-label="Code font">
                    <option>JetBrains Mono</option>
                    <option>Monospace</option>
                  </select>
                </div>
              </div>

              <div className="dt-inspector-section">
                <div className="dt-inspector-title mono">Colors</div>
                <div className="dt-color-row mono">
                  <span className="dt-swatch" style={{ background: "#06B6D4" }} aria-hidden="true" />
                  <span>#06B6D4</span>
                  <span className="dt-muted">accent</span>
                </div>
                <div className="dt-color-row mono">
                  <span className="dt-swatch" style={{ background: "#111827" }} aria-hidden="true" />
                  <span>#111827</span>
                  <span className="dt-muted">tooltip</span>
                </div>
              </div>

              <div className="dt-inspector-section" id="exports">
                <div className="dt-inspector-title mono">Exports</div>
                {result ? (
                  <div className="dt-inspector-actions">
                    <button
                      className="primary"
                      onClick={() => {
                        const filename = result.featureName ? `prd-${kebabCase(result.featureName)}.md` : "prd.md";
                        downloadFile(result.prdMarkdown, filename);
                      }}
                    >
                      Download PRD
                    </button>
                    <button
                      className="secondary"
                      onClick={() => downloadFile(JSON.stringify(result.prdJson, null, 2), "prd.json", "application/json")}
                    >
                      Download JSON
                    </button>
                    <button className="secondary" onClick={() => downloadFile(result.promptMarkdown, "prompt.md")}>
                      Download Prompt
                    </button>
                  </div>
                ) : (
                  <div className="dt-inline mono">
                    Generate after finishing the interview.
                    <div className="dt-inspector-actions" style={{ marginTop: "0.75rem" }}>
                      <button className="primary" onClick={handleGenerate} disabled={!interviewDone || generating || loadingInterview}>
                        {generating ? "Generating..." : "Generate PRD"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="dt-readme" id="readme" aria-label="Readme manifesto">
        <div className="container">
          <div className="dt-readme-shell dt-animate-up">
            <div className="dt-readme-bar">
              <div className="mono">README.md</div>
            </div>
            <div className="dt-readme-body">
              <div className="dt-md mono"># BriefKit</div>
              <div className="dt-md">A PRD generator that behaves like a tool, not a template.</div>
              <div className="dt-md mono"># Principles</div>
              <div className="dt-md">- Keep inputs small.</div>
              <div className="dt-md">- Prefer clarity over cleverness.</div>
              <div className="dt-md">- Export artifacts you can diff.</div>
              <div className="dt-md mono"># Install</div>
              <pre className="dt-readme-code">{`npm install\nnpm run dev`}</pre>
            </div>
          </div>
        </div>
      </section>

      <section className="dt-faq" id="faq" aria-label="Technical FAQ">
        <div className="container dt-faq-inner">
          <div className="dt-faq-head">
            <h2 className="dt-faq-title">Technical FAQ</h2>
            <div className="dt-faq-sub mono">documentation-heavy, keyboard-first</div>
          </div>
          <details className="dt-accordion">
            <summary>Where does my data go?</summary>
            <div className="dt-accordion-body">
              BriefKit sends your brief and answers to the app&apos;s API routes to generate questions, previews, and exports.
            </div>
          </details>
          <details className="dt-accordion">
            <summary>What shortcuts exist?</summary>
            <div className="dt-accordion-body">
              Use Ctrl/Cmd+Enter to submit. Use Esc to finish the interview.
            </div>
          </details>
          <details className="dt-accordion">
            <summary>Why are exports split into md/json/prompt?</summary>
            <div className="dt-accordion-body">
              Markdown is human-readable, JSON is machine-parseable, and the prompt is reusable for other workflows.
            </div>
          </details>
        </div>
      </section>
    </main>
  );
}
