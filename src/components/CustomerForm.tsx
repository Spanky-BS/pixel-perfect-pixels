import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Customer } from "@/lib/app";

export type CustomerDraft = Pick<Customer, "company_name" | "first_name" | "last_name" | "street" | "zip" | "city" | "phone" | "email" | "notes">;

export const emptyCustomer: CustomerDraft = {
  company_name: "", first_name: "", last_name: "", street: "", zip: "", city: "", phone: "", email: "", notes: "",
};

export function useCustomerDraft(initial?: Partial<CustomerDraft>) {
  return useState<CustomerDraft>({ ...emptyCustomer, ...initial });
}

export function CustomerFields({ value, onChange }: { value: CustomerDraft; onChange: (v: CustomerDraft) => void }) {
  const f = (k: keyof CustomerDraft) => ({
    value: value[k] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [k]: e.target.value }),
  });
  return (
    <div className="space-y-3">
      <Field label="Firma / Kundenname"><Input className="h-12 text-base" {...f("company_name")} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vorname"><Input className="h-12 text-base" {...f("first_name")} /></Field>
        <Field label="Nachname"><Input className="h-12 text-base" {...f("last_name")} /></Field>
      </div>
      <Field label="Strasse"><Input className="h-12 text-base" autoComplete="street-address" {...f("street")} /></Field>
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Field label="PLZ"><Input className="h-12 text-base" inputMode="numeric" {...f("zip")} /></Field>
        <Field label="Ort"><Input className="h-12 text-base" {...f("city")} /></Field>
      </div>
      <Field label="Telefon"><Input className="h-12 text-base" type="tel" {...f("phone")} /></Field>
      <Field label="E-Mail"><Input className="h-12 text-base" type="email" {...f("email")} /></Field>
      <Field label="Notizen"><Textarea className="min-h-24 text-base" {...f("notes")} /></Field>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}
