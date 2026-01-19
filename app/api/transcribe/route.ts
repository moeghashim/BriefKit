import OpenAI from "openai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing audio file" }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey });
  try {
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1"
    });
    return Response.json({ text: transcription.text || "" });
  } catch (error) {
    return Response.json({ error: "Transcription failed" }, { status: 500 });
  }
}
