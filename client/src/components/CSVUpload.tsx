/**
 * CSVUpload component
 * Lets users upload a pre-formatted CSV to populate the Application Data form,
 * or download the template to fill out offline.
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, Download, Upload, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { parseCSV, generateCSVTemplate, CSVRow } from "@/lib/csvParser";
import { ApplicationData } from "@/lib/labelVerifier";

interface CSVUploadProps {
  onSelect: (row: ApplicationData) => void;
}

export function CSVUpload({ onSelect }: CSVUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CSVRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  const handleDownloadTemplate = () => {
    const csv = generateCSVTemplate();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "TTB_Application_Template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parseCSV(text);
      setRows(result.rows);
      setErrors(result.errors);
      setExpanded(result.rows.length > 0);
      setSelectedRow(null);
    };
    reader.readAsText(file);
    // Reset input so same file can be re-uploaded
    e.target.value = "";
  };

  const handleSelectRow = (row: CSVRow, idx: number) => {
    setSelectedRow(idx);
    onSelect(row);
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header bar */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={15} className="text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground">Import from CSV</span>
          {rows.length > 0 && (
            <Badge className="text-[10px] h-4 px-1.5 border-0 bg-primary/10 text-primary">
              {rows.length} record{rows.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        {expanded ? (
          <ChevronUp size={14} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={14} className="text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="p-3 space-y-3 border-t">
          {/* Action row */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-7 flex-1"
              onClick={handleDownloadTemplate}
            >
              <Download size={12} className="mr-1.5" />
              Download Template
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-7 flex-1"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={12} className="mr-1.5" />
              Upload CSV
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Parse errors */}
          {errors.length > 0 && (
            <div className="space-y-1">
              {errors.map((e, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-yellow-700 dark:text-yellow-400">
                  <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                  <span>{e}</span>
                </div>
              ))}
            </div>
          )}

          {/* Row list */}
          {rows.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium px-0.5 mb-1">
                Click a row to load into form
              </p>
              {rows.map((row, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectRow(row, idx)}
                  className={`w-full text-left rounded-md px-3 py-2 border transition-colors text-xs ${
                    selectedRow === idx
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/40 hover:bg-muted/30"
                  }`}
                >
                  <span className="font-medium">{row.brandName}</span>
                  {row.classType && (
                    <span className="text-muted-foreground ml-1.5">· {row.classType}</span>
                  )}
                  {row.countryOfOrigin && (
                    <span className="text-muted-foreground ml-1.5">· {row.countryOfOrigin}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {rows.length === 0 && errors.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center py-2">
              Download the template, fill it out, then upload it here.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
