import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AttachmentUploaderProps {
  projectId: number;
  adrId?: number;
  onUploadComplete?: () => void;
}

export function AttachmentUploader({ projectId, adrId, onUploadComplete }: AttachmentUploaderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      if (adrId) formData.append("adrId", String(adrId));

      const res = await fetch(`/api/projects/${projectId}/attachments`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/attachments`] });
      if (adrId) {
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/adrs/${adrId}/attachments`] });
      }
      toast({ title: "File uploaded successfully" });
      onUploadComplete?.();
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
    e.target.value = "";
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
        isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
      }`}
    >
      {uploadMutation.isPending ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Uploading...</p>
        </div>
      ) : (
        <>
          <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-3">
            Drag and drop a file here, or click to select
          </p>
          <input
            type="file"
            id="file-upload"
            className="hidden"
            onChange={handleFileSelect}
            accept="image/png,image/jpeg,image/svg+xml,image/gif,application/pdf"
          />
          <label htmlFor="file-upload">
            <Button type="button" variant="outline" size="sm" asChild>
              <span>Choose File</span>
            </Button>
          </label>
          <p className="text-xs text-muted-foreground mt-2">
            PNG, JPEG, SVG, GIF, PDF (max 10MB)
          </p>
        </>
      )}
    </div>
  );
}
