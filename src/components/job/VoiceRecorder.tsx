import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type SR = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; start: () => void; stop: () => void;
};

function getSR(): SR | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}

export function VoiceRecorder({ onSave, onCancel }: { onSave: (audio: Blob | null, transcript: string, seconds: number) => Promise<void>; onCancel: () => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const sr = useRef<SR | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const active = useRef(false);

  useEffect(() => () => cleanup(), []);

  function cleanup() {
    active.current = false;
    if (timer.current) window.clearInterval(timer.current);
    try { sr.current?.stop(); } catch { /* ignore */ }
    stream.current?.getTracks().forEach((t) => t.stop());
  }

  async function start() {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const mime = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => setAudio(new Blob(chunks.current, { type: r.mimeType || "audio/mp4" }));
      r.start();
      rec.current = r;
      active.current = true;
      setSeconds(0);
      timer.current = window.setInterval(() => setSeconds((x) => x + 1), 1000);
      const recog = getSR();
      if (recog) {
        recog.lang = "de-CH";
        recog.continuous = true;
        recog.interimResults = true;
        recog.onresult = (e) => {
          let fin = "";
          let tmp = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) fin += res[0].transcript + " ";
            else tmp += res[0].transcript;
          }
          if (fin) setTranscript((t) => (t + " " + fin).trim());
          setInterim(tmp);
        };
        recog.onend = () => { if (active.current) try { recog.start(); } catch { /* ignore */ } };
        try { recog.start(); } catch { /* ignore */ }
        sr.current = recog;
      }
      setRecording(true);
    } catch {
      setError("Mikrofon nicht verfügbar. Bitte Zugriff erlauben.");
    }
  }

  function stop() {
    rec.current?.stop();
    cleanup();
    setInterim("");
    setRecording(false);
  }

  async function save() {
    setBusy(true);
    try { await onSave(audio, transcript.trim(), seconds); } finally { setBusy(false); }
  }

  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 py-2">
        {!recording ? (
          <button onClick={start} className="flex h-24 w-24 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md active:opacity-90" aria-label="Aufnahme starten">
            <Mic className="h-10 w-10" />
          </button>
        ) : (
          <button onClick={stop} className="flex h-24 w-24 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md" aria-label="Aufnahme stoppen">
            <Square className="h-9 w-9" fill="currentColor" />
          </button>
        )}
        <div className="font-mono text-lg">{mm}</div>
        <div className="text-sm text-muted-foreground">
          {recording ? "Aufnahme läuft – tippen zum Stoppen" : audio ? "Aufnahme gespeichert" : "Tippen zum Aufnehmen"}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <div>
        <label className="field-label">Transkript (bearbeitbar)</label>
        <Textarea
          value={transcript + (interim ? " " + interim : "")}
          onChange={(e) => setTranscript(e.target.value)}
          className="min-h-32 text-base"
          placeholder="Text erscheint hier während der Aufnahme oder kann manuell ergänzt werden."
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-12" onClick={() => { cleanup(); onCancel(); }}>Abbrechen</Button>
        <Button className="h-12 font-semibold" disabled={busy || recording || (!audio && !transcript.trim())} onClick={save}>Speichern</Button>
      </div>
    </div>
  );
}
