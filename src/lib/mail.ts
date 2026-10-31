import { toast } from "sonner";
import { downloadFile } from "@/lib/pdf";

export type MailDraft = { to?: string | null | undefined; subject: string; body: string };

function shareFile(file: File, mail: MailDraft) {
  return navigator.share({ files: [file], title: mail.subject, text: mail.body });
}

function openMailto(mail: MailDraft) {
  const q = `subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
  window.location.href = `mailto:${encodeURIComponent(mail.to ?? "")}?${q}`;
}

/**
 * Puts the PDF into an e-mail. Where the device can share files (iPhone, iPad, Mac Safari, Windows),
 * the mail app opens with the PDF attached. Otherwise the PDF is downloaded and a prefilled mail opens,
 * so the file only needs to be dragged in. Returns true when the user did not cancel.
 */
export async function sendPdfByMail(file: File, mail: MailDraft): Promise<boolean> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await shareFile(file, mail);
      return true;
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError") return false;
      if (name === "NotAllowedError") {
        // Generating the PDF took too long for the browser; ask for one more tap.
        return new Promise((resolve) => {
          toast("PDF ist bereit", {
            duration: 20_000,
            action: { label: "Mail öffnen", onClick: () => { shareFile(file, mail).then(() => resolve(true), () => resolve(false)); } },
            onDismiss: () => resolve(false),
          });
        });
      }
    }
  }
  downloadFile(file);
  openMailto(mail);
  toast.message("PDF heruntergeladen – bitte im Mail anhängen");
  return true;
}

export function greeting(c?: { first_name?: string | null; last_name?: string | null; company_name?: string | null } | null) {
  const person = [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim();
  return person ? `Guten Tag ${person}` : "Guten Tag";
}

export function signature(s: { technician: string; company: string; phone?: string | null }) {
  return ["Freundliche Grüsse", s.technician, s.company, s.phone].filter(Boolean).join("\n");
}
