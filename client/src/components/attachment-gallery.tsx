import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, FileText, Download, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Attachment } from "@shared/schema";

interface AttachmentWithUrl extends Attachment {
  url: string;
}

interface AttachmentGalleryProps {
  projectId: number;
  adrId?: number;
  canDelete?: boolean;
}

export function AttachmentGallery({ projectId, adrId, canDelete = false }: AttachmentGalleryProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lightboxAttachment, setLightboxAttachment] = useState<AttachmentWithUrl | null>(null);

  const endpoint = adrId
    ? `/api/projects/${projectId}/adrs/${adrId}/attachments`
    : `/api/projects/${projectId}/attachments`;

  const { data: attachments = [], isLoading } = useQuery<AttachmentWithUrl[]>({
    queryKey: [endpoint],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/projects/${projectId}/attachments/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [endpoint] });
      toast({ title: "Attachment deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  if (attachments.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No attachments yet
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {attachments.map((attachment) => {
          const isImage = attachment.mimeType.startsWith("image/");
          const isPdf = attachment.mimeType === "application/pdf";

          return (
            <Card key={attachment.id} className="overflow-hidden group hover:shadow-md transition-shadow">
              <div className="relative aspect-square bg-muted flex items-center justify-center">
                {isImage ? (
                  <img
                    src={attachment.url}
                    alt={attachment.name}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setLightboxAttachment(attachment)}
                  />
                ) : isPdf ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="w-12 h-12 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">PDF</span>
                  </div>
                ) : null}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (isImage) {
                        setLightboxAttachment(attachment);
                      } else {
                        window.open(attachment.url, "_blank");
                      }
                    }}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    asChild
                  >
                    <a href={attachment.url} download={attachment.name}>
                      <Download className="w-4 h-4" />
                    </a>
                  </Button>
                  {canDelete && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (confirm("Delete this attachment?")) {
                          deleteMutation.mutate(attachment.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="p-2">
                <p className="text-xs truncate font-medium">{attachment.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(attachment.sizeBytes / 1024).toFixed(1)} KB
                </p>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!lightboxAttachment} onOpenChange={() => setLightboxAttachment(null)}>
        <DialogContent className="max-w-4xl">
          <DialogTitle className="sr-only">Image Preview</DialogTitle>
          {lightboxAttachment && (
            <div className="space-y-3">
              <img
                src={lightboxAttachment.url}
                alt={lightboxAttachment.name}
                className="w-full h-auto max-h-[70vh] object-contain"
              />
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{lightboxAttachment.name}</p>
                <Button size="sm" variant="outline" asChild>
                  <a href={lightboxAttachment.url} download={lightboxAttachment.name}>
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
