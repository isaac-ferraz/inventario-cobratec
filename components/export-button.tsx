"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function ExportButton() {
  const { toastErro } = useToast();
  const [carregando, setCarregando] = React.useState(false);

  async function exportar() {
    setCarregando(true);
    try {
      const res = await fetch("/api/export");
      if (!res.ok) throw new Error("Falha ao gerar Excel");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const data = new Date().toISOString().slice(0, 10);
      a.download = `inventario-cobratec-${data}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toastErro("Não foi possível gerar o Excel. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Button onClick={exportar} disabled={carregando}>
      {carregando ? (
        <Loader2 className="animate-spin" />
      ) : (
        <Download />
      )}
      Exportar Excel
    </Button>
  );
}
