"use client";

import { useCallback, useRef, useState } from "react";

const QUESTIONS = [
  {
    id: "problem",
    label: "What problem are you solving and why now?"
  },
  {
    id: "users",
    label: "Who is the primary user and what is their goal?"
  },
  {
    id: "outcomes",
    label: "What outcomes define success?"
  },
  {
    id: "scope",
    label: "What should this NOT do or include?"
  },
  {
    id: "constraints",
    label: "Any constraints, integrations, or risks to note?"
  }
];

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

export default function InterviewClient() {
  const [brief, setBrief] = useState("");
  const [briefSubmitted, setBriefSubmitted] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [featureName, setFeatureName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [description, setDescription] = useState("");
  const [answers, setAnswers] = useState<string[]>(Array(QUESTIONS.length).fill(""));
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);
  const [transcribingIndex, setTranscribingIndex] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<FeatureResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const updateAnswer = useCallback((index: number, value: string) => {
    setAnswers((prev) => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(async (index: number) => {
    setError(null);
    if (recordingIndex !== null) {
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
        setRecordingIndex(null);
        setTranscribingIndex(index);
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
          updateAnswer(index, data.text || "");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcription error.");
        } finally {
          setTranscribingIndex(null);
          streamRef.current?.getTracks().forEach((track) => track.stop());
        }
      };
      recorder.start();
      setRecordingIndex(index);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to access microphone.");
    }
  }, [recordingIndex, stopRecording, updateAnswer]);

  const startBriefRecording = useCallback(async () => {
    setError(null);
    if (recordingIndex !== null) {
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
        setRecordingIndex(null);
        setTranscribingIndex(-1);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        try {
          const formData = new FormData();
          formData.append("file", blob, "brief.webm");
          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: formData
          });
          if (!response.ok) {
            throw new Error("Transcription failed.");
          }
          const data = await response.json();
          setBrief(data.text || "");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcription error.");
        } finally {
          setTranscribingIndex(null);
          streamRef.current?.getTracks().forEach((track) => track.stop());
        }
      };
      recorder.start();
      setRecordingIndex(-1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to access microphone.");
    }
  }, [recordingIndex, stopRecording]);

  const handleStartInterview = () => {
    if (!brief.trim()) {
      setError("Add a short brief to begin.");
      return;
    }
    setError(null);
    setBriefSubmitted(true);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const payload = {
        projectName,
        featureName,
        branchName,
        description: description || brief,
        answers: QUESTIONS.map((question, index) => ({
          question: question.label,
          answer: answers[index]
        }))
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

  const storyLookup = result?.userStories?.reduce<Record<string, FeatureResult["userStories"][0]>>(
    (acc, story) => {
      acc[story.id] = story;
      return acc;
    },
    {}
  );
  const features = result?.features ?? [];

  return (
    <main>
      <section className="section grid" id="interview">
        <div className="container">
          <h2>Start with a Brief</h2>
          <p>
            <span className="dropcap">B</span>riefly describe the app or feature. Keep it short. We'll
            turn this into targeted questions, then generate the PRD.
          </p>
          <div className="chat-box">
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Example: Build a unified onboarding flow for new teams so they can connect tools, invite teammates, and reach first value in under 10 minutes."
            />
            <div className="button-row">
              <button
                className="secondary icon-button"
                onClick={() => (recordingIndex === -1 ? stopRecording() : startBriefRecording())}
                disabled={transcribingIndex === -1}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2.5a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0V6A3.5 3.5 0 0 0 12 2.5Z" />
                  <path d="M5 11.5v.5a7 7 0 1 0 14 0v-.5" />
                  <path d="M12 19.5v2" />
                  <path d="M8.5 21.5h7" />
                </svg>
                {recordingIndex === -1 ? "Stop Recording" : "Record Brief"}
              </button>
              {transcribingIndex === -1 && <span className="mono">Transcribing...</span>}
              <button className="primary" onClick={handleStartInterview}>
                Start Interview
              </button>
            </div>
          </div>
          {error && <p className="muted">{error}</p>}
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="hero">
            <div className="mono">BriefKit PRD Interviewer</div>
            <h1 className="hero-title">Describe the app. The interview begins.</h1>
            <div className="rule-row">
              <div className="rule" />
              <div className="square" />
              <div className="rule" />
            </div>
            <p className="hero-subtitle">
              Start with a short brief. We turn it into an interview, then generate a PRD and a story
              map that both humans and tools can execute.
            </p>
            <p className="hero-meta">Whisper transcription | PRD markdown | prd.json story map</p>
          </div>
        </div>
      </section>

      {briefSubmitted && (
        <>
          <section className="section">
            <div className="container">
              <h2>Interview Setup</h2>
              <p>
                Define the core project details. This helps the generator keep names and scope consistent.
              </p>
              <div className="grid-two">
                <div>
                  <label className="mono">Project Name</label>
                  <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Atlas" />
                </div>
                <div>
                  <label className="mono">Feature Name</label>
                  <input value={featureName} onChange={(e) => setFeatureName(e.target.value)} placeholder="Unified onboarding" />
                </div>
                <div>
                  <label className="mono">Branch Name</label>
                  <input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="feature/unified-onboarding" />
                </div>
                <div>
                  <label className="mono">One-sentence Description</label>
                  <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Reduce time-to-value by guiding new teams." />
                </div>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="container">
              <h2>Interview Questions</h2>
              <p className="muted">Answer in voice or text. Whisper transcribes and fills the response.</p>
              <div className="grid-two">
                {QUESTIONS.map((question, index) => {
                  const isRecording = recordingIndex === index;
                  const isTranscribing = transcribingIndex === index;
                  return (
                    <div key={question.id} className={`interview-step ${isRecording ? "active" : ""}`}>
                      <div className="mono">Question {index + 1}</div>
                      <h3>{question.label}</h3>
                      <textarea
                        value={answers[index]}
                        onChange={(e) => updateAnswer(index, e.target.value)}
                        placeholder="Type your answer or record audio below."
                      />
                      <div className="button-row">
                        <button
                          className="secondary"
                          onClick={() => (isRecording ? stopRecording() : startRecording(index))}
                          disabled={isTranscribing}
                        >
                          {isRecording ? "Stop Recording" : "Record Answer"}
                        </button>
                        {isTranscribing && <span className="mono">Transcribing...</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {error && <p className="muted">{error}</p>}
              <div className="button-row">
                <button className="primary" onClick={handleGenerate} disabled={generating}>
                  {generating ? "Generating..." : "Generate PRD"}
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      <section className="section invert">
        <div className="container">
          <div style={{ position: "relative", zIndex: 1 }}>
            <h2>Outputs Built for Teams + Tools</h2>
            <div className="grid-two">
              <div className="card invert">
                <div className="mono">Output 01</div>
                <h3>Editorial PRD</h3>
                <p>Markdown aligned to the PRD template for engineers, PMs, and stakeholders.</p>
              </div>
              <div className="card invert">
                <div className="mono">Output 02</div>
                <h3>Story Map JSON</h3>
                <p>Machine-readable user stories for Codex, Claude, Amp, or any automation flow.</p>
              </div>
              <div className="card invert">
                <div className="mono">Output 03</div>
                <h3>Feature Table</h3>
                <p>Every feature with its linked stories and acceptance criteria in one view.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Feature Table</h2>
          <p className="muted">Each feature appears with its linked stories and acceptance criteria.</p>
          {result ? (
            <>
              {features.length > 0 ? (
                features.map((feature) => (
                  <div key={feature.name} className="feature-block">
                    <div className="feature-title">{feature.name}</div>
                    <p className="feature-summary">{feature.summary}</p>
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
                              <td>{story.id}: {story.title}</td>
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
                  <div className="mono">No features returned</div>
                  <p>Regenerate the PRD or refine your interview answers.</p>
                </div>
              )}
              <blockquote>\"Define the intent. Align the work. Let the PRD carry the rest.\"</blockquote>
              <div className="download-row">
                <button
                  className="primary"
                  onClick={() => downloadFile(result.prdMarkdown, `prd-${featureName || "feature"}.md`)}
                >
                  Download PRD
                </button>
                <button
                  className="secondary"
                  onClick={() => downloadFile(JSON.stringify(result.prdJson, null, 2), "prd.json", "application/json")}
                >
                  Download JSON
                </button>
              </div>
            </>
          ) : (
            <div className="card">
              <div className="mono">Awaiting Output</div>
              <p>Complete the interview and generate a PRD to see the feature table.</p>
            </div>
          )}
        </div>
      </section>

      <section className="section diagonal">
        <div className="container">
          <h2>Built for Technical and Non-Technical Teams</h2>
          <p>
            BriefKit enforces clarity: short, verifiable stories, explicit requirements, and scope boundaries.
            Use the CLI as a skill inside your tools, or the web app for guided interviews.
          </p>
        </div>
      </section>
    </main>
  );
}
